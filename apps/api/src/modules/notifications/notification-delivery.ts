import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { uuid } from "../../../../../packages/validation/src";
import { Sql } from "../../database/database.service";
import { record } from "../academics/academic-policy";

export const targetSchema = z
  .object({
    type: z.enum([
      "ALL",
      "SCHOOL",
      "GRADE",
      "CLASS",
      "STUDENT",
      "TEACHER",
      "PARENT",
    ]),
    target_id: uuid.optional(),
  })
  .strict()
  .refine(
    (v) => (v.type === "ALL" ? !v.target_id : !!v.target_id),
    "Target harus sesuai jenis",
  );
export const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().max(5000).default(""),
    type: z.enum([
      "EXAM",
      "HOLIDAY",
      "SCHOOL_EVENT",
      "PARENT_MEETING",
      "PAYMENT_DEADLINE",
      "REPORT_PUBLICATION",
      "ANNOUNCEMENT",
    ]),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }).optional(),
    targets: z.array(targetSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (v) => !v.ends_at || Date.parse(v.ends_at) >= Date.parse(v.starts_at),
    "Waktu selesai sebelum mulai",
  );

export const targetTables: Record<string, string> = {
  SCHOOL: "schools",
  GRADE: "grade_levels",
  CLASS: "classes",
  STUDENT: "students",
  TEACHER: "teachers",
  PARENT: "parents",
};
export async function notifyUsers(
  sql: Sql,
  tenant: string,
  users: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  dedupeKey?: string,
  eventId?: string,
) {
  for (const user of new Set(users)) {
    const notification = (
      await sql.query(
        `INSERT INTO notifications(tenant_id,user_id,event_id,title,body,data,dedupe_key)
      SELECT $1,u.id,$3,$4,$5,$6,$7 FROM users u WHERE u.tenant_id=$1 AND u.id=$2 AND u.active
      ON CONFLICT(tenant_id,user_id,dedupe_key) DO NOTHING RETURNING id`,
        [
          tenant,
          user,
          eventId || null,
          title,
          body,
          JSON.stringify(data),
          dedupeKey || null,
        ],
      )
    ).rows[0];
    if (notification)
      await sql.query(
        `INSERT INTO notification_deliveries(tenant_id,notification_id,device_token_id)
      SELECT $1,$2,id FROM device_tokens WHERE tenant_id=$1 AND user_id=$3 AND active ON CONFLICT DO NOTHING`,
        [tenant, notification.id, user],
      );
  }
}
export async function notifyStudent(
  sql: Sql,
  tenantId: string,
  studentId: string,
  title: string,
  body: string,
  data: Record<string, string>,
  dedupeKey?: string,
) {
  const users = (
    await sql.query(
      `SELECT user_id FROM students WHERE tenant_id=$1 AND id=$2 AND user_id IS NOT NULL
    UNION SELECT p.user_id FROM parents p JOIN student_guardians g ON g.tenant_id=p.tenant_id AND g.parent_id=p.id
    WHERE g.tenant_id=$1 AND g.student_id=$2 AND g.receive_notification AND p.user_id IS NOT NULL`,
      [tenantId, studentId],
    )
  ).rows.map((r) => r.user_id);
  await notifyUsers(
    sql,
    tenantId,
    users,
    title,
    body,
    { ...data, student_id: studentId },
    dedupeKey,
  );
}

export async function recipients(
  sql: Sql,
  tenant: string,
  target: { type: string; target_id?: string },
) {
  if (target.type === "ALL")
    return (
      await sql.query(
        "SELECT id AS user_id FROM users WHERE tenant_id=$1 AND active",
        [tenant],
      )
    ).rows;
  await record(sql, targetTables[target.type], tenant, target.target_id!);
  if (target.type === "TEACHER" || target.type === "PARENT")
    return (
      await sql.query(
        `SELECT user_id FROM ${targetTables[target.type]} WHERE tenant_id=$1 AND id=$2 AND user_id IS NOT NULL`,
        [tenant, target.target_id],
      )
    ).rows;
  const filter = {
    STUDENT: "s.id=$2",
    CLASS: "c.id=$2",
    GRADE: "c.grade_level_id=$2",
    SCHOOL: "y.school_id=$2",
  }[target.type]!;
  const studentQuery = `SELECT DISTINCT s.id,s.user_id FROM students s LEFT JOIN class_students cs ON cs.tenant_id=s.tenant_id AND cs.student_id=s.id LEFT JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id LEFT JOIN academic_years y ON y.tenant_id=c.tenant_id AND y.id=c.academic_year_id WHERE s.tenant_id=$1 AND ${filter}`;
  const students = (await sql.query(studentQuery, [tenant, target.target_id]))
    .rows;
  const ids = students.map((s) => s.id);
  const guardians = (
    await sql.query(
      `SELECT DISTINCT p.user_id FROM parents p JOIN student_guardians g ON g.tenant_id=p.tenant_id AND g.parent_id=p.id WHERE g.tenant_id=$1 AND g.student_id=ANY($2::uuid[]) AND g.receive_notification AND p.user_id IS NOT NULL`,
      [tenant, ids],
    )
  ).rows;
  let teachers: any[] = [];
  if (target.type !== "STUDENT") {
    const classFilter = {
      CLASS: "c.id=$2",
      GRADE: "c.grade_level_id=$2",
      SCHOOL: "y.school_id=$2",
    }[target.type]!;
    teachers = (
      await sql.query(
        `SELECT DISTINCT t.user_id FROM teachers t JOIN classes c ON c.tenant_id=t.tenant_id JOIN academic_years y ON y.tenant_id=c.tenant_id AND y.id=c.academic_year_id WHERE t.tenant_id=$1 AND t.user_id IS NOT NULL AND ${classFilter} AND (c.homeroom_teacher_id=t.id OR EXISTS(SELECT 1 FROM class_subjects x WHERE x.tenant_id=c.tenant_id AND x.class_id=c.id AND x.teacher_id=t.id))`,
        [tenant, target.target_id],
      )
    ).rows;
  }
  return [...students.filter((s) => s.user_id), ...guardians, ...teachers];
}

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};
export function firebaseCredentials(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && !path) return null;
  try {
    const value = JSON.parse(raw || readFileSync(path!, "utf8"));
    return z
      .object({
        project_id: z.string().regex(/^[a-z0-9-]+$/),
        client_email: z.string().email(),
        private_key: z.string().min(100),
      })
      .parse(value);
  } catch {
    return null;
  }
}
export class PushError extends Error {
  constructor(
    message: string,
    readonly permanent = false,
    readonly invalidToken = false,
  ) {
    super(message);
  }
}
export class FcmSender {
  private accessToken?: { value: string; expires: number };
  constructor(
    private readonly account: ServiceAccount,
    private readonly request: typeof fetch = fetch,
  ) {}
  private async token() {
    if (this.accessToken && this.accessToken.expires > Date.now() + 60000)
      return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: this.account.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const signing = `${header}.${payload}`;
    const assertion = `${signing}.${createSign("RSA-SHA256").update(signing).sign(this.account.private_key, "base64url")}`;
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as any;
    if (!response.ok || !result.access_token)
      throw new PushError(`FCM OAuth gagal (${response.status})`);
    this.accessToken = {
      value: result.access_token,
      expires: Date.now() + Number(result.expires_in || 3600) * 1000,
    };
    return this.accessToken.value;
  }
  async send(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    const response = await this.request(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data,
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = (await response.json()) as any;
    if (!response.ok) {
      const code =
        result.error?.details?.find((d: any) => d.errorCode)?.errorCode ||
        result.error?.status ||
        "UNKNOWN";
      const invalid = code === "UNREGISTERED";
      throw new PushError(
        `FCM ${response.status}: ${code}`,
        invalid || response.status === 400,
        invalid,
      );
    }
    if (typeof result.name !== "string")
      throw new PushError("FCM tidak mengembalikan ID pengiriman");
    return result.name;
  }
}
