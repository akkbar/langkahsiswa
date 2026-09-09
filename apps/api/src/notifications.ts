import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { uuid } from "../../../packages/validation/src";
import { AuthGuard, AuthRequest, allow } from "./auth";
import { Database, Sql } from "./database";
import { record } from "./academic-policy";

const targetSchema = z
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
const targetTables: Record<string, string> = {
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
async function recipients(
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
@Controller("api/v1/events")
@UseGuards(AuthGuard)
export class EventsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() async list(@Req() req: AuthRequest) {
    const manage =
      req.actor.permissions.includes("*") ||
      req.actor.permissions.includes("event.write");
    const data = (
      await this.db.query(
        `SELECT e.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('type',t.type,'target_id',t.target_id)) FROM event_targets t WHERE t.tenant_id=e.tenant_id AND t.event_id=e.id),'[]') AS targets FROM events e WHERE e.tenant_id=$1 AND ($3 OR (e.status='PUBLISHED' AND EXISTS(SELECT 1 FROM notifications n WHERE n.tenant_id=e.tenant_id AND n.event_id=e.id AND n.user_id=$2))) ORDER BY e.starts_at DESC LIMIT 200`,
        [req.actor.tenant_id, req.actor.id, manage],
      )
    ).rows;
    return { data, total: data.length };
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "event.write");
    const input = eventSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      for (const target of input.targets)
        if (target.type !== "ALL")
          await record(
            sql,
            targetTables[target.type],
            req.actor.tenant_id,
            target.target_id!,
          );
      const event = (
        await sql.query(
          "INSERT INTO events(tenant_id,title,description,type,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            req.actor.tenant_id,
            input.title,
            input.description,
            input.type,
            input.starts_at,
            input.ends_at || null,
            req.actor.id,
          ],
        )
      ).rows[0];
      for (const target of input.targets)
        await sql.query(
          "INSERT INTO event_targets(tenant_id,event_id,type,target_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [
            req.actor.tenant_id,
            event.id,
            target.type,
            target.target_id || null,
          ],
        );
      return { ...event, targets: input.targets };
    });
  }
  @Post(":id/publish") async publish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "event.write");
    uuid.parse(id);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const event = await record(sql, "events", req.actor.tenant_id, id);
      if (event.status === "PUBLISHED") return event;
      const targets = (
        await sql.query(
          "SELECT type,target_id FROM event_targets WHERE tenant_id=$1 AND event_id=$2",
          [req.actor.tenant_id, id],
        )
      ).rows;
      const userIds: string[] = [];
      for (const target of targets)
        userIds.push(
          ...(await recipients(sql, req.actor.tenant_id, target)).map(
            (r) => r.user_id,
          ),
        );
      await notifyUsers(
        sql,
        req.actor.tenant_id,
        userIds,
        event.title,
        event.description.slice(0, 1000),
        { type: "SCHOOL_EVENT", event_id: id },
        `event:${id}`,
        id,
      );
      return (
        await sql.query(
          "UPDATE events SET status='PUBLISHED',published_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
    });
  }
}

type ServiceAccount = {
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
@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private sender?: FcmSender;
  constructor(@Inject(Database) private readonly db: Database) {}
  onModuleInit() {
    if (process.env.NOTIFICATION_WORKER_ENABLED === "false") return;
    this.timer = setInterval(() => {
      void this.dispatch().catch(() =>
        this.logger.warn(
          "Antrean push gagal diproses; pengiriman tetap dapat dicoba ulang.",
        ),
      );
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async dispatch(tenant?: string) {
    const account = firebaseCredentials();
    if (!account)
      return {
        push_configured: false,
        processed: 0,
        reason: "Konfigurasi Firebase belum tersedia atau tidak valid",
      };
    if (this.running) return { push_configured: true, processed: 0 };
    this.running = true;
    let processed = 0;
    try {
      this.sender ??= new FcmSender(account);
      // Keep suspended tenants queued without consuming retries. Recheck status
      // below as the tenant can be suspended after this batch was claimed.
      const deliveries = (
        await this.db.query(
          `WITH candidates AS (SELECT q.id FROM notification_deliveries q JOIN tenants school ON school.id=q.tenant_id AND school.status='ACTIVE' WHERE ($1::uuid IS NULL OR q.tenant_id=$1) AND ((q.status='PENDING' AND q.next_attempt_at<=now()) OR (q.status='PROCESSING' AND q.locked_until<now())) ORDER BY q.next_attempt_at FOR UPDATE OF q SKIP LOCKED LIMIT 10) UPDATE notification_deliveries d SET status='PROCESSING',attempts=attempts+1,locked_until=now()+interval '10 minutes' FROM candidates c WHERE d.id=c.id RETURNING d.*`,
          [tenant || null],
        )
      ).rows;
      for (const delivery of deliveries) {
        const row = (
          await this.db.query(
            `SELECT n.title,n.body,n.data,t.token,t.active,u.active AS user_active,school.status AS tenant_status FROM notifications n JOIN tenants school ON school.id=n.tenant_id JOIN device_tokens t ON t.tenant_id=n.tenant_id AND t.user_id=n.user_id JOIN users u ON u.tenant_id=n.tenant_id AND u.id=n.user_id WHERE n.tenant_id=$1 AND n.id=$2 AND t.id=$3`,
            [
              delivery.tenant_id,
              delivery.notification_id,
              delivery.device_token_id,
            ],
          )
        ).rows[0];
        try {
          if (!row?.active || !row.user_active)
            throw new PushError("Perangkat atau akun tidak aktif", true);
          if (row.tenant_status !== "ACTIVE") {
            await this.db.query(
              "UPDATE notification_deliveries SET status='PENDING',attempts=GREATEST(attempts-1,0),locked_until=NULL,next_attempt_at=now()+interval '15 minutes',last_error='Sekolah sedang dinonaktifkan' WHERE tenant_id=$1 AND id=$2",
              [delivery.tenant_id, delivery.id],
            );
            processed++;
            continue;
          }
          const name = await this.sender.send(row.token, row.title, row.body, {
            ...row.data,
            notification_id: delivery.notification_id,
          });
          await this.db.query(
            "UPDATE notification_deliveries SET status='SENT',sent_at=now(),locked_until=NULL,last_error=NULL,provider_message_id=$2 WHERE id=$1",
            [delivery.id, name],
          );
        } catch (error) {
          const permanent = error instanceof PushError && error.permanent;
          if (error instanceof PushError && error.invalidToken)
            await this.db.query(
              "UPDATE device_tokens SET active=false,updated_at=now() WHERE tenant_id=$1 AND id=$2",
              [delivery.tenant_id, delivery.device_token_id],
            );
          await this.db.query(
            "UPDATE notification_deliveries SET status=$2,last_error=$3,locked_until=NULL,next_attempt_at=now()+($4::int * interval '1 second') WHERE id=$1",
            [
              delivery.id,
              permanent || delivery.attempts >= 5 ? "FAILED" : "PENDING",
              error instanceof PushError
                ? error.message
                : "Gangguan koneksi ke penyedia push",
              Math.min(3600, 30 * 2 ** delivery.attempts),
            ],
          );
        }
        processed++;
      }
      return { push_configured: true, processed };
    } finally {
      this.running = false;
    }
  }
}
@Controller("api/v1/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(NotificationDispatcher)
    private readonly dispatcher: NotificationDispatcher,
  ) {}
  @Get() async list(@Req() req: AuthRequest, @Query("limit") value?: string) {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(100)
      .parse(value);
    const data = (
      await this.db.query(
        "SELECT * FROM notifications WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3",
        [req.actor.tenant_id, req.actor.id, limit],
      )
    ).rows;
    const counts = (
      await this.db.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM notifications WHERE tenant_id=$1 AND user_id=$2",
        [req.actor.tenant_id, req.actor.id],
      )
    ).rows[0];
    return { data, ...counts };
  }
  @Get("deliveries") async deliveries(@Req() req: AuthRequest) {
    allow(req.actor, "event.write");
    const data = (
      await this.db.query(
        "SELECT d.id,d.notification_id,d.status,d.attempts,d.last_error,d.created_at,d.sent_at,d.next_attempt_at,n.title FROM notification_deliveries d JOIN notifications n ON n.tenant_id=d.tenant_id AND n.id=d.notification_id WHERE d.tenant_id=$1 ORDER BY d.created_at DESC LIMIT 200",
        [req.actor.tenant_id],
      )
    ).rows;
    return {
      data,
      total: data.length,
      push_configured: !!firebaseCredentials(),
    };
  }
  @Post("dispatch") dispatch(@Req() req: AuthRequest) {
    allow(req.actor, "event.write");
    return this.dispatcher.dispatch(req.actor.tenant_id);
  }
  @Post("deliveries/:id/retry") async retry(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "event.write");
    const row = (
      await this.db.query(
        "UPDATE notification_deliveries SET status='PENDING',attempts=0,next_attempt_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2 AND status='FAILED' RETURNING id,status",
        [req.actor.tenant_id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Pengiriman gagal tidak ditemukan");
    return row;
  }
  @Patch(":id/read") async read(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const row = (
      await this.db.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND user_id=$2 AND id=$3 RETURNING *",
        [req.actor.tenant_id, req.actor.id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Notifikasi tidak ditemukan");
    return row;
  }
}
@Controller("api/v1/device-tokens")
@UseGuards(AuthGuard)
export class DeviceTokensController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post() async register(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = z
      .object({
        token: z.string().min(20).max(4096),
        platform: z.enum(["ANDROID", "IOS", "WEB"]),
      })
      .strict()
      .parse(body);
    return this.db.transaction(null, async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
        input.token,
      ]);
      await sql.query(
        "UPDATE device_tokens SET active=false,updated_at=now() WHERE token=$1 AND (tenant_id<>$2 OR user_id<>$3)",
        [input.token, req.actor.tenant_id, req.actor.id],
      );
      return (
        await sql.query(
          `INSERT INTO device_tokens(tenant_id,user_id,token,platform) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id,token) DO UPDATE SET active=true,platform=EXCLUDED.platform,updated_at=now() RETURNING id,platform,active`,
          [req.actor.tenant_id, req.actor.id, input.token, input.platform],
        )
      ).rows[0];
    });
  }
  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    const row = (
      await this.db.query(
        "UPDATE device_tokens SET active=false,updated_at=now() WHERE tenant_id=$1 AND user_id=$2 AND id=$3 RETURNING id",
        [req.actor.tenant_id, req.actor.id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Perangkat tidak ditemukan");
    return { ok: true };
  }
}
