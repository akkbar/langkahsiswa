import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database, type Sql } from "../../database/database.service";
import { allowAny, allowOperational, isAdmin } from "../auth/permissions";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const planInput = z.object({ academic_year_id: uuid, semester_id: uuid, teacher_id: uuid.optional(), class_id: uuid, subject_id: uuid, title: z.string().min(1), description: z.string().optional(), items: z.array(z.object({ meeting_number: z.number().int().min(1), topic: z.string().min(1), learning_objective: z.string().optional(), teacher_notes: z.string().optional(), status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]).optional() })).default([]) });
const logInput = z.object({ plan_item_id: uuid.optional().nullable(), timetable_id: uuid.optional().nullable(), teacher_id: uuid.optional(), class_id: uuid, subject_id: uuid, semester_id: uuid, date, planned_topic: z.string().optional().nullable(), actually_taught: z.string().min(1), completion_status: z.enum(["COMPLETED", "PARTIAL", "NOT_COVERED"]).default("COMPLETED"), teacher_notes: z.string().optional().nullable(), next_meeting_note: z.string().optional().nullable() });

@Injectable()
export class TeacherService {
  constructor(@Inject(Database) private readonly db: Database) {}

  private access(actor: Actor, permission: string, legacy: string) { allowOperational(actor); allowAny(actor, [permission, legacy]); }
  private async ownTeacher(sql: Sql, actor: Actor) {
    const teacher = (await sql.query("SELECT id FROM teachers WHERE tenant_id=$1 AND user_id=$2", [actor.tenant_id, actor.id])).rows[0];
    if (!teacher) throw new ForbiddenException("Akun tidak terhubung ke data guru");
    return teacher.id as string;
  }
  private async teacherId(sql: Sql, actor: Actor, requested?: string) {
    const own = await this.ownTeacher(sql, actor);
    if (!isAdmin(actor)) { if (requested && requested !== own) throw new ForbiddenException("Guru hanya dapat mengelola data sendiri"); return own; }
    if (!requested) return own;
    const found = (await sql.query("SELECT id FROM teachers WHERE tenant_id=$1 AND id=$2", [actor.tenant_id, requested])).rows[0];
    if (!found) throw new NotFoundException("Guru tidak ditemukan");
    return requested;
  }
  private async assignment(sql: Sql, actor: Actor, teacherId: string, input: { class_id: string; subject_id: string; semester_id: string; academic_year_id?: string }) {
    const row = (await sql.query(`SELECT cs.id FROM class_subjects cs JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id WHERE cs.tenant_id=$1 AND cs.class_id=$2 AND cs.subject_id=$3 AND cs.semester_id=$4 AND cs.teacher_id=$5 AND c.academic_year_id=sem.academic_year_id ${input.academic_year_id ? "AND sem.academic_year_id=$6" : ""}`, input.academic_year_id ? [actor.tenant_id, input.class_id, input.subject_id, input.semester_id, teacherId, input.academic_year_id] : [actor.tenant_id, input.class_id, input.subject_id, input.semester_id, teacherId])).rows[0];
    if (!row) throw new BadRequestException("Kelas, mata pelajaran, guru, dan semester tidak valid");
    return row;
  }

  async listPlans(actor: Actor, query: any) {
    this.access(actor, "teaching_plan.read", "academic.read");
    const teacher = isAdmin(actor) ? query.teacher_id : await this.ownTeacher(this.db, actor);
    const filters = ["p.tenant_id=$1"]; const params: unknown[] = [actor.tenant_id];
    for (const [column, value] of Object.entries({ teacher_id: teacher, semester_id: query.semester_id, class_id: query.class_id, subject_id: query.subject_id })) if (value) { params.push(value); filters.push(`p.${column}=$${params.length}`); }
    const res = await this.db.query(`SELECT p.*, c.name class_name, s.name subject_name, t.name teacher_name FROM teaching_plans p JOIN classes c ON c.tenant_id=p.tenant_id AND c.id=p.class_id JOIN subjects s ON s.tenant_id=p.tenant_id AND s.id=p.subject_id JOIN teachers t ON t.tenant_id=p.tenant_id AND t.id=p.teacher_id WHERE ${filters.join(" AND ")} ORDER BY p.created_at DESC`, params);
    return { data: res.rows };
  }
  async getPlan(actor: Actor, id: string) {
    this.access(actor, "teaching_plan.read", "academic.read"); uuid.parse(id);
    const own = isAdmin(actor) ? null : await this.ownTeacher(this.db, actor);
    const plan = (await this.db.query(`SELECT p.*, c.name class_name, s.name subject_name, t.name teacher_name FROM teaching_plans p JOIN classes c ON c.tenant_id=p.tenant_id AND c.id=p.class_id JOIN subjects s ON s.tenant_id=p.tenant_id AND s.id=p.subject_id JOIN teachers t ON t.tenant_id=p.tenant_id AND t.id=p.teacher_id WHERE p.tenant_id=$1 AND p.id=$2 AND ($3::uuid IS NULL OR p.teacher_id=$3)`, [actor.tenant_id, id, own])).rows[0];
    if (!plan) throw new NotFoundException("Rencana pembelajaran tidak ditemukan");
    const items = (await this.db.query("SELECT * FROM teaching_plan_items WHERE tenant_id=$1 AND plan_id=$2 ORDER BY meeting_number", [actor.tenant_id, id])).rows;
    return { ...plan, items };
  }
  async createPlan(actor: Actor, body: unknown) {
    this.access(actor, "teaching_plan.create", "academic.write"); const input = planInput.parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const teacherId = await this.teacherId(sql, actor, input.teacher_id); await this.assignment(sql, actor, teacherId, input);
      const plan = (await sql.query("INSERT INTO teaching_plans (tenant_id,academic_year_id,semester_id,teacher_id,class_id,subject_id,title,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [actor.tenant_id,input.academic_year_id,input.semester_id,teacherId,input.class_id,input.subject_id,input.title,input.description || null])).rows[0];
      const items = []; for (const item of input.items) items.push((await sql.query("INSERT INTO teaching_plan_items (tenant_id,plan_id,meeting_number,topic,learning_objective,teacher_notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [actor.tenant_id,plan.id,item.meeting_number,item.topic,item.learning_objective || null,item.teacher_notes || null,item.status || "PLANNED"])).rows[0]);
      return { ...plan, items };
    });
  }
  async updatePlan(actor: Actor, id: string, body: unknown) {
    this.access(actor, "teaching_plan.update", "academic.write"); uuid.parse(id); const input = z.object({ title: z.string().min(1).optional(), description: z.string().nullable().optional(), items: planInput.shape.items.optional() }).parse(body);
    await this.getPlan(actor, id);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      if (input.title !== undefined || input.description !== undefined) await sql.query("UPDATE teaching_plans SET title=COALESCE($3,title), description=COALESCE($4,description), updated_at=NOW() WHERE tenant_id=$1 AND id=$2", [actor.tenant_id,id,input.title ?? null,input.description ?? null]);
      for (const item of input.items || []) await sql.query("INSERT INTO teaching_plan_items (tenant_id,plan_id,meeting_number,topic,learning_objective,teacher_notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id,plan_id,meeting_number) DO UPDATE SET topic=EXCLUDED.topic, learning_objective=EXCLUDED.learning_objective, teacher_notes=EXCLUDED.teacher_notes, status=EXCLUDED.status, updated_at=NOW()", [actor.tenant_id,id,item.meeting_number,item.topic,item.learning_objective || null,item.teacher_notes || null,item.status || "PLANNED"]);
      return this.getPlan(actor, id);
    });
  }
  async deletePlan(actor: Actor, id: string) { this.access(actor, "teaching_plan.delete", "academic.write"); await this.getPlan(actor, id); await this.db.query("DELETE FROM teaching_plans WHERE tenant_id=$1 AND id=$2", [actor.tenant_id,id]); return { success: true }; }
  async listLogs(actor: Actor, query: any) {
    this.access(actor, "teaching_log.read", "academic.read"); const own = isAdmin(actor) ? query.teacher_id : await this.ownTeacher(this.db, actor); const filters=["l.tenant_id=$1"]; const params: unknown[]=[actor.tenant_id];
    for (const [column,value] of Object.entries({teacher_id:own,class_id:query.class_id,subject_id:query.subject_id,date:query.date})) if(value){params.push(value);filters.push(`l.${column}=$${params.length}`);}
    return { data:(await this.db.query(`SELECT l.*,c.name class_name,s.name subject_name,t.name teacher_name FROM teaching_logs l JOIN classes c ON c.tenant_id=l.tenant_id AND c.id=l.class_id JOIN subjects s ON s.tenant_id=l.tenant_id AND s.id=l.subject_id JOIN teachers t ON t.tenant_id=l.tenant_id AND t.id=l.teacher_id WHERE ${filters.join(" AND ")} ORDER BY l.date DESC,l.created_at DESC`,params)).rows };
  }
  async createLog(actor: Actor, body: unknown) {
    this.access(actor, "teaching_log.create", "attendance.write"); const input=logInput.parse(body);
    return this.db.transaction(actor.tenant_id, async sql => { const teacherId=await this.teacherId(sql,actor,input.teacher_id); await this.assignment(sql,actor,teacherId,input);
      if(input.timetable_id && !(await sql.query("SELECT 1 FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id WHERE t.tenant_id=$1 AND t.id=$2 AND cs.class_id=$3 AND cs.subject_id=$4 AND cs.teacher_id=$5 AND cs.semester_id=$6",[actor.tenant_id,input.timetable_id,input.class_id,input.subject_id,teacherId,input.semester_id])).rowCount) throw new BadRequestException("Jadwal tidak sesuai penugasan");
      if(input.plan_item_id && !(await sql.query("SELECT 1 FROM teaching_plan_items i JOIN teaching_plans p ON p.tenant_id=i.tenant_id AND p.id=i.plan_id WHERE i.tenant_id=$1 AND i.id=$2 AND p.teacher_id=$3 AND p.class_id=$4 AND p.subject_id=$5 AND p.semester_id=$6",[actor.tenant_id,input.plan_item_id,teacherId,input.class_id,input.subject_id,input.semester_id])).rowCount) throw new BadRequestException("Item rencana tidak sesuai penugasan");
      const result=await sql.query("INSERT INTO teaching_logs (tenant_id,plan_item_id,timetable_id,teacher_id,class_id,subject_id,semester_id,date,planned_topic,actually_taught,completion_status,teacher_notes,next_meeting_note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",[actor.tenant_id,input.plan_item_id||null,input.timetable_id||null,teacherId,input.class_id,input.subject_id,input.semester_id,input.date,input.planned_topic||null,input.actually_taught,input.completion_status,input.teacher_notes||null,input.next_meeting_note||null]);
      if(input.plan_item_id) await sql.query("UPDATE teaching_plan_items SET status=$3,updated_at=NOW() WHERE tenant_id=$1 AND id=$2",[actor.tenant_id,input.plan_item_id,input.completion_status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS"]); return result.rows[0]; });
  }
  async getDashboard(actor: Actor, query: any) {
    this.access(actor,"teaching_log.read", "academic.read"); const target=date.parse(query.date || new Date().toISOString().slice(0,10)); const teacher=await this.teacherId(this.db,actor,isAdmin(actor)?query.teacher_id:undefined); const weekday=((new Date(`${target}T00:00:00Z`).getUTCDay()+6)%7)+1;
    const rows=(await this.db.query(`SELECT t.*,cs.class_id,cs.subject_id,cs.teacher_id,c.name class_name,s.name subject_name,p.id plan_id,next_item.id next_plan_item_id,next_item.topic planned_next_topic,previous.next_meeting_note previous_reminder FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id LEFT JOIN teaching_plans p ON p.tenant_id=cs.tenant_id AND p.teacher_id=cs.teacher_id AND p.class_id=cs.class_id AND p.subject_id=cs.subject_id AND p.semester_id=cs.semester_id LEFT JOIN LATERAL (SELECT i.* FROM teaching_plan_items i WHERE i.tenant_id=p.tenant_id AND i.plan_id=p.id AND i.status <> 'COMPLETED' ORDER BY i.meeting_number LIMIT 1) next_item ON true LEFT JOIN LATERAL (SELECT l.next_meeting_note FROM teaching_logs l WHERE l.tenant_id=t.tenant_id AND l.teacher_id=cs.teacher_id AND l.class_id=cs.class_id AND l.subject_id=cs.subject_id AND l.next_meeting_note IS NOT NULL ORDER BY l.date DESC,l.created_at DESC LIMIT 1) previous ON true WHERE t.tenant_id=$1 AND cs.teacher_id=$2 AND t.day_of_week=$3 AND $4::date BETWEEN sem.start_date AND sem.end_date ORDER BY t.start_time`,[actor.tenant_id,teacher,weekday,target])).rows;
    return { date:target,day_of_week:weekday,sessions:rows };
  }
}
