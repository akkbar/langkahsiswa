import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { date, uuid } from "../../../packages/validation/src";
import {
  allow,
  allowOperational,
  AuthGuard,
  type AuthRequest,
  isAdmin,
} from "./auth";
import { Database, type Sql } from "./database";
import { editableGrades, record, teachSubject } from "./academic-policy";
export const defaultAssessmentItems = [
  { name: "PR", weight: 10 },
  { name: "Ujian 1", weight: 5 },
  { name: "Ujian 2", weight: 5 },
  { name: "Ujian 3", weight: 5 },
  { name: "UTS", weight: 20 },
  { name: "Ujian 4", weight: 5 },
  { name: "Ujian 5", weight: 5 },
  { name: "Ujian 6", weight: 5 },
  { name: "UAS", weight: 30 },
  { name: "Remidi", weight: 10 },
];
const itemSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(120),
    weight: z.number().min(0.001).max(100).multipleOf(0.001),
    max_score: z.number().positive().max(10000),
    due_date: date,
  })
  .strict();
const planSchema = z
  .object({ revision: z.string(), items: z.array(itemSchema).min(1).max(100) })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Math.abs(value.items.reduce((sum, i) => sum + i.weight, 0) - 100) >
      0.00001
    )
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Total bobot harus tepat 100%",
      });
    if (
      new Set(value.items.map((i) => i.name.toLocaleLowerCase("id-ID")))
        .size !== value.items.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Nama item penilaian tidak boleh duplikat",
      });
    const ids = value.items.flatMap((i) => (i.id ? [i.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Item penilaian duplikat",
      });
  });
async function plan(sql: Sql, tenant: string, subjectId: string) {
  const rows = (
    await sql.query(
      `SELECT a.*,cat.weight category_weight,cat.id category_id,
 (SELECT count(*)::int FROM assessments sibling WHERE sibling.tenant_id=a.tenant_id AND sibling.category_id=a.category_id) sibling_count,
 (SELECT count(*)::int FROM student_scores sc WHERE sc.tenant_id=a.tenant_id AND sc.assessment_id=a.id) score_count,
 (SELECT max(sc.score) FROM student_scores sc WHERE sc.tenant_id=a.tenant_id AND sc.assessment_id=a.id) highest_score
 FROM assessments a JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id
 WHERE a.tenant_id=$1 AND cat.class_subject_id=$2 ORDER BY a.due_date,a.name,a.id`,
      [tenant, subjectId],
    )
  ).rows;
  const categories = (
    await sql.query(
      "SELECT id,name,weight FROM assessment_categories WHERE tenant_id=$1 AND class_subject_id=$2 ORDER BY id",
      [tenant, subjectId],
    )
  ).rows;
  const revision = createHash("sha256")
    .update(JSON.stringify({ rows, categories }))
    .digest("hex");
  return {
    items: rows.map((row) => ({
      ...row,
      weight: Number(row.category_weight) / row.sibling_count,
    })),
    revision,
  };
}
@Controller("api/v1/assessment-plans")
@UseGuards(AuthGuard)
export class AssessmentPlansController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get()
  async subjects(@Req() req: AuthRequest) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const tenant = req.actor.tenant_id;
    const teacher = (
      await this.db.query(
        "SELECT id FROM teachers WHERE tenant_id=$1 AND user_id=$2",
        [tenant, req.actor.id],
      )
    ).rows[0];
    const all = isAdmin(req.actor);
    const rows = (
      await this.db.query(
        `SELECT cs.*,c.name class_name,s.name subject_name,t.name teacher_name,sem.name semester_name,y.name year_name,sem.start_date,sem.end_date,
 (SELECT count(*)::int FROM assessments a JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id WHERE cat.tenant_id=cs.tenant_id AND cat.class_subject_id=cs.id) item_count
 FROM class_subjects cs JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN teachers t ON t.tenant_id=cs.tenant_id AND t.id=cs.teacher_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id JOIN academic_years y ON y.tenant_id=sem.tenant_id AND y.id=sem.academic_year_id
 WHERE cs.tenant_id=$1 AND ($3::boolean OR t.user_id=$2) ORDER BY sem.start_date DESC,c.name,s.name`,
        [tenant, req.actor.id, all],
      )
    ).rows;
    return {
      subjects: rows,
      current_teacher_id: teacher?.id || null,
      can_view_all: all,
    };
  }
  @Get(":id")
  async get(@Req() req: AuthRequest, @Param("id") id: string) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const subject = await teachSubject(this.db, req.actor, uuid.parse(id));
    const semester = await record(
      this.db,
      "semesters",
      req.actor.tenant_id,
      subject.semester_id,
    );
    const data = await plan(this.db, req.actor.tenant_id, id);
    const start = new Date(semester.start_date + "T00:00:00Z").getTime(),
      end = new Date(semester.end_date + "T00:00:00Z").getTime();
    const defaults = defaultAssessmentItems.map((item, index) => ({
      ...item,
      max_score: 100,
      due_date: new Date(
        start +
          ((end - start) * (index + 1)) / (defaultAssessmentItems.length + 1),
      )
        .toISOString()
        .slice(0, 10),
    }));
    const locked = Boolean(
      (
        await this.db.query(
          "SELECT 1 FROM report_cards WHERE tenant_id=$1 AND class_id=$2 AND semester_id=$3 AND status<>'DRAFT' LIMIT 1",
          [req.actor.tenant_id, subject.class_id, subject.semester_id],
        )
      ).rowCount,
    );
    return { ...data, defaults, semester, locked };
  }
  @Put(":id")
  async save(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "grade.read");
    const input = planSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const tenant = req.actor.tenant_id;
      const subject = await teachSubject(sql, req.actor, uuid.parse(id));
      const current = await plan(sql, tenant, id);
      if (current.revision !== input.revision)
        throw new ConflictException(
          "Data penilaian atau nilai siswa berubah. Tutup editor dan muat ulang sebelum menyimpan.",
        );
      const before = new Map(current.items.map((item) => [item.id, item]));
      const retained = new Set(
        input.items.flatMap((item) => (item.id ? [item.id] : [])),
      );
      const removed = current.items.filter((item) => !retained.has(item.id));
      for (const item of input.items) {
        if (item.id && !before.has(item.id))
          throw new BadRequestException("Item bukan milik pelajaran kelas ini");
        if (!item.id) allow(req.actor, "grade.create");
        else allow(req.actor, "grade.update");
      }
      if (removed.length) allow(req.actor, "grade.delete");
      if (removed.some((item) => item.score_count > 0))
        throw new ConflictException(
          "Item yang sudah memiliki nilai siswa tidak dapat dihapus.",
        );
      const semester = await record(
        sql,
        "semesters",
        tenant,
        subject.semester_id,
      );
      for (const item of input.items) {
        if (
          item.due_date < semester.start_date ||
          item.due_date > semester.end_date
        )
          throw new BadRequestException(
            `Tanggal ${item.name} harus dalam semester`,
          );
        if (
          item.id &&
          Number(before.get(item.id)?.highest_score || 0) > item.max_score
        )
          throw new BadRequestException(
            `Nilai maksimum ${item.name} lebih kecil dari nilai siswa tersimpan`,
          );
      }
      await editableGrades(sql, tenant, subject.class_id, subject.semester_id);
      const oldCategories = (
        await sql.query(
          "SELECT id FROM assessment_categories WHERE tenant_id=$1 AND class_subject_id=$2",
          [tenant, id],
        )
      ).rows.map((row) => row.id);
      for (const item of removed)
        await sql.query(
          "DELETE FROM assessments WHERE tenant_id=$1 AND id=$2",
          [tenant, item.id],
        );
      // One category per item makes each item weight feed the existing report calculation directly.
      // Existing assessment IDs and their student scores are preserved, including legacy shared categories.
      const renamed: { id: string; name: string }[] = [];
      for (const item of input.items) {
        const category = (
          await sql.query(
            "INSERT INTO assessment_categories(tenant_id,class_subject_id,name,weight) VALUES($1,$2,$3,$4) RETURNING id",
            [tenant, id, `item-${randomUUID()}`, item.weight],
          )
        ).rows[0];
        renamed.push({ id: category.id, name: item.name });
        if (item.id)
          await sql.query(
            "UPDATE assessments SET category_id=$3,name=$4,max_score=$5,due_date=$6 WHERE tenant_id=$1 AND id=$2",
            [
              tenant,
              item.id,
              category.id,
              item.name,
              item.max_score,
              item.due_date,
            ],
          );
        else
          await sql.query(
            "INSERT INTO assessments(tenant_id,category_id,name,max_score,due_date) VALUES($1,$2,$3,$4,$5)",
            [tenant, category.id, item.name, item.max_score, item.due_date],
          );
      }
      if (oldCategories.length)
        await sql.query(
          "DELETE FROM assessment_categories WHERE tenant_id=$1 AND id=ANY($2::uuid[])",
          [tenant, oldCategories],
        );
      for (const category of renamed)
        await sql.query(
          "UPDATE assessment_categories SET name=$3 WHERE tenant_id=$1 AND id=$2",
          [tenant, category.id, category.name],
        );
      return { ...(await plan(sql, tenant, id)), saved: true };
    });
  }
}
