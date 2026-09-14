import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { scoresSchema, uuid } from "../../../packages/validation/src";
import { AuthGuard, AuthRequest, allow, allowOperational } from "./auth";
import { Database } from "./database";
import { notifyStudent } from "./notifications";
import {
  editableGrades,
  enrolled,
  record,
  teachSubject,
  uniqueStudents,
} from "./academic-policy";
export type CategoryGrade = {
  name: string;
  weight: number;
  assessments: { name: string; score: number | null; max_score: number }[];
};
export function calculateFinalGrade(categories: CategoryGrade[]) {
  if (
    !categories.length ||
    Math.abs(categories.reduce((sum, c) => sum + c.weight, 0) - 100) > 0.0001
  )
    throw new BadRequestException("Total bobot penilaian harus tepat 100%");
  let total = 0;
  const details = categories.map((category) => {
    if (
      !Number.isFinite(category.weight) ||
      category.weight <= 0 ||
      !category.assessments.length
    )
      throw new BadRequestException(`Kategori ${category.name} belum lengkap`);
    const mean =
      category.assessments.reduce((sum, a) => {
        if (
          a.score === null ||
          !Number.isFinite(a.score) ||
          a.score < 0 ||
          !Number.isFinite(a.max_score) ||
          a.max_score <= 0 ||
          a.score > a.max_score
        )
          throw new BadRequestException(
            `Nilai ${a.name} belum lengkap atau tidak valid`,
          );
        return sum + (a.score / a.max_score) * 100;
      }, 0) / category.assessments.length;
    total += (mean * category.weight) / 100;
    return { ...category, average: Math.round(mean * 100) / 100 };
  });
  return { final_grade: Math.round(total * 100) / 100, details };
}
@Controller("api/v1/grades")
@UseGuards(AuthGuard)
export class GradebookController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("matrix")
  async matrix(@Req() req: AuthRequest, @Query("class_subject_id") id: string) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const tenant = req.actor.tenant_id;
    const subject = await teachSubject(this.db, req.actor, uuid.parse(id));
    const [assessments, students, scores, locked] = await Promise.all([
      this.db.query(
        `SELECT a.*,cat.weight/(SELECT count(*) FROM assessments sibling WHERE sibling.tenant_id=a.tenant_id AND sibling.category_id=a.category_id) weight FROM assessments a JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id WHERE cat.tenant_id=$1 AND cat.class_subject_id=$2 ORDER BY a.due_date,a.name,a.id`,
        [tenant, id],
      ),
      this.db.query(
        "SELECT s.id,s.nis,s.name FROM students s JOIN class_students cs ON cs.tenant_id=s.tenant_id AND cs.student_id=s.id WHERE cs.tenant_id=$1 AND cs.class_id=$2 ORDER BY s.name,s.nis",
        [tenant, subject.class_id],
      ),
      this.db.query(
        `SELECT sc.*,sc.updated_at::text version FROM student_scores sc JOIN assessments a ON a.tenant_id=sc.tenant_id AND a.id=sc.assessment_id JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id WHERE cat.tenant_id=$1 AND cat.class_subject_id=$2`,
        [tenant, id],
      ),
      this.db.query(
        "SELECT 1 FROM report_cards WHERE tenant_id=$1 AND class_id=$2 AND semester_id=$3 AND status<>'DRAFT' LIMIT 1",
        [tenant, subject.class_id, subject.semester_id],
      ),
    ]);
    return {
      assessments: assessments.rows,
      students: students.rows,
      scores: scores.rows,
      locked: Boolean(locked.rowCount),
    };
  }
  @Get("history")
  async history(
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const input = z
      .object({
        class_subject_id: uuid,
        student_id: uuid.optional(),
        assessment_id: uuid.optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(query);
    await teachSubject(this.db, req.actor, input.class_subject_id);
    const values = [
      req.actor.tenant_id,
      input.class_subject_id,
      input.student_id || null,
      input.assessment_id || null,
    ];
    const where =
      "tenant_id=$1 AND class_subject_id=$2 AND ($3::uuid IS NULL OR student_id=$3) AND ($4::uuid IS NULL OR assessment_id=$4)";
    const total = Number(
      (
        await this.db.query(
          `SELECT count(*) FROM student_score_history WHERE ${where}`,
          values,
        )
      ).rows[0].count,
    );
    const rows = (
      await this.db.query(
        `SELECT * FROM student_score_history WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $5`,
        [...values, (input.page - 1) * 50],
      )
    ).rows;
    return { data: rows, total, page: input.page, limit: 50 };
  }
  @Put("cell")
  async saveCell(@Req() req: AuthRequest, @Body() body: unknown) {
    allowOperational(req.actor);
    allow(req.actor, "grade.write");
    const input = z
      .object({
        assessment_id: uuid,
        student_id: uuid,
        score: z.number().min(0).max(10000).multipleOf(0.001).nullable(),
        expected_version: z.string().max(100).nullable(),
      })
      .strict()
      .parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const tenant = req.actor.tenant_id;
      const assessment = await record(
        sql,
        "assessments",
        tenant,
        input.assessment_id,
      );
      const category = await record(
        sql,
        "assessment_categories",
        tenant,
        assessment.category_id,
      );
      const subject = await teachSubject(
        sql,
        req.actor,
        category.class_subject_id,
      );
      await enrolled(sql, tenant, subject.class_id, input.student_id);
      if (input.score !== null && input.score > Number(assessment.max_score))
        throw new BadRequestException(
          `Nilai maksimum ${assessment.name} adalah ${assessment.max_score}`,
        );
      const current = (
        await sql.query(
          "SELECT *,updated_at::text version FROM student_scores WHERE tenant_id=$1 AND assessment_id=$2 AND student_id=$3",
          [tenant, input.assessment_id, input.student_id],
        )
      ).rows[0];
      if ((current?.version || null) !== input.expected_version)
        throw new ConflictException(
          "Nilai telah diubah oleh sesi lain. Muat ulang tabel sebelum mengedit kembali.",
        );
      if ((current?.score ?? null) === input.score)
        return {
          score: input.score,
          version: current?.version || null,
          changed: false,
        };
      await editableGrades(sql, tenant, subject.class_id, subject.semester_id);
      await sql.query("SELECT set_config('app.grade_actor_id',$1,true)", [
        req.actor.id,
      ]);
      if (input.score === null) {
        await sql.query(
          "DELETE FROM student_scores WHERE tenant_id=$1 AND assessment_id=$2 AND student_id=$3",
          [tenant, input.assessment_id, input.student_id],
        );
        return { score: null, version: null, changed: true };
      }
      const row = (
        await sql.query(
          `INSERT INTO student_scores(tenant_id,assessment_id,student_id,score,updated_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant_id,assessment_id,student_id) DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=clock_timestamp() RETURNING score,updated_at::text version`,
          [
            tenant,
            input.assessment_id,
            input.student_id,
            input.score,
            req.actor.id,
          ],
        )
      ).rows[0];
      return { ...row, changed: true };
    });
  }
  @Get() async get(
    @Req() req: AuthRequest,
    @Query("assessment_id") id: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const assessment = await record(
      this.db,
      "assessments",
      req.actor.tenant_id,
      uuid.parse(id),
    );
    const category = await record(
      this.db,
      "assessment_categories",
      req.actor.tenant_id,
      assessment.category_id,
    );
    await teachSubject(this.db, req.actor, category.class_subject_id);
    return {
      data: (
        await this.db.query(
          "SELECT * FROM student_scores WHERE tenant_id=$1 AND assessment_id=$2",
          [req.actor.tenant_id, id],
        )
      ).rows,
    };
  }
  @Put() async save(@Req() req: AuthRequest, @Body() body: unknown) {
    allowOperational(req.actor);
    allow(req.actor, "grade.write");
    const input = scoresSchema.parse(body);
    uniqueStudents(input.scores);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const tenant = req.actor.tenant_id;
      const assessment = await record(
        sql,
        "assessments",
        tenant,
        input.assessment_id,
      );
      const category = await record(
        sql,
        "assessment_categories",
        tenant,
        assessment.category_id,
      );
      const subject = await teachSubject(
        sql,
        req.actor,
        category.class_subject_id,
      );
      await editableGrades(sql, tenant, subject.class_id, subject.semester_id);
      for (const item of input.scores) {
        await enrolled(sql, tenant, subject.class_id, item.student_id);
        if (item.score > Number(assessment.max_score))
          throw new BadRequestException(
            `Nilai melebihi maksimum ${assessment.max_score}`,
          );
        await sql.query(
          `INSERT INTO student_scores(tenant_id,assessment_id,student_id,score,updated_by) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,assessment_id,student_id) DO UPDATE SET score=EXCLUDED.score,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [
            tenant,
            input.assessment_id,
            item.student_id,
            item.score,
            req.actor.id,
          ],
        );
        await notifyStudent(
          sql,
          tenant,
          item.student_id,
          "Nilai diperbarui",
          `Nilai ${assessment.name} sudah tersedia.`,
          {
            type: "GRADE",
            student_id: item.student_id,
            assessment_id: input.assessment_id,
          },
          `grade:${input.assessment_id}:${item.student_id}:${item.score}`,
        );
      }
      return {
        data: (
          await sql.query(
            "SELECT * FROM student_scores WHERE tenant_id=$1 AND assessment_id=$2",
            [tenant, input.assessment_id],
          )
        ).rows,
      };
    });
  }
}
