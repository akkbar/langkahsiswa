import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { Actor } from "../../../../../packages/shared-types/src";
import { uuid } from "../../../../../packages/validation/src";
import { jwtSecret } from "../../config";
import { Database, Sql } from "../../database/database.service";
import { accountTypes } from "./auth.types";
import { digest } from "./token-hash";
@Injectable()
export class AuthService {
  constructor(@Inject(Database) readonly db: Database) {}
  async actor(userId: string, tenantId: string): Promise<Actor> {
    const user = (
      await this.db.query(
        `SELECT u.id,u.tenant_id,u.account_id,a.account_level,u.name,u.email,
         t.name AS tenant_name,t.slug AS tenant_slug,
         o.id AS organization_id,o.name AS organization_name,o.slug AS organization_slug
         FROM users u
         JOIN tenants t ON t.id=u.tenant_id
         JOIN organization_sites os ON os.tenant_id=t.id
         JOIN organizations o ON o.id=os.organization_id
         JOIN accounts a ON a.id=u.account_id
         WHERE u.id=$1 AND u.tenant_id=$2 AND u.active AND u.status='ACTIVE' AND a.active
         AND EXISTS(SELECT 1 FROM user_bindings b
          WHERE b.account_id=u.account_id AND b.organization_id=o.id
          AND b.status='ACTIVE' AND (b.tenant_id IS NULL OR b.tenant_id=u.tenant_id))
         AND t.status='ACTIVE' AND o.status='ACTIVE'`,
        [userId, tenantId],
      )
    ).rows[0];
    if (!user) throw new UnauthorizedException("Sesi tidak berlaku");
    const grants = (
      await this.db.query(
        `SELECT binding.role_id,effective_permission.permission_id
         FROM user_bindings binding
         JOIN organization_sites os ON os.organization_id=binding.organization_id
          AND os.tenant_id=$2
         LEFT JOIN LATERAL (
          SELECT override_permission.permission_id
          FROM organization_role_overrides override
          JOIN organization_role_permissions override_permission
           ON override_permission.organization_id=override.organization_id
           AND override_permission.role_id=override.role_id
          WHERE override.organization_id=binding.organization_id
           AND override.role_id=binding.role_id
          UNION ALL
          SELECT default_permission.permission_id
          FROM role_permissions default_permission
          WHERE default_permission.role_id=binding.role_id
           AND NOT EXISTS(
            SELECT 1 FROM organization_role_overrides override
            WHERE override.organization_id=binding.organization_id
             AND override.role_id=binding.role_id
           )
         ) effective_permission ON true
         WHERE binding.account_id=$1 AND binding.status='ACTIVE'
         AND (binding.tenant_id IS NULL OR binding.tenant_id=$2)`,
        [user.account_id, tenantId],
      )
    ).rows;
    return {
      ...user,
      account_type: accountTypes[user.account_level as Actor["account_level"]],
      roles: [...new Set(grants.map((g) => g.role_id))],
      permissions: [
        ...new Set(grants.map((g) => g.permission_id).filter(Boolean)),
      ],
    };
  }
  async resolveTenant(req: Request, slug?: string) {
    const domain = (
      await this.db.query(
        "SELECT tenant_id FROM tenant_domains WHERE domain=$1 AND verified_at IS NOT NULL",
        [req.hostname.toLowerCase()],
      )
    ).rows[0]?.tenant_id;
    const header = req.header("X-Tenant-ID");
    const headerAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_TENANT_HEADER === "true";
    if (header && !headerAllowed)
      throw new ForbiddenException("Header tenant dinonaktifkan");
    const headerId = header ? uuid.parse(header) : undefined;
    const bySlug = slug
      ? (
          await this.db.query(
            `SELECT t.id FROM organizations o
             JOIN organization_sites os ON os.organization_id=o.id
             JOIN tenants t ON t.id=os.tenant_id
             WHERE o.slug=$1 AND o.status='ACTIVE' AND t.status='ACTIVE'
             ORDER BY os.is_primary DESC,t.created_at LIMIT 1`,
            [slug],
          )
        ).rows[0]?.id ||
        (
          await this.db.query(
            "SELECT id FROM tenants WHERE slug=$1 AND status='ACTIVE'",
            [slug],
          )
        ).rows[0]?.id
      : undefined;
    if (slug && !bySlug)
      throw new UnauthorizedException("Sekolah atau kredensial tidak valid");
    const ids = [domain, headerId, bySlug].filter(Boolean);
    if (new Set(ids).size > 1)
      throw new ForbiddenException("Tenant tidak sesuai domain atau header");
    return ids[0] as string | undefined;
  }
  async tokens(
    sql: Sql,
    userId: string,
    tenantId: string,
    req?: Request,
    existingSessionId?: string,
  ) {
    const refresh = randomBytes(48).toString("base64url");
    const session = existingSessionId
      ? { id: existingSessionId }
      : (
          await sql.query(
            `INSERT INTO user_sessions(tenant_id,user_id,ip_address,user_agent,expires_at)
             VALUES($1,$2,$3,$4,now()+interval '7 days') RETURNING id`,
            [
              tenantId,
              userId,
              req?.ip || null,
              req?.header("user-agent") || null,
            ],
          )
        ).rows[0];
    await sql.query(
      "INSERT INTO refresh_tokens(tenant_id,user_id,token_hash,expires_at,session_id) VALUES($1,$2,$3,now()+interval '7 days',$4)",
      [tenantId, userId, digest(refresh), session.id],
    );
    return {
      access_token: jwt.sign(
        { tenant_id: tenantId, sid: session.id },
        jwtSecret(),
        {
          subject: userId,
          expiresIn: "15m",
          issuer: "langkahsiswa",
          audience: "langkahsiswa",
        },
      ),
      refresh_token: refresh,
      expires_in: 900,
    };
  }
}
