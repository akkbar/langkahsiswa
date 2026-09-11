import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  NestInterceptor,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { z } from "zod";
import { allow, allowOperational, AuthGuard, type AuthRequest } from "./auth";
import { Database } from "./database";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(Database) private readonly db: Database) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
      return next.handle();
    return next.handle().pipe(
      mergeMap(async (value) => {
        if (!req.actor) return value;
        const parts = req.path.split("/").filter(Boolean);
        const offset = parts[0] === "api" && parts[1] === "v1" ? 2 : 0;
        const entityType = parts[offset] || "unknown";
        const entityId = req.params?.id || value?.id || null;
        try {
          await this.db.query(
            `INSERT INTO audit_logs(tenant_id,user_id,action,method,path,entity_type,entity_id,ip_address,user_agent,metadata)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              req.actor.tenant_id,
              req.actor.id,
              `${req.method} ${entityType}`,
              req.method,
              req.path,
              entityType,
              entityId,
              req.ip || null,
              req.header("user-agent") || null,
              JSON.stringify({ status: "SUCCESS" }),
            ],
          );
        } catch (error) {
          console.error("Audit log gagal disimpan", error);
        }
        return value;
      }),
    );
  }
}

@Controller("api/v1/security")
@UseGuards(AuthGuard)
export class SecurityController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get("audit-logs") async audit(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "audit.read");
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
    const values: unknown[] = [req.actor.tenant_id];
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

  @Get("login-history") async logins(@Req() req: AuthRequest) {
    allowOperational(req.actor);
    allow(req.actor, "audit.read");
    const data = (
      await this.db.query(
        `SELECT h.*,u.name AS user_name FROM login_history h LEFT JOIN users u ON u.tenant_id=h.tenant_id AND u.id=h.user_id
         WHERE h.tenant_id=$1 ORDER BY h.created_at DESC LIMIT 200`,
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length };
  }

  @Get("sessions") async sessions(
    @Req() req: AuthRequest,
    @Query("user_id") userId?: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "audit.read");
    const target = userId ? z.string().uuid().parse(userId) : req.actor.id;
    if (target !== req.actor.id) allow(req.actor, "session.write");
    const data = (
      await this.db.query(
        `SELECT s.id,s.status,s.ip_address,s.user_agent,s.created_at,s.last_seen_at,s.expires_at,s.revoked_at,u.name,u.email
         FROM user_sessions s JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.user_id
         WHERE s.tenant_id=$1 AND s.user_id=$2 ORDER BY s.created_at DESC LIMIT 100`,
        [req.actor.tenant_id, target],
      )
    ).rows;
    return { data, total: data.length };
  }

  @Post("sessions/:id/revoke") async revoke(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "audit.read");
    z.string().uuid().parse(id);
    const session = (
      await this.db.query(
        "SELECT * FROM user_sessions WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!session) throw new NotFoundException("Sesi tidak ditemukan");
    if (session.user_id !== req.actor.id) allow(req.actor, "session.write");
    await this.db.transaction(req.actor.tenant_id, async (sql) => {
      await sql.query(
        "UPDATE user_sessions SET status='REVOKED',revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'",
        [req.actor.tenant_id, id],
      );
      await sql.query(
        "UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE tenant_id=$1 AND session_id=$2",
        [req.actor.tenant_id, id],
      );
    });
    return { ok: true };
  }
}
