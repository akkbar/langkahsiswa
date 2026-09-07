import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { scoresSchema, uuid } from "../../../packages/validation/src";
import { AuthGuard, AuthRequest, allow } from "./auth";
import { Database } from "./database";
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
  @Get() async get(
    @Req() req: AuthRequest,
    @Query("assessment_id") id: string,
  ) {
    allow(req.actor, "grade.read");
    await record(this.db, "assessments", req.actor.tenant_id, uuid.parse(id));
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
