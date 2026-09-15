import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { uuid } from "../../../../../packages/validation/src";
import { Database } from "../../database/database.service";
import { allow } from "../auth/permissions";
import { firebaseCredentials } from "./notification-delivery";
import { NotificationDispatcher } from "./notification.dispatcher";
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
    @Inject(NotificationDispatcher)
    private readonly dispatcher: NotificationDispatcher,
  ) {}
  async list(actor: Actor, value?: string) {
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
        [actor.tenant_id, actor.id, limit],
      )
    ).rows;
    const counts = (
      await this.db.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM notifications WHERE tenant_id=$1 AND user_id=$2",
        [actor.tenant_id, actor.id],
      )
    ).rows[0];
    return { data, ...counts };
  }
  async deliveries(actor: Actor) {
    allow(actor, "event.write");
    const data = (
      await this.db.query(
        "SELECT d.id,d.notification_id,d.status,d.attempts,d.last_error,d.created_at,d.sent_at,d.next_attempt_at,n.title FROM notification_deliveries d JOIN notifications n ON n.tenant_id=d.tenant_id AND n.id=d.notification_id WHERE d.tenant_id=$1 ORDER BY d.created_at DESC LIMIT 200",
        [actor.tenant_id],
      )
    ).rows;
    return {
      data,
      total: data.length,
      push_configured: !!firebaseCredentials(),
    };
  }
  dispatch(actor: Actor) {
    allow(actor, "event.write");
    return this.dispatcher.dispatch(actor.tenant_id);
  }
  async retry(actor: Actor, id: string) {
    allow(actor, "event.write");
    const row = (
      await this.db.query(
        "UPDATE notification_deliveries SET status='PENDING',attempts=0,next_attempt_at=now(),last_error=NULL WHERE tenant_id=$1 AND id=$2 AND status='FAILED' RETURNING id,status",
        [actor.tenant_id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Pengiriman gagal tidak ditemukan");
    return row;
  }
  async read(actor: Actor, id: string) {
    const row = (
      await this.db.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND user_id=$2 AND id=$3 RETURNING *",
        [actor.tenant_id, actor.id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Notifikasi tidak ditemukan");
    return row;
  }
}
