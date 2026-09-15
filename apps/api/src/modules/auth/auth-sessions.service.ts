import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { compare } from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { Actor } from "../../../../../packages/shared-types/src";
import { loginSchema } from "../../../../../packages/validation/src";
import { AuthService } from "./auth.service";
import {
  GoogleIdentityVerifier,
  googleClientIds,
} from "./google-identity.verifier";
import { digest } from "./token-hash";
@Injectable()
export class AuthSessionsService {
  private readonly attempts = new Map<
    string,
    {
      count: number;
      until: number;
    }
  >();
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(GoogleIdentityVerifier)
    private readonly google: GoogleIdentityVerifier,
  ) {}
  private cookie(res: Response, value: string, remember = false) {
    const base = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api/v1/auth",
    };
    res.cookie("langkahsiswa_refresh", value, {
      ...base,
      ...(remember ? { maxAge: 7 * 86400000 } : {}),
    });
    if (remember)
      res.cookie("langkahsiswa_remember", "1", {
        ...base,
        maxAge: 7 * 86400000,
      });
    else res.clearCookie("langkahsiswa_remember", { path: base.path });
  }
  private throttle(req: Request) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until < now) this.attempts.delete(key);
    const key = req.ip || "local";
    const attempts = this.attempts.get(key) || { count: 0, until: now + 60000 };
    if (++attempts.count > 30)
      throw new UnauthorizedException(
        "Terlalu banyak percobaan. Coba lagi dalam satu menit.",
      );
    this.attempts.set(key, attempts);
  }
  googleConfig() {
    const clients = googleClientIds();
    return { enabled: clients.length > 0, client_id: clients[0] || null };
  }
  async googleLogin(req: Request, body: unknown, res: Response) {
    this.throttle(req);
    // GIS callback uses JSON fetch. Reject form POSTs to prevent login CSRF;
    // browser Origins are allowlisted globally, native clients use JSON too.
    if (!req.is("application/json"))
      throw new ForbiddenException("Login Google memerlukan JSON");
    const input = z
      .object({
        tenant_slug: z.string().min(1).max(80).optional(),
        organization_code: z.string().min(1).max(80).optional(),
        account_type: z
          .enum(["SCHOOL_ADMIN", "FAMILY", "SCHOOL_TENANT"])
          .optional(),
        credential: z.string().min(20).max(10000),
        account_password: z.string().min(1).max(200).optional(),
        remember: z.boolean().optional().default(false),
      })
      .strict()
      .parse(body);
    const organizationCode = (
      input.organization_code ||
      input.tenant_slug ||
      ""
    ).toLowerCase();
    const tenantId = await this.auth.resolveTenant(req, organizationCode);
    if (!tenantId) throw new UnauthorizedException("Yayasan wajib ditentukan");
    const identity = await this.google.verify(input.credential);
    const result = await this.auth.db.transaction(tenantId, async (sql) => {
      const linked = (
        await sql.query(
          `SELECT u.* FROM user_identities i
           JOIN users u ON u.tenant_id=i.tenant_id AND u.id=i.user_id
           JOIN accounts a ON a.id=u.account_id
           JOIN tenants t ON t.id=u.tenant_id
           JOIN organization_sites os ON os.tenant_id=u.tenant_id
           WHERE i.tenant_id=$1 AND i.provider='GOOGLE' AND i.subject=$2
             AND EXISTS(SELECT 1 FROM user_bindings b
              WHERE b.account_id=a.id AND b.organization_id=os.organization_id
              AND b.status='ACTIVE' AND (b.tenant_id IS NULL OR b.tenant_id=u.tenant_id))
             AND u.active AND u.status='ACTIVE' AND a.active AND t.status='ACTIVE'`,
          [tenantId, identity.subject],
        )
      ).rows[0];
      let user = linked;
      if (!user) {
        user = (
          await sql.query(
            `SELECT u.* FROM users u JOIN accounts a ON a.id=u.account_id
             JOIN tenants t ON t.id=u.tenant_id
             JOIN organization_sites os ON os.tenant_id=u.tenant_id
             WHERE u.tenant_id=$1 AND u.email=$2
               AND EXISTS(SELECT 1 FROM user_bindings b
                WHERE b.account_id=a.id AND b.organization_id=os.organization_id
                AND b.status='ACTIVE' AND (b.tenant_id IS NULL OR b.tenant_id=u.tenant_id))
               AND u.active AND u.status='ACTIVE' AND a.active AND t.status='ACTIVE'`,
            [tenantId, identity.email],
          )
        ).rows[0];
        if (!user)
          throw new UnauthorizedException(
            "Akun Google belum terdaftar di sekolah ini. Hubungi administrator sekolah.",
          );
        if (
          !identity.authoritative &&
          (!input.account_password ||
            !(await compare(input.account_password, user.password_hash)))
        ) {
          throw new UnauthorizedException(
            "GOOGLE_LINK_REQUIRED: Masukkan kata sandi akun sekolah untuk menghubungkan email Google ini pertama kali.",
          );
        }
        const existing = (
          await sql.query(
            "SELECT subject FROM user_identities WHERE tenant_id=$1 AND user_id=$2 AND provider='GOOGLE'",
            [tenantId, user.id],
          )
        ).rows[0];
        if (existing)
          throw new UnauthorizedException(
            "Akun sekolah sudah terhubung ke identitas Google lain",
          );
        await sql.query(
          "INSERT INTO user_identities(tenant_id,user_id,provider,subject) VALUES($1,$2,'GOOGLE',$3)",
          [tenantId, user.id, identity.subject],
        );
      }
      await sql.query(
        "UPDATE users SET last_login_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, user.id],
      );
      return {
        ...(await this.auth.tokens(sql, user.id, tenantId, req)),
        user: await this.auth.actor(user.id, tenantId),
      };
    });
    await this.auth.db.query(
      "INSERT INTO login_history(tenant_id,user_id,email,provider,success,ip_address,user_agent) VALUES($1,$2,$3,'GOOGLE',true,$4,$5)",
      [
        tenantId,
        result.user.id,
        result.user.email,
        req.ip || null,
        req.header("user-agent") || null,
      ],
    );
    this.cookie(res, result.refresh_token, input.remember);
    return result;
  }
  async login(req: Request, body: unknown, res: Response) {
    this.throttle(req);
    const input = loginSchema.parse(body);
    const organizationCode = (
      input.organization_code ||
      input.tenant_slug ||
      ""
    ).toLowerCase();
    const tenantId = await this.auth.resolveTenant(req, organizationCode);
    if (!tenantId) throw new UnauthorizedException("Yayasan wajib ditentukan");
    const user = (
      await this.auth.db.query(
        `SELECT u.* FROM organization_sites requested
         JOIN organization_sites available
           ON available.organization_id=requested.organization_id
         JOIN users u ON u.tenant_id=available.tenant_id
         JOIN accounts a ON a.id=u.account_id
         JOIN tenants t ON t.id=u.tenant_id
         WHERE requested.tenant_id=$1 AND u.email=$2
           AND EXISTS(SELECT 1 FROM user_bindings b
            WHERE b.account_id=a.id AND b.organization_id=requested.organization_id
            AND b.status='ACTIVE' AND (b.tenant_id IS NULL OR b.tenant_id=u.tenant_id))
           AND u.active AND u.status='ACTIVE' AND a.active AND t.status='ACTIVE'
         ORDER BY available.is_primary DESC,u.created_at LIMIT 1`,
        [tenantId, input.email],
      )
    ).rows[0];
    if (!user || !(await compare(input.password, user.password_hash))) {
      await this.auth.db.query(
        "INSERT INTO login_history(tenant_id,email,provider,success,failure_reason,ip_address,user_agent) VALUES($1,$2,'PASSWORD',false,'INVALID_CREDENTIALS',$3,$4)",
        [
          tenantId,
          input.email,
          req.ip || null,
          req.header("user-agent") || null,
        ],
      );
      throw new UnauthorizedException("Sekolah atau kredensial tidak valid");
    }
    const authenticatedTenantId = user.tenant_id;
    const tokens = await this.auth.db.transaction(
      authenticatedTenantId,
      async (sql) => {
        await sql.query(
          "UPDATE users SET last_login_at=now() WHERE tenant_id=$1 AND id=$2",
          [authenticatedTenantId, user.id],
        );
        return this.auth.tokens(sql, user.id, authenticatedTenantId, req);
      },
    );
    await this.auth.db.query(
      "INSERT INTO login_history(tenant_id,user_id,email,provider,success,ip_address,user_agent) VALUES($1,$2,$3,'PASSWORD',true,$4,$5)",
      [
        authenticatedTenantId,
        user.id,
        user.email,
        req.ip || null,
        req.header("user-agent") || null,
      ],
    );
    this.cookie(res, tokens.refresh_token, input.remember);
    res.setHeader("Cache-Control", "no-store");
    return {
      ...tokens,
      user: await this.auth.actor(user.id, authenticatedTenantId),
    };
  }
  async refresh(req: Request, body: unknown, res: Response) {
    const input = z
      .object({ refresh_token: z.string().min(20).max(200).optional() })
      .strict()
      .parse(body || {});
    const token = input.refresh_token || req.cookies?.langkahsiswa_refresh;
    if (!token) throw new UnauthorizedException("Refresh token diperlukan");
    const resolved = await this.auth.resolveTenant(req);
    const result = await this.auth.db.transaction(null, async (sql) => {
      const old = (
        await sql.query(
          `SELECT r.* FROM refresh_tokens r JOIN user_sessions s ON s.tenant_id=r.tenant_id AND s.id=r.session_id
           WHERE r.token_hash=$1 AND s.status='ACTIVE' AND s.expires_at>now() FOR UPDATE OF r,s`,
          [digest(token)],
        )
      ).rows[0];
      if (
        !old ||
        old.revoked_at ||
        new Date(old.expires_at).getTime() <= Date.now()
      )
        throw new UnauthorizedException("Refresh token tidak berlaku");
      if (resolved && resolved !== old.tenant_id)
        throw new ForbiddenException("Tenant tidak sesuai");
      const actor = await this.auth.actor(old.user_id, old.tenant_id);
      await sql.query(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1",
        [old.id],
      );
      await sql.query(
        "UPDATE user_sessions SET last_seen_at=now(),expires_at=now()+interval '7 days' WHERE id=$1",
        [old.session_id],
      );
      return {
        ...(await this.auth.tokens(
          sql,
          old.user_id,
          old.tenant_id,
          req,
          old.session_id,
        )),
        user: actor,
      };
    });
    await this.auth.db.query(
      "INSERT INTO login_history(tenant_id,user_id,email,provider,success,ip_address,user_agent) VALUES($1,$2,$3,'REFRESH',true,$4,$5)",
      [
        result.user.tenant_id,
        result.user.id,
        result.user.email,
        req.ip || null,
        req.header("user-agent") || null,
      ],
    );
    this.cookie(
      res,
      result.refresh_token,
      req.cookies?.langkahsiswa_remember === "1",
    );
    res.setHeader("Cache-Control", "no-store");
    return result;
  }
  async logout(req: Request, body: unknown, res: Response) {
    const input = z
      .object({ refresh_token: z.string().min(20).max(200).optional() })
      .strict()
      .parse(body || {});
    const refresh = input.refresh_token || req.cookies?.langkahsiswa_refresh;
    if (refresh) {
      await this.auth.db.query(
        `UPDATE user_sessions SET status='REVOKED',revoked_at=now() WHERE id=(
         SELECT session_id FROM refresh_tokens WHERE token_hash=$1) AND status='ACTIVE'`,
        [digest(refresh)],
      );
      await this.auth.db.query(
        "UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1",
        [digest(refresh)],
      );
    }
    res.clearCookie("langkahsiswa_refresh", { path: "/api/v1/auth" });
    res.clearCookie("langkahsiswa_remember", { path: "/api/v1/auth" });
    return { ok: true };
  }
  me(actor: Actor) {
    return actor;
  }
}
