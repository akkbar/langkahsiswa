import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Actor } from "../../../packages/shared-types/src";
import type { Sql } from "./database";
import { isAdmin } from "./auth";
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

export async function validateResource(
  sql: Sql,
  key: string,
  actor: Actor,
  data: any,
  id?: string,
) {
  const tenant = actor.tenant_id;
  if (data.start_date && data.end_date && data.start_date >= data.end_date)
    throw new BadRequestException(
      "Tanggal selesai harus setelah tanggal mulai",
    );
  if (key === "academic-years" && id) {
    const child = (
      await sql.query(
        "SELECT 1 FROM semesters WHERE tenant_id=$1 AND academic_year_id=$2 AND (start_date<$3 OR end_date>$4)",
        [tenant, id, data.start_date, data.end_date],
      )
    ).rowCount;
    if (child)
      throw new BadRequestException(
        "Tanggal tahun ajaran harus mencakup seluruh semester",
      );
  }
  if (key === "semesters") {
    if (id) {
      const old = await record(sql, "semesters", tenant, id);
      if (
        (old.start_date !== data.start_date ||
          old.end_date !== data.end_date) &&
        (
          await sql.query(
            "SELECT 1 FROM class_subjects WHERE tenant_id=$1 AND semester_id=$2",
            [tenant, id],
          )
        ).rowCount
      )
        throw new ConflictException(
          "Tanggal semester yang sudah memiliki pelajaran tidak dapat diubah",
        );
    }
    const year = await record(
      sql,
      "academic_years",
      tenant,
      data.academic_year_id,
    );
    if (data.start_date < year.start_date || data.end_date > year.end_date)
      throw new BadRequestException("Semester harus berada dalam tahun ajaran");
    if (
      (
        await sql.query(
          "SELECT 1 FROM semesters WHERE tenant_id=$1 AND academic_year_id=$2 AND id<>$3 AND start_date<=$5 AND end_date>=$4",
          [
            tenant,
            data.academic_year_id,
            id || "00000000-0000-0000-0000-000000000000",
            data.start_date,
            data.end_date,
          ],
        )
      ).rowCount
    )
      throw new ConflictException("Tanggal semester bertumpang tindih");
    if (
      id &&
      (
        await sql.query(
          "SELECT 1 FROM attendance_sessions WHERE tenant_id=$1 AND semester_id=$2 AND (date<$3 OR date>$4)",
          [tenant, id, data.start_date, data.end_date],
        )
      ).rowCount
    )
      throw new ConflictException(
        "Tanggal semester harus mencakup absensi yang tersimpan",
      );
  }
  if (key === "classes") {
    const year = await record(
      sql,
      "academic_years",
      tenant,
      data.academic_year_id,
    );
    const level = await record(
      sql,
      "grade_levels",
      tenant,
      data.grade_level_id,
    );
    if (year.school_id !== level.school_id)
      throw new BadRequestException(
        "Tingkat dan tahun ajaran harus satu sekolah",
      );
    if (
      (
        await sql.query(
          "SELECT 1 FROM classes WHERE tenant_id=$1 AND academic_year_id=$2 AND lower(name)=lower($3) AND id<>$4",
          [
            tenant,
            data.academic_year_id,
            data.name,
            id || "00000000-0000-0000-0000-000000000000",
          ],
        )
      ).rowCount
    )
      throw new ConflictException(
        "Nama kelas sudah digunakan pada tahun ajaran ini",
      );
  }
  if (key === "class-subjects") {
    const { cls } = await classSemester(
      sql,
      tenant,
      data.class_id,
      data.semester_id,
    );
    const year = await record(
      sql,
      "academic_years",
      tenant,
      cls.academic_year_id,
    );
    const subject = await record(sql, "subjects", tenant, data.subject_id);
    if (year.school_id !== subject.school_id)
      throw new BadRequestException("Pelajaran bukan milik sekolah kelas ini");
    await editableGrades(sql, tenant, data.class_id, data.semester_id);
  }
  if (key === "class-students") {
    const cls = await record(sql, "classes", tenant, data.class_id);
    data.academic_year_id = cls.academic_year_id;
  }
  if (key === "timetables") {
    if (data.start_time >= data.end_time)
      throw new BadRequestException("Jam selesai harus setelah jam mulai");
    const subject = await record(
      sql,
      "class_subjects",
      tenant,
      data.class_subject_id,
    );
    const conflicts = await sql.query(
      `SELECT t.id FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id
   JOIN semesters old_sem ON old_sem.tenant_id=cs.tenant_id AND old_sem.id=cs.semester_id
   JOIN semesters new_sem ON new_sem.tenant_id=cs.tenant_id AND new_sem.id=$4
   WHERE t.tenant_id=$1 AND t.day_of_week=$2 AND t.id<>$3 AND old_sem.start_date<=new_sem.end_date AND old_sem.end_date>=new_sem.start_date AND (cs.class_id=$5 OR cs.teacher_id=$6)
   AND t.start_time<$8::time AND t.end_time>$7::time`,
      [
        tenant,
        data.day_of_week,
        id || "00000000-0000-0000-0000-000000000000",
        subject.semester_id,
        subject.class_id,
        subject.teacher_id,
        data.start_time,
        data.end_time,
      ],
    );
    if (conflicts.rowCount)
      throw new ConflictException("Jadwal guru atau kelas bertabrakan");
  }
  if (key === "assessment-categories" || key === "assessments") {
    const category =
      key === "assessments"
        ? await record(sql, "assessment_categories", tenant, data.category_id)
        : data;
    const subject = await teachSubject(sql, actor, category.class_subject_id);
    await editableGrades(sql, tenant, subject.class_id, subject.semester_id);
    if (key === "assessment-categories") {
      const weight = (
        await sql.query(
          "SELECT COALESCE(sum(weight),0) AS total FROM assessment_categories WHERE tenant_id=$1 AND class_subject_id=$2 AND id<>$3",
          [
            tenant,
            data.class_subject_id,
            id || "00000000-0000-0000-0000-000000000000",
          ],
        )
      ).rows[0].total;
      if (Number(weight) + data.weight > 100.00001)
        throw new BadRequestException(
          "Total bobot kategori tidak boleh melebihi 100%",
        );
    } else {
      const semester = await record(
        sql,
        "semesters",
        tenant,
        subject.semester_id,
      );
      if (
        data.due_date < semester.start_date ||
        data.due_date > semester.end_date
      )
        throw new BadRequestException("Tanggal penilaian harus dalam semester");
      if (
        id &&
        (
          await sql.query(
            "SELECT 1 FROM student_scores WHERE tenant_id=$1 AND assessment_id=$2 AND score>$3",
            [tenant, id, data.max_score],
          )
        ).rowCount
      )
        throw new BadRequestException(
          "Nilai maksimum lebih kecil dari nilai siswa tersimpan",
        );
    }
  }
}
