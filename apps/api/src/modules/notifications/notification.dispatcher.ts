import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Database } from "../../database/database.service";
import {
  FcmSender,
  firebaseCredentials,
  PushError,
} from "./notification-delivery";
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
