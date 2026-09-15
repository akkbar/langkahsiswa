import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database } from "../../database/database.service";
import { allow, allowOperational } from "../auth/permissions";
@Injectable()
export class SecurityService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async audit(actor: Actor, query: Record<string, unknown>) {
    allowOperational(actor);
    allow(actor, "audit.read");
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .parse(query.page || 1);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(query.limit || 50);
    const search = z.string().max(160).optional().parse(query.search);
    const values: unknown[] = [actor.tenant_id];
    let filter = "";
    if (search) {
      values.push(`%${search}%`);
      filter = ` AND (a.action ILIKE $${values.length} OR a.path ILIKE $${values.length} OR u.name ILIKE $${values.length})`;
    }
    const total = Number(
      (
        await this.db.query(
          `SELECT count(*) FROM audit_logs a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id WHERE a.tenant_id=$1${filter}`,
          values,
        )
      ).rows[0].count,
    );
    values.push(limit, (page - 1) * limit);
    const data = (
      await this.db.query(
        `SELECT a.*,u.name AS user_name,u.email AS user_email FROM audit_logs a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
         WHERE a.tenant_id=$1${filter} ORDER BY a.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
    ).rows;
    return { data, total, page, limit };
  }
  async logins(actor: Actor) {
    allowOperational(actor);
    allow(actor, "audit.read");
    const data = (
      await this.db.query(
        `SELECT h.*,u.name AS user_name FROM login_history h LEFT JOIN users u ON u.tenant_id=h.tenant_id AND u.id=h.user_id
         WHERE h.tenant_id=$1 ORDER BY h.created_at DESC LIMIT 200`,
        [actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length };
  }
  async sessions(actor: Actor, userId?: string) {
    allowOperational(actor);
    allow(actor, "audit.read");
    const target = userId ? z.string().uuid().parse(userId) : actor.id;
    if (target !== actor.id) allow(actor, "session.write");
    const data = (
      await this.db.query(
        `SELECT s.id,s.status,s.ip_address,s.user_agent,s.created_at,s.last_seen_at,s.expires_at,s.revoked_at,u.name,u.email
         FROM user_sessions s JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.user_id
         WHERE s.tenant_id=$1 AND s.user_id=$2 ORDER BY s.created_at DESC LIMIT 100`,
        [actor.tenant_id, target],
      )
    ).rows;
    return { data, total: data.length };
  }
  async revoke(actor: Actor, id: string) {
    allowOperational(actor);
    allow(actor, "audit.read");
    z.string().uuid().parse(id);
    const session = (
      await this.db.query(
        "SELECT * FROM user_sessions WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (!session) throw new NotFoundException("Sesi tidak ditemukan");
    if (session.user_id !== actor.id) allow(actor, "session.write");
    await this.db.transaction(actor.tenant_id, async (sql) => {
      await sql.query(
        "UPDATE user_sessions SET status='REVOKED',revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'",
        [actor.tenant_id, id],
      );
      await sql.query(
        "UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE tenant_id=$1 AND session_id=$2",
        [actor.tenant_id, id],
      );
    });
    return { ok: true };
  }
}
