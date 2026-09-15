import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database } from "../../database/database.service";
import {
  generateSchedule,
  type Lesson,
  type Slot,
} from "../academic-year-setup/schedule-engine";
import { record } from "../academics/academic-policy";
import { allow, allowOperational } from "../auth/permissions";
const optionsSchema = z.object({
  semester_id: z.string().uuid(),
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .refine((a) => new Set(a).size === a.length),
  periods: z.number().int().min(1).max(16),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  break_after: z.number().int().min(1).max(16),
  break_minutes: z.number().int().min(0).max(120),
  apply: z.boolean().default(false),
});
@Injectable()
export class LessonPlanningService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async curriculum(actor: Actor) {
    allowOperational(actor);
    allow(actor, "school.read");
    const tenant = actor.tenant_id;
    const [settings, weights] = await Promise.all([
      this.db.query(
        "SELECT lesson_minutes FROM tenant_settings WHERE tenant_id=$1",
        [tenant],
      ),
      this.db.query("SELECT * FROM subject_weekly_weights WHERE tenant_id=$1", [
        tenant,
      ]),
    ]);
    return {
      minutes: settings.rows[0]?.lesson_minutes || 40,
      weights: weights.rows,
    };
  }
  async settings(actor: Actor, body: unknown) {
    allowOperational(actor);
    allow(actor, "school.update");
    const input = z
      .object({ minutes: z.number().int().min(10).max(120) })
      .parse(body);
    await this.db.transaction(actor.tenant_id, (sql) =>
      sql.query(
        "UPDATE tenant_settings SET lesson_minutes=$2 WHERE tenant_id=$1",
        [actor.tenant_id, input.minutes],
      ),
    );
    return input;
  }
  async weights(actor: Actor, id: string, body: unknown) {
    allowOperational(actor);
    allow(actor, "school.update");
    const input = z
      .object({
        weights: z
          .array(
            z.object({
              grade_level_id: z.string().uuid(),
              weekly_weight: z.number().int().min(0).max(60),
            }),
          )
          .max(20),
      })
      .parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const subject = await record(
        sql,
        "subjects",
        actor.tenant_id,
        z.string().uuid().parse(id),
      );
      for (const weight of input.weights) {
        const grade = await record(
          sql,
          "grade_levels",
          actor.tenant_id,
          weight.grade_level_id,
        );
        if (grade.school_id !== subject.school_id)
          throw new BadRequestException(
            "Tingkat dan mata pelajaran harus satu sekolah",
          );
        await sql.query(
          "INSERT INTO subject_weekly_weights(tenant_id,subject_id,grade_level_id,weekly_weight) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,subject_id,grade_level_id) DO UPDATE SET weekly_weight=excluded.weekly_weight",
          [actor.tenant_id, id, weight.grade_level_id, weight.weekly_weight],
        );
      }
      return { saved: true };
    });
  }
  async schedule(actor: Actor, semesterId: string) {
    allowOperational(actor);
    allow(actor, "academic.read");
    const tenant = actor.tenant_id;
    await record(
      this.db,
      "semesters",
      tenant,
      z.string().uuid().parse(semesterId),
    );
    const rows = (
      await this.db.query(
        `SELECT t.*,cs.class_id,cs.teacher_id,c.name class_name,s.name subject_name,g.name teacher_name FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id JOIN classes c ON c.id=cs.class_id AND c.tenant_id=cs.tenant_id JOIN subjects s ON s.id=cs.subject_id AND s.tenant_id=cs.tenant_id JOIN teachers g ON g.id=cs.teacher_id AND g.tenant_id=cs.tenant_id WHERE t.tenant_id=$1 AND cs.semester_id=$2 ORDER BY t.day_of_week,t.start_time,c.name`,
        [tenant, semesterId],
      )
    ).rows;
    const loads = (
      await this.db.query(
        `SELECT g.id,g.name,coalesce(sum(w.weekly_weight),0)::int weekly_weight,coalesce(sum(w.weekly_weight),0)::int * st.lesson_minutes target_minutes,coalesce((SELECT sum(extract(epoch from(t.end_time-t.start_time))/60) FROM timetables t JOIN class_subjects x ON x.id=t.class_subject_id AND x.tenant_id=t.tenant_id WHERE t.tenant_id=g.tenant_id AND x.teacher_id=g.id AND x.semester_id=$2),0)::int scheduled_minutes FROM teachers g JOIN tenant_settings st ON st.tenant_id=g.tenant_id LEFT JOIN class_subjects cs ON cs.tenant_id=g.tenant_id AND cs.teacher_id=g.id AND cs.semester_id=$2 LEFT JOIN classes c ON c.id=cs.class_id AND c.tenant_id=cs.tenant_id LEFT JOIN subject_weekly_weights w ON w.tenant_id=cs.tenant_id AND w.subject_id=cs.subject_id AND w.grade_level_id=c.grade_level_id WHERE g.tenant_id=$1 GROUP BY g.id,st.lesson_minutes ORDER BY g.name`,
        [tenant, semesterId],
      )
    ).rows;
    return { rows, loads };
  }
  async generate(actor: Actor, body: unknown) {
    allowOperational(actor);
    allow(actor, "academic.create");
    const input = optionsSchema.parse(body);
    if (input.apply) {
      allow(actor, "academic.update");
      allow(actor, "academic.delete");
    }
    const tenant = actor.tenant_id;
    return this.db.transaction(tenant, async (sql) => {
      const semester = await record(
        sql,
        "semesters",
        tenant,
        input.semester_id,
      );
      const minutes = (
        await sql.query(
          "SELECT lesson_minutes FROM tenant_settings WHERE tenant_id=$1",
          [tenant],
        )
      ).rows[0].lesson_minutes;
      const classes = (
        await sql.query(
          "SELECT c.*,coalesce(r.name,c.name) room_name FROM classes c LEFT JOIN classrooms r ON r.tenant_id=c.tenant_id AND r.id=c.classroom_id WHERE c.tenant_id=$1 AND c.academic_year_id=$2 ORDER BY c.name",
          [tenant, semester.academic_year_id],
        )
      ).rows;
      if (!classes.length)
        throw new BadRequestException("Belum ada rombel pada tahun ajaran ini");
      const curricula = (
        await sql.query(
          "SELECT w.*,s.name FROM subject_weekly_weights w JOIN subjects s ON s.id=w.subject_id AND s.tenant_id=w.tenant_id WHERE w.tenant_id=$1 AND weekly_weight>0 ORDER BY s.name",
          [tenant],
        )
      ).rows;
      const competencies = (
        await sql.query(
          "SELECT tc.*,g.name FROM teacher_competencies tc JOIN teachers g ON g.tenant_id=tc.tenant_id AND g.id=tc.teacher_id WHERE tc.tenant_id=$1 ORDER BY g.name",
          [tenant],
        )
      ).rows;
      const assigned = (
        await sql.query(
          "SELECT * FROM class_subjects WHERE tenant_id=$1 AND semester_id=$2",
          [tenant, input.semester_id],
        )
      ).rows;
      const lessons: (Lesson & {
        subject_id: string;
        class_name: string;
        teacher_name: string;
      })[] = [];
      const load: Record<string, number> = {};
      // Count existing bindings first, so automatic choices balance the remaining work.
      for (const cs of assigned) {
        const cls = classes.find((c) => c.id === cs.class_id);
        const weight =
          curricula.find(
            (w) =>
              w.subject_id === cs.subject_id &&
              w.grade_level_id === cls?.grade_level_id,
          )?.weekly_weight || 0;
        load[cs.teacher_id] = (load[cs.teacher_id] || 0) + weight;
      }
      for (const cls of classes) {
        const weights = curricula.filter(
          (w) => w.grade_level_id === cls.grade_level_id,
        );
        if (!weights.length)
          throw new BadRequestException(
            `Bobot mata pelajaran untuk ${cls.name} belum diatur`,
          );
        for (const w of weights) {
          const existing = assigned.find(
            (a) => a.class_id === cls.id && a.subject_id === w.subject_id,
          );
          const candidates = competencies
            .filter(
              (c) =>
                c.subject_id === w.subject_id &&
                c.grade_level_id === cls.grade_level_id,
            )
            .sort(
              (a, b) => (load[a.teacher_id] || 0) - (load[b.teacher_id] || 0),
            );
          const teacher = existing
            ? candidates.find((c) => c.teacher_id === existing.teacher_id)
            : candidates[0];
          if (!teacher)
            throw new BadRequestException(
              `Kompetensi guru belum sesuai untuk ${w.name}, ${cls.name}. Atur di Guru dan Staff.`,
            );
          if (!existing)
            load[teacher.teacher_id] =
              (load[teacher.teacher_id] || 0) + w.weekly_weight;
          lessons.push({
            id: existing?.id || `${cls.id}:${w.subject_id}`,
            class_id: cls.id,
            teacher_id: teacher.teacher_id,
            weekly_weight: w.weekly_weight,
            name: w.name,
            subject_id: w.subject_id,
            class_name: cls.name,
            teacher_name: teacher.name,
            room: cls.room_name,
          });
        }
      }
      // Other semesters with overlapping dates also reserve teacher and room time.
      const occupied = (
        await sql.query(
          `SELECT t.*,cs.class_id,cs.teacher_id FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id JOIN semesters s ON s.tenant_id=cs.tenant_id AND s.id=cs.semester_id WHERE t.tenant_id=$1 AND s.id<>$2 AND s.start_date<=$4 AND s.end_date>=$3`,
          [tenant, semester.id, semester.start_date, semester.end_date],
        )
      ).rows as Slot[];
      let slots: Slot[];
      try {
        slots = generateSchedule(lessons, { ...input, minutes }, occupied);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      if (input.apply) {
        await sql.query(
          "DELETE FROM timetables t USING class_subjects cs WHERE t.tenant_id=$1 AND cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id AND cs.semester_id=$2",
          [tenant, semester.id],
        );
        for (const lesson of lessons) {
          const row = (
            await sql.query(
              "INSERT INTO class_subjects(tenant_id,class_id,subject_id,teacher_id,semester_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,class_id,subject_id,semester_id) DO UPDATE SET teacher_id=excluded.teacher_id RETURNING id",
              [
                tenant,
                lesson.class_id,
                lesson.subject_id,
                lesson.teacher_id,
                semester.id,
              ],
            )
          ).rows[0];
          for (const slot of slots.filter(
            (s) => s.class_subject_id === lesson.id,
          ))
            await sql.query(
              "INSERT INTO timetables(tenant_id,class_subject_id,day_of_week,start_time,end_time,room) VALUES($1,$2,$3,$4,$5,$6)",
              [
                tenant,
                row.id,
                slot.day_of_week,
                slot.start_time,
                slot.end_time,
                slot.room,
              ],
            );
        }
      }
      return {
        applied: input.apply,
        minutes,
        rows: slots.map((s) => ({
          ...s,
          class_name: lessons.find((l) => l.id === s.class_subject_id)!
            .class_name,
          subject_name: lessons.find((l) => l.id === s.class_subject_id)!.name,
          teacher_name: lessons.find((l) => l.id === s.class_subject_id)!
            .teacher_name,
        })),
        loads: Object.entries(load).map(([id, weekly_weight]) => ({
          id,
          name: competencies.find((c) => c.teacher_id === id)?.name,
          weekly_weight,
          target_minutes: weekly_weight * minutes,
          scheduled_minutes: weekly_weight * minutes,
        })),
      };
    });
  }
}
