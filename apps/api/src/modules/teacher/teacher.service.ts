import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database } from "../../database/database.service";
import { allow } from "../auth/permissions";

@Injectable()
export class TeacherService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}

  async listPlans(actor: Actor, query: any) {
    allow(actor, "academic.read");
    const { semester_id, class_id, subject_id, teacher_id } = query;
    let sql = `SELECT p.*, c.name as class_name, s.name as subject_name, t.name as teacher_name
               FROM teaching_plans p
               LEFT JOIN classes c ON c.tenant_id = p.tenant_id AND c.id = p.class_id
               LEFT JOIN subjects s ON s.tenant_id = p.tenant_id AND s.id = p.subject_id
               LEFT JOIN teachers t ON t.tenant_id = p.tenant_id AND t.id = p.teacher_id
               WHERE p.tenant_id = $1`;
    const params: any[] = [actor.tenant_id];
    let idx = 2;
    if (semester_id) {
      sql += ` AND p.semester_id = $${idx++}`;
      params.push(semester_id);
    }
    if (class_id) {
      sql += ` AND p.class_id = $${idx++}`;
      params.push(class_id);
    }
    if (subject_id) {
      sql += ` AND p.subject_id = $${idx++}`;
      params.push(subject_id);
    }
    if (teacher_id) {
      sql += ` AND p.teacher_id = $${idx++}`;
      params.push(teacher_id);
    }
    sql += ` ORDER BY p.created_at DESC`;
    const res = await this.db.query(sql, params);
    return { data: res.rows };
  }

  async getPlan(actor: Actor, id: string) {
    allow(actor, "academic.read");
    z.string().uuid().parse(id);
    const plan = (
      await this.db.query(
        `SELECT p.*, c.name as class_name, s.name as subject_name, t.name as teacher_name
         FROM teaching_plans p
         LEFT JOIN classes c ON c.tenant_id = p.tenant_id AND c.id = p.class_id
         LEFT JOIN subjects s ON s.tenant_id = p.tenant_id AND s.id = p.subject_id
         LEFT JOIN teachers t ON t.tenant_id = p.tenant_id AND t.id = p.teacher_id
         WHERE p.tenant_id = $1 AND p.id = $2`,
        [actor.tenant_id, id]
      )
    ).rows[0];
    if (!plan) throw new NotFoundException("Rencana pembelajaran tidak ditemukan");

    const items = (
      await this.db.query(
        `SELECT * FROM teaching_plan_items WHERE tenant_id = $1 AND plan_id = $2 ORDER BY meeting_number ASC`,
        [actor.tenant_id, id]
      )
    ).rows;

    return { ...plan, items };
  }

  async createPlan(actor: Actor, body: unknown) {
    allow(actor, "academic.write");
    const schema = z.object({
      academic_year_id: z.string().uuid(),
      semester_id: z.string().uuid(),
      teacher_id: z.string().uuid(),
      class_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      items: z.array(
        z.object({
          meeting_number: z.number().int().min(1),
          topic: z.string().min(1),
          learning_objective: z.string().optional(),
          teacher_notes: z.string().optional(),
          status: z.string().optional(),
        })
      ).default([]),
    });
    const x = schema.parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const planRes = await sql.query(
        `INSERT INTO teaching_plans (tenant_id, academic_year_id, semester_id, teacher_id, class_id, subject_id, title, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [actor.tenant_id, x.academic_year_id, x.semester_id, x.teacher_id, x.class_id, x.subject_id, x.title, x.description || null]
      );
      const plan = planRes.rows[0];

      const insertedItems = [];
      for (const item of x.items) {
        const itemRes = await sql.query(
          `INSERT INTO teaching_plan_items (tenant_id, plan_id, meeting_number, topic, learning_objective, teacher_notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [actor.tenant_id, plan.id, item.meeting_number, item.topic, item.learning_objective || null, item.teacher_notes || null, item.status || 'PLANNED']
        );
        insertedItems.push(itemRes.rows[0]);
      }

      return { ...plan, items: insertedItems };
    });
  }

  async updatePlan(actor: Actor, id: string, body: unknown) {
    allow(actor, "academic.write");
    z.string().uuid().parse(id);
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      items: z.array(
        z.object({
          id: z.string().uuid().optional(),
          meeting_number: z.number().int().min(1),
          topic: z.string().min(1),
          learning_objective: z.string().optional(),
          teacher_notes: z.string().optional(),
          status: z.string().optional(),
        })
      ).optional(),
    });
    const x = schema.parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      if (x.title || x.description !== undefined) {
        await sql.query(
          `UPDATE teaching_plans SET title = COALESCE($3, title), description = COALESCE($4, description), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [actor.tenant_id, id, x.title || null, x.description ?? null]
        );
      }

      if (x.items) {
        for (const item of x.items) {
          if (item.id) {
            await sql.query(
              `UPDATE teaching_plan_items SET meeting_number=$3, topic=$4, learning_objective=$5, teacher_notes=$6, status=$7, updated_at=NOW()
               WHERE tenant_id=$1 AND id=$2 AND plan_id=$8`,
              [actor.tenant_id, item.id, item.meeting_number, item.topic, item.learning_objective || null, item.teacher_notes || null, item.status || 'PLANNED', id]
            );
          } else {
            await sql.query(
              `INSERT INTO teaching_plan_items (tenant_id, plan_id, meeting_number, topic, learning_objective, teacher_notes, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [actor.tenant_id, id, item.meeting_number, item.topic, item.learning_objective || null, item.teacher_notes || null, item.status || 'PLANNED']
            );
          }
        }
      }

      return this.getPlan(actor, id);
    });
  }

  async deletePlan(actor: Actor, id: string) {
    allow(actor, "academic.write");
    z.string().uuid().parse(id);
    await this.db.query(`DELETE FROM teaching_plans WHERE tenant_id = $1 AND id = $2`, [actor.tenant_id, id]);
    return { success: true };
  }

  async listLogs(actor: Actor, query: any) {
    allow(actor, "academic.read");
    const { teacher_id, class_id, subject_id, date } = query;
    let sql = `SELECT l.*, c.name as class_name, s.name as subject_name, t.name as teacher_name
               FROM teaching_logs l
               LEFT JOIN classes c ON c.tenant_id = l.tenant_id AND c.id = l.class_id
               LEFT JOIN subjects s ON s.tenant_id = l.tenant_id AND s.id = l.subject_id
               LEFT JOIN teachers t ON t.tenant_id = l.tenant_id AND t.id = l.teacher_id
               WHERE l.tenant_id = $1`;
    const params: any[] = [actor.tenant_id];
    let idx = 2;
    if (teacher_id) {
      sql += ` AND l.teacher_id = $${idx++}`;
      params.push(teacher_id);
    }
    if (class_id) {
      sql += ` AND l.class_id = $${idx++}`;
      params.push(class_id);
    }
    if (subject_id) {
      sql += ` AND l.subject_id = $${idx++}`;
      params.push(subject_id);
    }
    if (date) {
      sql += ` AND l.date = $${idx++}`;
      params.push(date);
    }
    sql += ` ORDER BY l.date DESC, l.created_at DESC`;
    const res = await this.db.query(sql, params);
    return { data: res.rows };
  }

  async createLog(actor: Actor, body: unknown) {
    allow(actor, "attendance.write");
    const schema = z.object({
      plan_item_id: z.string().uuid().optional().nullable(),
      timetable_id: z.string().uuid().optional().nullable(),
      teacher_id: z.string().uuid(),
      class_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      semester_id: z.string().uuid(),
      date: z.string(),
      planned_topic: z.string().optional().nullable(),
      actually_taught: z.string().min(1),
      completion_status: z.enum(["COMPLETED", "PARTIAL", "NOT_COVERED"]).default("COMPLETED"),
      teacher_notes: z.string().optional().nullable(),
      next_meeting_note: z.string().optional().nullable(),
    });
    const x = schema.parse(body);

    const res = await this.db.query(
      `INSERT INTO teaching_logs (tenant_id, plan_item_id, timetable_id, teacher_id, class_id, subject_id, semester_id, date, planned_topic, actually_taught, completion_status, teacher_notes, next_meeting_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        actor.tenant_id,
        x.plan_item_id || null,
        x.timetable_id || null,
        x.teacher_id,
        x.class_id,
        x.subject_id,
        x.semester_id,
        x.date,
        x.planned_topic || null,
        x.actually_taught,
        x.completion_status,
        x.teacher_notes || null,
        x.next_meeting_note || null,
      ]
    );

    if (x.plan_item_id) {
      await this.db.query(
        `UPDATE teaching_plan_items SET status = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [actor.tenant_id, x.plan_item_id, x.completion_status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS']
      );
    }

    return res.rows[0];
  }

  async getDashboard(actor: Actor, query: any) {
    allow(actor, "academic.read");
    const { teacher_id, date } = query;
    const targetDate = date || new Date().toISOString().split("T")[0];
    const dayOfWeek = new Date(targetDate).getDay();
    const sqlDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    let teacherFilter = "";
    const params: any[] = [actor.tenant_id, sqlDayOfWeek];
    let idx = 3;
    if (teacher_id) {
      teacherFilter = ` AND cs.teacher_id = $${idx++}`;
      params.push(teacher_id);
    }

    const timetablesRes = await this.db.query(
      `SELECT t.*, cs.class_id, cs.teacher_id, cs.subject_id, c.name as class_name, s.name as subject_name, g.name as teacher_name
       FROM timetables t
       JOIN class_subjects cs ON cs.tenant_id = t.tenant_id AND cs.id = t.class_subject_id
       JOIN classes c ON c.tenant_id = t.tenant_id AND c.id = cs.class_id
       JOIN subjects s ON s.tenant_id = t.tenant_id AND s.id = cs.subject_id
       JOIN teachers g ON g.tenant_id = t.tenant_id AND g.id = cs.teacher_id
       WHERE t.tenant_id = $1 AND t.day_of_week = $2 ${teacherFilter}
       ORDER BY t.start_time ASC`,
      params
    );

    const sessions = [];
    for (const row of timetablesRes.rows) {
      const logRes = await this.db.query(
        `SELECT next_meeting_note FROM teaching_logs WHERE tenant_id = $1 AND class_id = $2 AND subject_id = $3 ORDER BY date DESC LIMIT 1`,
        [actor.tenant_id, row.class_id, row.subject_id]
      );
      const reminder = logRes.rows[0]?.next_meeting_note || null;

      sessions.push({
        ...row,
        previous_reminder: reminder,
      });
    }

    return {
      date: targetDate,
      day_of_week: sqlDayOfWeek,
      sessions,
    };
  }
}
