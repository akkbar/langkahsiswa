import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { attendanceSchema, date, uuid } from "../../../packages/validation/src";
import { AuthGuard, AuthRequest, allow, allowOperational } from "./auth";
import { Database } from "./database";
import { notifyStudent } from "./notifications";
import {
  classSemester,
  editableGrades,
  enrolled,
  teachClass,
  uniqueStudents,
} from "./academic-policy";
@Controller("api/v1/attendance")
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() async get(
    @Req() req: AuthRequest,
    @Query("class_id") classId: string,
    @Query("date") day: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "attendance.read");
    uuid.parse(classId);
    date.parse(day);
    const session = (
      await this.db.query(
        "SELECT * FROM attendance_sessions WHERE tenant_id=$1 AND class_id=$2 AND date=$3",
        [req.actor.tenant_id, classId, day],
      )
    ).rows[0];
    const records = session
      ? (
          await this.db.query(
            "SELECT * FROM attendance_records WHERE tenant_id=$1 AND session_id=$2",
            [req.actor.tenant_id, session.id],
          )
        ).rows
      : [];
    return { session: session || null, records };
  }
  @Put() async save(@Req() req: AuthRequest, @Body() body: unknown) {
    allowOperational(req.actor);
    allow(req.actor, "attendance.write");
    const input = attendanceSchema.parse(body);
    uniqueStudents(input.records);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const tenant = req.actor.tenant_id;
      await teachClass(
        sql,
        req.actor,
        input.class_id,
        false,
        input.semester_id,
      );
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
      const session = (
        await sql.query(
          `INSERT INTO attendance_sessions(tenant_id,class_id,semester_id,date,created_by) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(tenant_id,class_id,date) DO UPDATE SET semester_id=EXCLUDED.semester_id RETURNING *`,
          [tenant, input.class_id, input.semester_id, input.date, req.actor.id],
        )
      ).rows[0];
      for (const item of input.records) {
        await sql.query(
          `INSERT INTO attendance_records(tenant_id,session_id,student_id,status,notes) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(tenant_id,session_id,student_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,source='MANUAL'`,
          [
            tenant,
            session.id,
            item.student_id,
            item.status,
            item.notes || null,
          ],
        );
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
        records: (
          await sql.query(
            "SELECT * FROM attendance_records WHERE tenant_id=$1 AND session_id=$2",
            [tenant, session.id],
          )
        ).rows,
      };
    });
  }
}
