import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Database, type Sql } from "./database";
import { allow, allowOperational, AuthGuard, type AuthRequest } from "./auth";

const setupSteps = [
  ["identity", "FOUNDATION"],
  ["calendar", "FOUNDATION"],
  ["structure", "SCHOOL"],
  ["promotion", "OPERATIONAL"],
  ["subjects", "SCHOOL"],
  ["teacher_assignments", "OPERATIONAL"],
  ["schedule", "OPERATIONAL"],
  ["assessment_grading", "SCHOOL"],
  ["attendance", "SCHOOL"],
  ["student_fees", "SCHOOL"],
  ["activities_operations", "OPERATIONAL"],
  ["review", "FOUNDATION"],
] as const;
const stepKeys = new Set(setupSteps.map(([key]) => key));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createSchema = z
  .object({
    school_id: z.string().uuid(),
    name: z.string().trim().min(3).max(30),
    start_date: date,
    end_date: date,
    semester_name: z.string().trim().min(1).max(40).default("Ganjil"),
    semester_start_date: date,
    semester_end_date: date,
    source_academic_year_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => value.start_date < value.end_date, {
    message: "Tanggal akhir tahun ajaran harus setelah tanggal mulai",
  })
  .refine(
    (value) =>
      value.semester_start_date >= value.start_date &&
      value.semester_end_date <= value.end_date &&
      value.semester_start_date < value.semester_end_date,
    { message: "Tanggal semester harus berada di dalam tahun ajaran" },
  );
const stepSchema = z
  .object({
    payload: z.record(z.unknown()),
    complete: z.boolean().default(false),
  })
  .strict();

const formationSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(160),
      grade_level_id: z.string().uuid(),
      classroom_id: z.string().uuid(),
      homeroom_teacher_id: z.string().uuid().nullable().optional(),
      capacity: z.number().int().positive().nullable().optional(),
    }),
  )
  .max(200);
const curriculumSchema = z
  .array(
    z.object({
      subject_id: z.string().uuid(),
      grade_level_id: z.string().uuid(),
      weekly_hours: z.number().int().positive(),
      period_minutes: z.number().int().positive(),
      subject_type: z.enum(["REQUIRED", "ELECTIVE"]),
      category: z.string().trim().max(100).nullable().optional(),
    }),
  )
  .max(500);
const enrollmentSchema = z
  .array(
    z.object({
      student_id: z.string().uuid(),
      grade_level_id: z.string().uuid(),
      classroom_id: z.string().uuid().nullable().optional(),
      enrollment_status: z.enum([
        "ACTIVE",
        "RETAINED",
        "TRANSFERRED",
        "GRADUATED",
        "WITHDRAWN",
        "NEW",
      ]),
    }),
  )
  .max(5000);
const assignmentSchema = z
  .array(
    z.object({
      teacher_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      classroom_id: z.string().uuid(),
      weekly_hours: z.number().int().positive(),
    }),
  )
  .max(2000);
const calendarSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(200),
      event_type: z.enum([
        "EFFECTIVE_DAY",
        "NATIONAL_HOLIDAY",
        "SCHOOL_HOLIDAY",
        "MPLS",
        "MIDTERM",
        "FINAL",
        "REPORT",
        "PROMOTION",
        "GRADUATION",
        "SCHOOL_EVENT",
        "ANNOUNCEMENT",
        "PARENT_MEETING",
        "TEACHER_MEETING",
        "STUDENT_ACTIVITY",
        "DEADLINE",
        "REMINDER",
      ]),
      start_date: date,
      end_date: date,
      notes: z.string().trim().max(500).nullable().optional(),
    }),
  )
  .max(500);

async function requireSchoolRecords(
  sql: Sql,
  table: string,
  tenantId: string,
  schoolId: string,
  ids: string[],
) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const count = (
    await sql.query(
      `SELECT count(*)::int value FROM ${table} WHERE tenant_id=$1 AND school_id=$2 AND id=ANY($3::uuid[])`,
      [tenantId, schoolId, unique],
    )
  ).rows[0].value;
  if (count !== unique.length)
    throw new BadRequestException(
      "Data formasi harus berasal dari sekolah yang sedang disiapkan",
    );
}

async function requireYearClasses(
  sql: Sql,
  tenantId: string,
  academicYearId: string,
  ids: string[],
) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const count = (
    await sql.query(
      "SELECT count(*)::int value FROM classes WHERE tenant_id=$1 AND academic_year_id=$2 AND id=ANY($3::uuid[])",
      [tenantId, academicYearId, unique],
    )
  ).rows[0].value;
  if (count !== unique.length)
    throw new BadRequestException(
      "Formasi kelas harus berasal dari tahun ajaran yang sedang disiapkan",
    );
}

async function materializeStep(
  sql: Sql,
  tenantId: string,
  setup: any,
  stepKey: string,
  payload: Record<string, unknown>,
) {
  if (stepKey === "calendar") {
    const items = calendarSchema.parse(payload.events || []);
    if (items.some((item) => item.start_date > item.end_date))
      throw new BadRequestException(
        "Tanggal akhir agenda harus setelah tanggal mulai",
      );
    if (
      items.some(
        (item) =>
          item.start_date < setup.start_date || item.end_date > setup.end_date,
      )
    )
      throw new BadRequestException(
        "Agenda harus berada di dalam periode tahun ajaran",
      );
    await sql.query(
      "DELETE FROM academic_calendar_events WHERE tenant_id=$1 AND academic_year_id=$2",
      [tenantId, setup.academic_year_id],
    );
    for (const item of items)
      await sql.query(
        `INSERT INTO academic_calendar_events(tenant_id,academic_year_id,title,event_type,start_date,end_date,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          tenantId,
          setup.academic_year_id,
          item.title,
          item.event_type,
          item.start_date,
          item.end_date,
          item.notes || null,
        ],
      );
  } else if (stepKey === "structure") {
    const items = formationSchema.parse(payload.formations || []);
    await requireSchoolRecords(
      sql,
      "grade_levels",
      tenantId,
      setup.school_id,
      items.map((item) => item.grade_level_id),
    );
    await requireSchoolRecords(
      sql,
      "classrooms",
      tenantId,
      setup.school_id,
      items.map((item) => item.classroom_id),
    );
    for (const item of items)
      await sql.query(
        `INSERT INTO classes(tenant_id,academic_year_id,grade_level_id,name,homeroom_teacher_id,classroom_id,capacity)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(tenant_id,academic_year_id,name) DO UPDATE SET
          grade_level_id=excluded.grade_level_id,homeroom_teacher_id=excluded.homeroom_teacher_id,
          classroom_id=excluded.classroom_id,capacity=excluded.capacity`,
        [
          tenantId,
          setup.academic_year_id,
          item.grade_level_id,
          item.name,
          item.homeroom_teacher_id || null,
          item.classroom_id,
          item.capacity || null,
        ],
      );
  } else if (stepKey === "subjects") {
    const items = curriculumSchema.parse(payload.items || []);
    await requireSchoolRecords(
      sql,
      "subjects",
      tenantId,
      setup.school_id,
      items.map((item) => item.subject_id),
    );
    await requireSchoolRecords(
      sql,
      "grade_levels",
      tenantId,
      setup.school_id,
      items.map((item) => item.grade_level_id),
    );
    await sql.query(
      "DELETE FROM year_subject_curricula WHERE tenant_id=$1 AND academic_year_id=$2",
      [tenantId, setup.academic_year_id],
    );
    for (const item of items)
      await sql.query(
        `INSERT INTO year_subject_curricula(tenant_id,academic_year_id,subject_id,grade_level_id,weekly_hours,period_minutes,subject_type,category)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId,
          setup.academic_year_id,
          item.subject_id,
          item.grade_level_id,
          item.weekly_hours,
          item.period_minutes,
          item.subject_type,
          item.category || null,
        ],
      );
  } else if (stepKey === "promotion") {
    const items = enrollmentSchema.parse(payload.enrollments || []);
    await requireSchoolRecords(
      sql,
      "grade_levels",
      tenantId,
      setup.school_id,
      items.map((item) => item.grade_level_id),
    );
    await requireYearClasses(
      sql,
      tenantId,
      setup.academic_year_id,
      items.map((item) => item.classroom_id || ""),
    );
    await sql.query(
      "DELETE FROM student_enrollments WHERE tenant_id=$1 AND academic_year_id=$2",
      [tenantId, setup.academic_year_id],
    );
    await sql.query(
      "DELETE FROM class_students WHERE tenant_id=$1 AND academic_year_id=$2",
      [tenantId, setup.academic_year_id],
    );
    for (const item of items)
      await sql.query(
        `INSERT INTO student_enrollments(tenant_id,student_id,academic_year_id,school_id,grade_level_id,classroom_id,enrollment_status)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          tenantId,
          item.student_id,
          setup.academic_year_id,
          setup.school_id,
          item.grade_level_id,
          item.classroom_id || null,
          item.enrollment_status,
        ],
      );
    for (const item of items.filter(
      (entry) =>
        entry.classroom_id &&
        ["ACTIVE", "NEW", "RETAINED"].includes(entry.enrollment_status),
    ))
      await sql.query(
        `INSERT INTO class_students(tenant_id,class_id,student_id,academic_year_id)
         VALUES($1,$2,$3,$4)`,
        [tenantId, item.classroom_id, item.student_id, setup.academic_year_id],
      );
  } else if (stepKey === "teacher_assignments") {
    const items = assignmentSchema.parse(payload.assignments || []);
    await requireSchoolRecords(
      sql,
      "subjects",
      tenantId,
      setup.school_id,
      items.map((item) => item.subject_id),
    );
    await requireYearClasses(
      sql,
      tenantId,
      setup.academic_year_id,
      items.map((item) => item.classroom_id),
    );
    await sql.query(
      "DELETE FROM teacher_assignments WHERE tenant_id=$1 AND academic_year_id=$2",
      [tenantId, setup.academic_year_id],
    );
    for (const item of items)
      await sql.query(
        `INSERT INTO teacher_assignments(tenant_id,academic_year_id,teacher_id,subject_id,classroom_id,weekly_hours)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          tenantId,
          setup.academic_year_id,
          item.teacher_id,
          item.subject_id,
          item.classroom_id,
          item.weekly_hours,
        ],
      );
    const semesterIds = (
      await sql.query(
        "SELECT id FROM semesters WHERE tenant_id=$1 AND academic_year_id=$2",
        [tenantId, setup.academic_year_id],
      )
    ).rows.map((row) => row.id);
    for (const item of items) {
      await sql.query(
        `INSERT INTO teacher_subjects(tenant_id,teacher_id,subject_id)
         VALUES($1,$2,$3) ON CONFLICT(tenant_id,teacher_id,subject_id) DO NOTHING`,
        [tenantId, item.teacher_id, item.subject_id],
      );
      for (const semesterId of semesterIds)
        await sql.query(
          `INSERT INTO class_subjects(tenant_id,class_id,subject_id,teacher_id,semester_id)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(tenant_id,class_id,subject_id,semester_id) DO UPDATE SET teacher_id=excluded.teacher_id`,
          [
            tenantId,
            item.classroom_id,
            item.subject_id,
            item.teacher_id,
            semesterId,
          ],
        );
    }
  }
}

async function findSetup(sql: Sql, tenantId: string, id: string) {
  const row = (
    await sql.query(
      `SELECT s.*,y.name,y.start_date,y.end_date,y.is_active,
              sc.name school_name,src.name source_name
       FROM academic_year_setups s
       JOIN academic_years y ON y.tenant_id=s.tenant_id AND y.id=s.academic_year_id
       JOIN schools sc ON sc.tenant_id=s.tenant_id AND sc.id=s.school_id
       LEFT JOIN academic_years src ON src.tenant_id=s.tenant_id AND src.id=s.source_academic_year_id
       WHERE s.tenant_id=$1 AND s.id=$2`,
      [tenantId, id],
    )
  ).rows[0];
  if (!row) throw new NotFoundException("Setup tahun ajaran tidak ditemukan");
  return row;
}

async function activationChecks(sql: Sql, tenantId: string, setup: any) {
  const counts = (
    await sql.query(
      `SELECT
        (SELECT count(*)::int FROM academic_year_setup_steps WHERE tenant_id=$1 AND setup_id=$2 AND step_order<12 AND status='COMPLETE') completed_steps,
        (SELECT count(*)::int FROM semesters WHERE tenant_id=$1 AND academic_year_id=$3) semesters,
        (SELECT count(*)::int FROM classes WHERE tenant_id=$1 AND academic_year_id=$3) classes,
        (SELECT count(*)::int FROM classes WHERE tenant_id=$1 AND academic_year_id=$3 AND homeroom_teacher_id IS NULL) classes_without_homeroom,
        (SELECT count(*)::int FROM student_enrollments WHERE tenant_id=$1 AND academic_year_id=$3) students,
        (SELECT count(*)::int FROM teacher_assignments WHERE tenant_id=$1 AND academic_year_id=$3) teachers,
        (SELECT count(*)::int FROM year_subject_curricula WHERE tenant_id=$1 AND academic_year_id=$3) subjects,
        (SELECT count(*)::int FROM academic_calendar_events WHERE tenant_id=$1 AND academic_year_id=$3) calendar_events`,
      [tenantId, setup.id, setup.academic_year_id],
    )
  ).rows[0];
  const checks = [
    {
      key: "steps",
      severity: "ERROR",
      passed: counts.completed_steps === 11,
      label: `${counts.completed_steps}/11 langkah persiapan selesai`,
    },
    {
      key: "semester",
      severity: "ERROR",
      passed: counts.semesters > 0,
      label: `${counts.semesters} semester awal tersedia`,
    },
    {
      key: "classes",
      severity: "WARNING",
      passed: counts.classes > 0,
      label: `${counts.classes} rombel dibuat`,
    },
    {
      key: "homeroom",
      severity: "WARNING",
      passed: counts.classes > 0 && counts.classes_without_homeroom === 0,
      label: `${counts.classes_without_homeroom} rombel belum memiliki wali kelas`,
    },
    {
      key: "students",
      severity: "WARNING",
      passed: counts.students > 0,
      label: `${counts.students} siswa ditempatkan`,
    },
    {
      key: "teachers",
      severity: "WARNING",
      passed: counts.teachers > 0,
      label: `${counts.teachers} penugasan guru dibuat`,
    },
    {
      key: "subjects",
      severity: "WARNING",
      passed: counts.subjects > 0,
      label: `${counts.subjects} kurikulum mata pelajaran disiapkan`,
    },
    {
      key: "calendar",
      severity: "WARNING",
      passed: counts.calendar_events > 0,
      label: `${counts.calendar_events} agenda kalender dibuat`,
    },
  ];
  return {
    checks,
    can_activate: !checks.some(
      (check) => check.severity === "ERROR" && !check.passed,
    ),
  };
}

@Controller("api/v1/academic-year-setups")
@UseGuards(AuthGuard)
export class AcademicYearSetupController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get()
  async list(
    @Req() req: AuthRequest,
    @Query("page") pageValue = "1",
    @Query("limit") limitValue = "20",
    @Query("search") search = "",
  ) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.read");
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 20));
    const params = [
      req.actor.tenant_id,
      `%${search}%`,
      limit,
      (page - 1) * limit,
    ];
    const [rows, total] = await Promise.all([
      this.db.query(
        `SELECT s.id,s.school_id,s.academic_year_id,s.status,s.current_step,s.updated_at,
                y.name,y.start_date,y.end_date,sc.name school_name,
                count(st.step_key) FILTER (WHERE st.status='COMPLETE')::int completed_steps
         FROM academic_year_setups s
         JOIN academic_years y ON y.tenant_id=s.tenant_id AND y.id=s.academic_year_id
         JOIN schools sc ON sc.tenant_id=s.tenant_id AND sc.id=s.school_id
         LEFT JOIN academic_year_setup_steps st ON st.tenant_id=s.tenant_id AND st.setup_id=s.id
         WHERE s.tenant_id=$1 AND (y.name ILIKE $2 OR sc.name ILIKE $2)
         GROUP BY s.id,y.name,y.start_date,y.end_date,sc.name
         ORDER BY y.start_date DESC LIMIT $3 OFFSET $4`,
        params,
      ),
      this.db.query(
        `SELECT count(*)::int total FROM academic_year_setups s
         JOIN academic_years y ON y.tenant_id=s.tenant_id AND y.id=s.academic_year_id
         JOIN schools sc ON sc.tenant_id=s.tenant_id AND sc.id=s.school_id
         WHERE s.tenant_id=$1 AND (y.name ILIKE $2 OR sc.name ILIKE $2)`,
        params.slice(0, 2),
      ),
    ]);
    return { data: rows.rows, total: total.rows[0].total, page, limit };
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.create");
    const input = createSchema.parse(body);
    return this.db
      .transaction(req.actor.tenant_id, async (sql) => {
        const school = await sql.query(
          "SELECT id FROM schools WHERE tenant_id=$1 AND id=$2",
          [req.actor.tenant_id, input.school_id],
        );
        if (!school.rowCount)
          throw new NotFoundException("Sekolah tidak ditemukan");
        if (input.source_academic_year_id) {
          const source = await sql.query(
            "SELECT id FROM academic_years WHERE tenant_id=$1 AND id=$2 AND school_id=$3",
            [
              req.actor.tenant_id,
              input.source_academic_year_id,
              input.school_id,
            ],
          );
          if (!source.rowCount)
            throw new BadRequestException(
              "Tahun sumber harus berasal dari sekolah yang sama",
            );
        }
        const year = (
          await sql.query(
            `INSERT INTO academic_years(tenant_id,school_id,name,start_date,end_date,status)
           VALUES($1,$2,$3,$4,$5,'PREPARATION') RETURNING *`,
            [
              req.actor.tenant_id,
              input.school_id,
              input.name,
              input.start_date,
              input.end_date,
            ],
          )
        ).rows[0];
        await sql.query(
          `INSERT INTO semesters(tenant_id,academic_year_id,name,start_date,end_date)
         VALUES($1,$2,$3,$4,$5)`,
          [
            req.actor.tenant_id,
            year.id,
            input.semester_name,
            input.semester_start_date,
            input.semester_end_date,
          ],
        );
        const setup = (
          await sql.query(
            `INSERT INTO academic_year_setups(tenant_id,school_id,academic_year_id,source_academic_year_id,status,current_step,created_by)
           VALUES($1,$2,$3,$4,'PREPARATION',2,$5) RETURNING *`,
            [
              req.actor.tenant_id,
              input.school_id,
              year.id,
              input.source_academic_year_id || null,
              req.actor.id,
            ],
          )
        ).rows[0];
        for (let index = 0; index < setupSteps.length; index++) {
          const [key, level] = setupSteps[index];
          let payload: Record<string, unknown> = {};
          if (key === "identity") payload = input;
          else if (input.source_academic_year_id && key !== "review") {
            payload =
              (
                await sql.query(
                  `SELECT st.payload FROM academic_year_setup_steps st
                 JOIN academic_year_setups old ON old.tenant_id=st.tenant_id AND old.id=st.setup_id
                 WHERE old.tenant_id=$1 AND old.academic_year_id=$2 AND st.step_key=$3`,
                  [req.actor.tenant_id, input.source_academic_year_id, key],
                )
              ).rows[0]?.payload || {};
          }
          await sql.query(
            `INSERT INTO academic_year_setup_steps(tenant_id,setup_id,step_key,step_order,setup_level,status,payload,reviewed_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              req.actor.tenant_id,
              setup.id,
              key,
              index + 1,
              level,
              key === "identity" ? "COMPLETE" : "PENDING",
              payload,
              key === "identity" ? new Date() : null,
            ],
          );
        }
        return findSetup(sql, req.actor.tenant_id, setup.id);
      })
      .catch((error: any) => {
        if (error?.code === "23505")
          throw new ConflictException("Nama tahun ajaran sudah digunakan");
        throw error;
      });
  }

  @Get(":id")
  async detail(@Req() req: AuthRequest, @Param("id") id: string) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.read");
    z.string().uuid().parse(id);
    const setup = await findSetup(this.db, req.actor.tenant_id, id);
    const [
      steps,
      semesters,
      checks,
      classrooms,
      gradeLevels,
      subjects,
      teachers,
      students,
      formations,
    ] = await Promise.all([
      this.db.query(
        "SELECT * FROM academic_year_setup_steps WHERE tenant_id=$1 AND setup_id=$2 ORDER BY step_order",
        [req.actor.tenant_id, id],
      ),
      this.db.query(
        "SELECT * FROM semesters WHERE tenant_id=$1 AND academic_year_id=$2 ORDER BY start_date",
        [req.actor.tenant_id, setup.academic_year_id],
      ),
      activationChecks(this.db, req.actor.tenant_id, setup),
      this.db.query(
        "SELECT id,name,code,building,floor,location,capacity FROM classrooms WHERE tenant_id=$1 AND school_id=$2 AND is_active=true ORDER BY name",
        [req.actor.tenant_id, setup.school_id],
      ),
      this.db.query(
        "SELECT id,name,level FROM grade_levels WHERE tenant_id=$1 AND school_id=$2 ORDER BY level",
        [req.actor.tenant_id, setup.school_id],
      ),
      this.db.query(
        "SELECT id,name,code FROM subjects WHERE tenant_id=$1 AND school_id=$2 ORDER BY name",
        [req.actor.tenant_id, setup.school_id],
      ),
      this.db.query(
        "SELECT id,name,nip FROM teachers WHERE tenant_id=$1 ORDER BY name",
        [req.actor.tenant_id],
      ),
      this.db.query(
        "SELECT id,name,nis,status FROM students WHERE tenant_id=$1 ORDER BY name",
        [req.actor.tenant_id],
      ),
      this.db.query(
        "SELECT id,name,grade_level_id,classroom_id,homeroom_teacher_id,capacity FROM classes WHERE tenant_id=$1 AND academic_year_id=$2 ORDER BY name",
        [req.actor.tenant_id, setup.academic_year_id],
      ),
    ]);
    return {
      ...setup,
      steps: steps.rows,
      semesters: semesters.rows,
      setup_catalog: {
        classrooms: classrooms.rows,
        grade_levels: gradeLevels.rows,
        subjects: subjects.rows,
        teachers: teachers.rows,
        students: students.rows,
        formations: formations.rows,
      },
      ...checks,
    };
  }

  @Patch(":id/steps/:stepKey")
  updateStep(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("stepKey") stepKey: string,
    @Body() body: unknown,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.update");
    z.string().uuid().parse(id);
    if (
      !stepKeys.has(stepKey as any) ||
      stepKey === "identity" ||
      stepKey === "review"
    )
      throw new BadRequestException(
        "Langkah ini tidak dapat diperbarui langsung",
      );
    const input = stepSchema.parse(body);
    if (JSON.stringify(input.payload).length > 100_000)
      throw new BadRequestException("Konfigurasi langkah terlalu besar");
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const setup = await findSetup(sql, req.actor.tenant_id, id);
      if (["ACTIVE", "CLOSED"].includes(setup.status))
        throw new ConflictException(
          "Tahun ajaran aktif/ditutup tidak dapat diubah",
        );
      await materializeStep(
        sql,
        req.actor.tenant_id,
        setup,
        stepKey,
        input.payload,
      );
      const step = (
        await sql.query(
          `UPDATE academic_year_setup_steps
           SET payload=$4,status=$3,reviewed_at=CASE WHEN $3='COMPLETE' THEN now() ELSE NULL END,updated_at=now()
           WHERE tenant_id=$1 AND setup_id=$2 AND step_key=$5 RETURNING *`,
          [
            req.actor.tenant_id,
            id,
            input.complete ? "COMPLETE" : "PENDING",
            input.payload,
            stepKey,
          ],
        )
      ).rows[0];
      if (!step) throw new NotFoundException("Langkah setup tidak ditemukan");
      await sql.query(
        `UPDATE academic_year_setups SET current_step=$3,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [req.actor.tenant_id, id, Math.min(12, step.step_order + 1)],
      );
      return step;
    });
  }

  @Post(":id/activate")
  activate(@Req() req: AuthRequest, @Param("id") id: string) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.update");
    z.string().uuid().parse(id);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const setup = await findSetup(sql, req.actor.tenant_id, id);
      const result = await activationChecks(sql, req.actor.tenant_id, setup);
      if (!result.can_activate)
        throw new ConflictException(
          "Selesaikan seluruh pemeriksaan kritis sebelum aktivasi",
        );
      await sql.query(
        `UPDATE academic_years SET is_active=false,status='CLOSED',updated_at=now()
         WHERE tenant_id=$1 AND school_id=$2 AND is_active=true AND id<>$3`,
        [req.actor.tenant_id, setup.school_id, setup.academic_year_id],
      );
      await sql.query(
        "UPDATE academic_years SET is_active=true,status='ACTIVE',updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, setup.academic_year_id],
      );
      await sql.query(
        `UPDATE academic_year_setups SET status='ACTIVE',current_step=12,activated_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [req.actor.tenant_id, id],
      );
      await sql.query(
        `UPDATE academic_year_setup_steps SET status='COMPLETE',reviewed_at=now(),updated_at=now()
         WHERE tenant_id=$1 AND setup_id=$2 AND step_key='review'`,
        [req.actor.tenant_id, id],
      );
      return { ...(await findSetup(sql, req.actor.tenant_id, id)), ...result };
    });
  }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) {
    allowOperational(req.actor);
    allow(req.actor, "academic_setup.delete");
    z.string().uuid().parse(id);
    return this.db
      .transaction(req.actor.tenant_id, async (sql) => {
        const setup = await findSetup(sql, req.actor.tenant_id, id);
        if (setup.status === "ACTIVE")
          throw new ConflictException("Tahun ajaran aktif tidak dapat dihapus");
        await sql.query(
          "DELETE FROM academic_years WHERE tenant_id=$1 AND id=$2",
          [req.actor.tenant_id, setup.academic_year_id],
        );
        return { deleted: true };
      })
      .catch((error: any) => {
        if (error?.code === "23503")
          throw new ConflictException(
            "Tahun ajaran sudah digunakan dan tidak dapat dihapus",
          );
        throw error;
      });
  }
}
