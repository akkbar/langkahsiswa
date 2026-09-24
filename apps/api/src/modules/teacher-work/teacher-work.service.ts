import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { date, uuid } from "../../../../../packages/validation/src";
import { Database, type Sql } from "../../database/database.service";
import { enrolled, record, teachClass, teachSubject } from "../academics/academic-policy";
import { allow, allowOperational, isAdmin } from "../auth/permissions";

const optionalUuid = uuid.optional().nullable();
export const assignmentInputSchema = z.object({
  class_subject_id: uuid,
  teaching_log_id: optionalUuid,
  plan_item_id: optionalUuid,
  title: z.string().trim().min(1).max(255),
  instructions: z.string().trim().min(1).max(10000),
  assigned_date: date,
  due_date: date.optional().nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.due_date && value.due_date < value.assigned_date) ctx.addIssue({ code: "custom", path: ["due_date"], message: "Tenggat tidak boleh sebelum tanggal penugasan" });
});
export const noteInputSchema = z.object({
  student_id: uuid,
  class_subject_id: optionalUuid,
  teaching_log_id: optionalUuid,
  note: z.string().trim().min(1).max(10000),
  visibility: z.enum(["TEACHERS_ONLY", "SCHOOL_STAFF", "PARENT_VISIBLE"]),
}).strict();
const reviewSchema = z.object({ status: z.enum(["REVIEWED", "RETURNED"]), review_note: z.string().trim().max(10000).optional().nullable() }).strict();

@Injectable()
export class TeacherWorkService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async teacher(sql: Sql, actor: Actor) {
    const row = (await sql.query("SELECT id FROM teachers WHERE tenant_id=$1 AND user_id=$2", [actor.tenant_id, actor.id])).rows[0];
    if (!row && !isAdmin(actor)) throw new ForbiddenException("Profil guru tidak ditemukan");
    return row?.id as string | undefined;
  }
  private async linkAssignment(sql: Sql, actor: Actor, input: z.infer<typeof assignmentInputSchema>) {
    const subject = await teachSubject(sql, actor, input.class_subject_id);
    if (input.teaching_log_id) {
      const log = await record(sql, "teaching_logs", actor.tenant_id, input.teaching_log_id);
      if (log.class_id !== subject.class_id || log.subject_id !== subject.subject_id || log.semester_id !== subject.semester_id) throw new BadRequestException("Log mengajar harus sesuai pelajaran kelas");
    }
    if (input.plan_item_id) {
      const item = await record(sql, "teaching_plan_items", actor.tenant_id, input.plan_item_id);
      const plan = await record(sql, "teaching_plans", actor.tenant_id, item.plan_id);
      if (plan.class_id !== subject.class_id || plan.subject_id !== subject.subject_id || plan.semester_id !== subject.semester_id) throw new BadRequestException("Item rencana mengajar harus sesuai pelajaran kelas");
    }
    return subject;
  }
  async context(actor: Actor) {
    allowOperational(actor); allow(actor, "assignment.read"); allow(actor, "student_note.read");
    const all = isAdmin(actor);
    const subjects = (await this.db.query(`SELECT cs.id,cs.class_id,cs.teacher_id,c.name class_name,s.name subject_name,sem.name semester_name FROM class_subjects cs JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id JOIN teachers t ON t.tenant_id=cs.tenant_id AND t.id=cs.teacher_id WHERE cs.tenant_id=$1 AND ($3::boolean OR t.user_id=$2) ORDER BY sem.name DESC,c.name,s.name`, [actor.tenant_id, actor.id, all])).rows;
    const students = (await this.db.query("SELECT id,name FROM students WHERE tenant_id=$1 ORDER BY name", [actor.tenant_id])).rows;
    return { subjects, students, can_view_all: all };
  }
  async assignments(actor: Actor, classSubjectId?: string) {
    allowOperational(actor); allow(actor, "assignment.read");
    const all = isAdmin(actor); const params: unknown[] = [actor.tenant_id, actor.id, all];
    let filter = "";
    if (classSubjectId) { params.push(uuid.parse(classSubjectId)); filter = ` AND a.class_subject_id=$${params.length}`; }
    return (await this.db.query(`SELECT a.*,c.name class_name,s.name subject_name,count(sa.id)::int student_count,count(sa.id) FILTER (WHERE sa.status='REVIEWED')::int reviewed_count FROM assignments a JOIN class_subjects cs ON cs.tenant_id=a.tenant_id AND cs.id=a.class_subject_id JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id LEFT JOIN student_assignments sa ON sa.tenant_id=a.tenant_id AND sa.assignment_id=a.id WHERE a.tenant_id=$1 AND ($3::boolean OR t.user_id=$2)${filter} GROUP BY a.id,c.name,s.name ORDER BY a.assigned_date DESC,a.created_at DESC`, params)).rows;
  }
  async createAssignment(actor: Actor, body: unknown) {
    allowOperational(actor); allow(actor, "assignment.create"); const input = assignmentInputSchema.parse(body);
    return this.db.transaction(actor.tenant_id, async sql => {
      const subject = await this.linkAssignment(sql, actor, input); const teacherId = await this.teacher(sql, actor);
      const owner = isAdmin(actor) ? subject.teacher_id : teacherId!;
      const assignment = (await sql.query("INSERT INTO assignments(tenant_id,class_subject_id,teaching_log_id,plan_item_id,teacher_id,title,instructions,assigned_date,due_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [actor.tenant_id,input.class_subject_id,input.teaching_log_id || null,input.plan_item_id || null,owner,input.title,input.instructions,input.assigned_date,input.due_date || null])).rows[0];
      await sql.query("INSERT INTO student_assignments(tenant_id,assignment_id,student_id) SELECT $1,$2,student_id FROM class_students WHERE tenant_id=$1 AND class_id=$3", [actor.tenant_id,assignment.id,subject.class_id]);
      return assignment;
    });
  }
  async updateAssignment(actor: Actor, id: string, body: unknown) {
    allowOperational(actor); allow(actor, "assignment.update"); const input = assignmentInputSchema.parse(body);
    return this.db.transaction(actor.tenant_id, async sql => {
      const existing = await record(sql,"assignments",actor.tenant_id,uuid.parse(id)); await this.linkAssignment(sql,actor,input);
      if (!isAdmin(actor) && existing.teacher_id !== await this.teacher(sql,actor)) throw new ForbiddenException("Hanya guru pembuat yang dapat mengubah tugas");
      return (await sql.query("UPDATE assignments SET class_subject_id=$3,teaching_log_id=$4,plan_item_id=$5,title=$6,instructions=$7,assigned_date=$8,due_date=$9,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",[actor.tenant_id,id,input.class_subject_id,input.teaching_log_id || null,input.plan_item_id || null,input.title,input.instructions,input.assigned_date,input.due_date || null])).rows[0];
    });
  }
  async deleteAssignment(actor: Actor, id: string) {
    allowOperational(actor); allow(actor,"assignment.delete");
    return this.db.transaction(actor.tenant_id, async sql => { const row=await record(sql,"assignments",actor.tenant_id,uuid.parse(id)); if (!isAdmin(actor) && row.teacher_id !== await this.teacher(sql,actor)) throw new ForbiddenException("Hanya guru pembuat yang dapat menghapus tugas"); await sql.query("DELETE FROM assignments WHERE tenant_id=$1 AND id=$2",[actor.tenant_id,id]); return { deleted:true }; });
  }
  async submissions(actor: Actor, assignmentId: string) {
    allowOperational(actor); allow(actor,"assignment.read"); const assignment=await record(this.db,"assignments",actor.tenant_id,uuid.parse(assignmentId)); if(!isAdmin(actor) && assignment.teacher_id !== await this.teacher(this.db,actor)) throw new ForbiddenException("Hanya guru pengampu yang dapat melihat pengumpulan");
    return (await this.db.query("SELECT sa.*,s.name student_name FROM student_assignments sa JOIN students s ON s.tenant_id=sa.tenant_id AND s.id=sa.student_id WHERE sa.tenant_id=$1 AND sa.assignment_id=$2 ORDER BY s.name",[actor.tenant_id,assignmentId])).rows;
  }
  async review(actor: Actor, assignmentId: string, studentId: string, body: unknown) {
    allowOperational(actor); allow(actor,"assignment.update"); const input=reviewSchema.parse(body);
    return this.db.transaction(actor.tenant_id, async sql => { const a=await record(sql,"assignments",actor.tenant_id,uuid.parse(assignmentId)); if(!isAdmin(actor) && a.teacher_id !== await this.teacher(sql,actor)) throw new ForbiddenException("Hanya guru pengampu yang dapat meninjau pengumpulan"); const teacher=await this.teacher(sql,actor); const result=await sql.query("UPDATE student_assignments SET status=$4,review_note=$5,reviewed_at=now(),reviewed_by=$6,updated_at=now() WHERE tenant_id=$1 AND assignment_id=$2 AND student_id=$3 RETURNING *",[actor.tenant_id,assignmentId,uuid.parse(studentId),input.status,input.review_note || null,teacher || a.teacher_id]); if(!result.rowCount) throw new NotFoundException("Pengumpulan siswa tidak ditemukan"); return result.rows[0]; });
  }
  async notes(actor: Actor, studentId?: string) {
    allowOperational(actor); allow(actor,"student_note.read"); const all=isAdmin(actor); const args:unknown[]=[actor.tenant_id,actor.id,all]; let where=""; if(studentId){args.push(uuid.parse(studentId));where=` AND n.student_id=$${args.length}`;}
    return (await this.db.query(`SELECT n.*,s.name student_name,t.name author_name FROM student_academic_notes n JOIN students s ON s.tenant_id=n.tenant_id AND s.id=n.student_id JOIN teachers t ON t.tenant_id=n.tenant_id AND t.id=n.author_teacher_id WHERE n.tenant_id=$1 AND ($3::boolean OR t.user_id=$2)${where} ORDER BY n.created_at DESC`,args)).rows;
  }
  async createNote(actor: Actor, body: unknown) { allowOperational(actor);allow(actor,"student_note.create"); const input=noteInputSchema.parse(body); return this.db.transaction(actor.tenant_id,async sql=>{ const teacher=await this.teacher(sql,actor); if(!teacher) throw new ForbiddenException("Admin harus memilih penulis guru melalui akun guru"); await record(sql,"students",actor.tenant_id,input.student_id); if(input.class_subject_id){const subject=await teachSubject(sql,actor,input.class_subject_id);await enrolled(sql,actor.tenant_id,subject.class_id,input.student_id);} if(input.teaching_log_id) await record(sql,"teaching_logs",actor.tenant_id,input.teaching_log_id); return (await sql.query("INSERT INTO student_academic_notes(tenant_id,student_id,author_teacher_id,class_subject_id,teaching_log_id,note,visibility) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[actor.tenant_id,input.student_id,teacher,input.class_subject_id||null,input.teaching_log_id||null,input.note,input.visibility])).rows[0];}); }
  async updateNote(actor: Actor,id:string,body:unknown){allowOperational(actor);allow(actor,"student_note.update");const input=noteInputSchema.parse(body);return this.db.transaction(actor.tenant_id,async sql=>{const old=await record(sql,"student_academic_notes",actor.tenant_id,uuid.parse(id));if(!isAdmin(actor)&&old.author_teacher_id!==await this.teacher(sql,actor))throw new ForbiddenException("Hanya guru penulis yang dapat mengubah catatan");await record(sql,"students",actor.tenant_id,input.student_id);return (await sql.query("UPDATE student_academic_notes SET student_id=$3,class_subject_id=$4,teaching_log_id=$5,note=$6,visibility=$7,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",[actor.tenant_id,id,input.student_id,input.class_subject_id||null,input.teaching_log_id||null,input.note,input.visibility])).rows[0];});}
  async deleteNote(actor: Actor,id:string){allowOperational(actor);allow(actor,"student_note.delete");return this.db.transaction(actor.tenant_id,async sql=>{const row=await record(sql,"student_academic_notes",actor.tenant_id,uuid.parse(id));if(!isAdmin(actor)&&row.author_teacher_id!==await this.teacher(sql,actor))throw new ForbiddenException("Hanya guru penulis yang dapat menghapus catatan");await sql.query("DELETE FROM student_academic_notes WHERE tenant_id=$1 AND id=$2",[actor.tenant_id,id]);return {deleted:true};});}
}
