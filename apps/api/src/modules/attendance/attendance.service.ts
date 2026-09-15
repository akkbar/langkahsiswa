import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Actor } from "../../../../../packages/shared-types/src";
import {
  attendanceSchema,
  date,
  uuid,
} from "../../../../../packages/validation/src";
import { Database } from "../../database/database.service";
import {
  classSemester,
  editableGrades,
  enrolled,
  teachClass,
  uniqueStudents,
} from "../academics/academic-policy";
import { allow, allowOperational } from "../auth/permissions";
import { notifyStudent } from "../notifications/notification-delivery";
import { AttendanceRepository } from "./attendance.repository";
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
    @Inject(AttendanceRepository)
    private readonly attendance: AttendanceRepository,
  ) {}
  async get(actor: Actor, classId: string, day: string) {
    allowOperational(actor);
    allow(actor, "attendance.read");
    uuid.parse(classId);
    date.parse(day);
    const session = await this.attendance.findSession(
      actor.tenant_id,
      classId,
      day,
    );
    const records = session
      ? await this.attendance.records(actor.tenant_id, session.id)
      : [];
    return { session: session || null, records };
  }
  async save(actor: Actor, body: unknown) {
    allowOperational(actor);
    allow(actor, "attendance.write");
    const input = attendanceSchema.parse(body);
    uniqueStudents(input.records);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const tenant = actor.tenant_id;
      await teachClass(sql, actor, input.class_id, false, input.semester_id);
      const { semester } = await classSemester(
        sql,
        tenant,
        input.class_id,
        input.semester_id,
      );
      if (input.date < semester.start_date || input.date > semester.end_date)
        throw new BadRequestException("Tanggal absensi harus dalam semester");
      await editableGrades(sql, tenant, input.class_id, input.semester_id);
      for (const item of input.records)
        await enrolled(sql, tenant, input.class_id, item.student_id);
      const session = await this.attendance.saveSession(
        sql,
        tenant,
        actor.id,
        input,
      );
      for (const item of input.records) {
        await this.attendance.saveRecord(sql, tenant, session.id, item);
        if (item.status === "ABSENT") {
          await notifyStudent(
            sql,
            tenant,
            item.student_id,
            "Pemberitahuan ketidakhadiran",
            `Siswa tercatat alpa pada ${input.date}.`,
            {
              type: "ATTENDANCE",
              student_id: item.student_id,
              date: input.date,
            },
            `attendance:${session.id}:${item.student_id}:ABSENT`,
          );
        }
      }
      return {
        session,
        records: await this.attendance.records(tenant, session.id, sql),
      };
    });
  }
}
