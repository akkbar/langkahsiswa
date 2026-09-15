import { Inject, Injectable } from "@nestjs/common";
import { Database, type Sql } from "../../database/database.service";
import type {
  AttendanceInput,
  AttendanceRecordInput,
} from "./attendance.types";

@Injectable()
export class AttendanceRepository {
  constructor(@Inject(Database) private readonly db: Database) {}

  async findSession(tenant: string, classId: string, day: string) {
    return (
      (
        await this.db.query(
          "SELECT * FROM attendance_sessions WHERE tenant_id=$1 AND class_id=$2 AND date=$3",
          [tenant, classId, day],
        )
      ).rows[0] || null
    );
  }

  async records(tenant: string, sessionId: string, sql: Sql = this.db) {
    return (
      await sql.query(
        "SELECT * FROM attendance_records WHERE tenant_id=$1 AND session_id=$2",
        [tenant, sessionId],
      )
    ).rows;
  }

  async saveSession(
    sql: Sql,
    tenant: string,
    userId: string,
    input: AttendanceInput,
  ) {
    return (
      await sql.query(
        `INSERT INTO attendance_sessions(tenant_id,class_id,semester_id,date,created_by)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(tenant_id,class_id,date)
         DO UPDATE SET semester_id=EXCLUDED.semester_id RETURNING *`,
        [tenant, input.class_id, input.semester_id, input.date, userId],
      )
    ).rows[0];
  }

  async saveRecord(
    sql: Sql,
    tenant: string,
    sessionId: string,
    item: AttendanceRecordInput,
  ) {
    await sql.query(
      `INSERT INTO attendance_records(tenant_id,session_id,student_id,status,notes)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(tenant_id,session_id,student_id)
       DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,source='MANUAL'`,
      [tenant, sessionId, item.student_id, item.status, item.notes || null],
    );
  }
}
