import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Actor } from "../../../../../packages/shared-types/src";
import type { Sql } from "../../database/database.service";
import { isAdmin } from "../auth/permissions";
export async function record(
  sql: Sql,
  table: string,
  tenant: string,
  id: string,
) {
  const row = (
    await sql.query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2`, [
      tenant,
      id,
    ])
  ).rows[0];
  if (!row) throw new NotFoundException("Data tidak ditemukan");
  return row;
}
export async function classSemester(
  sql: Sql,
  tenant: string,
  classId: string,
  semesterId: string,
) {
  const cls = await record(sql, "classes", tenant, classId);
  const semester = await record(sql, "semesters", tenant, semesterId);
  if (cls.academic_year_id !== semester.academic_year_id)
    throw new BadRequestException(
      "Kelas dan semester harus dalam tahun ajaran yang sama",
    );
  return { cls, semester };
}
export async function enrolled(
  sql: Sql,
  tenant: string,
  classId: string,
  studentId: string,
) {
  if (
    !(
      await sql.query(
        "SELECT 1 FROM class_students WHERE tenant_id=$1 AND class_id=$2 AND student_id=$3",
        [tenant, classId, studentId],
      )
    ).rowCount
  )
    throw new BadRequestException("Siswa bukan anggota kelas");
}
export async function teachSubject(sql: Sql, actor: Actor, subjectId: string) {
  const subject = await record(
    sql,
    "class_subjects",
    actor.tenant_id,
    subjectId,
  );
  if (!isAdmin(actor)) {
    const teacher = await record(
      sql,
      "teachers",
      actor.tenant_id,
      subject.teacher_id,
    );
    if (teacher.user_id !== actor.id)
      throw new ForbiddenException(
        "Hanya guru pengampu yang dapat mengubah penilaian",
      );
  }
  return subject;
}
export async function teachClass(
  sql: Sql,
  actor: Actor,
  classId: string,
  homeroomOnly = false,
  semesterId?: string,
) {
  const cls = await record(sql, "classes", actor.tenant_id, classId);
  if (isAdmin(actor)) return cls;
  const teachers = (
    await sql.query(
      "SELECT id FROM teachers WHERE tenant_id=$1 AND user_id=$2",
      [actor.tenant_id, actor.id],
    )
  ).rows;
  const teacher = teachers[0]?.id;
  if (teacher && cls.homeroom_teacher_id === teacher) return cls;
  if (
    !homeroomOnly &&
    teacher &&
    (
      await sql.query(
        "SELECT 1 FROM class_subjects WHERE tenant_id=$1 AND class_id=$2 AND teacher_id=$3 AND ($4::uuid IS NULL OR semester_id=$4)",
        [actor.tenant_id, classId, teacher, semesterId || null],
      )
    ).rowCount
  )
    return cls;
  throw new ForbiddenException(
    homeroomOnly
      ? "Review hanya oleh wali kelas"
      : "Anda tidak mengajar kelas ini",
  );
}
export async function editableGrades(
  sql: Sql,
  tenant: string,
  classId: string,
  semesterId: string,
) {
  if (
    (
      await sql.query(
        "SELECT 1 FROM report_cards WHERE tenant_id=$1 AND class_id=$2 AND semester_id=$3 AND status <> 'DRAFT'",
        [tenant, classId, semesterId],
      )
    ).rowCount
  )
    throw new ConflictException(
      "Penilaian terkunci karena raport sudah direview. Buka kembali raport sebelum mengubah nilai.",
    );
  // Drafts must be recalculated after any gradebook mutation.
  const ids = (
    await sql.query(
      "SELECT id FROM report_cards WHERE tenant_id=$1 AND class_id=$2 AND semester_id=$3 AND status='DRAFT'",
      [tenant, classId, semesterId],
    )
  ).rows.map((r) => r.id);
  if (ids.length) {
    await sql.query(
      "DELETE FROM report_card_items WHERE tenant_id=$1 AND report_card_id=ANY($2::uuid[])",
      [tenant, ids],
    );
    await sql.query(
      "DELETE FROM report_cards WHERE tenant_id=$1 AND id=ANY($2::uuid[])",
      [tenant, ids],
    );
  }
}
export function uniqueStudents(items: { student_id: string }[]) {
  if (new Set(items.map((i) => i.student_id)).size !== items.length)
    throw new BadRequestException("Siswa duplikat dalam input");
}
