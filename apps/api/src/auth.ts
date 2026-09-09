import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Actor, Role, roles } from "../../../packages/shared-types/src";
import {
  loginSchema,
  tenantSchema,
  userSchema,
  uuid,
} from "../../../packages/validation/src";
import { Database, Sql } from "./database";
import { jwtSecret } from "./config";
import { GoogleIdentityVerifier, googleClientIds } from "./google-identity";
export type AuthRequest = Request & { actor: Actor };
const read = [
  "school.read",
  "student.read",
  "people.read",
  "academic.read",
  "attendance.read",
  "grade.read",
  "report.read",
  "event.read",
  "notification.read",
  "site.read",
];
export const rolePermissions: Record<Role, string[]> = {
  SUPER_ADMIN: ["*"],
  SCHOOL_ADMIN: ["*"],
  PRINCIPAL: [
    ...read,
    "report.approve",
    "report.publish",
    "event.write",
    "event.read",
    "notification.read",
    "admission.read",
    "admission.write",
    "file.read",
    "website.read",
    "domain.read",
    "boarding.read",
    "boarding.write",
    "library.read",
    "library.write",
    "audit.read",
  ],
  TEACHER: [
    ...read,
    "attendance.write",
    "grade.write",
    "report.calculate",
    "report.review",
    "boarding.read",
    "library.read",
  ],
  FINANCE: [
    "student.read",
    "people.read",
    "school.read",
    "payment.verify",
    "finance.read",
    "finance.write",
    "wallet.read",
    "wallet.write",
    "pos.write",
    "event.read",
    "notification.read",
    "file.read",
  ],
  PARENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
  ],
  STUDENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
  ],
};
export function allow(actor: Actor, permission: string) {
  if (
    !actor.permissions.includes("*") &&
    !actor.permissions.includes(permission)
  )
    throw new ForbiddenException("Hak akses tidak mencukupi");
}
export function isAdmin(actor: Actor) {
  return (
    actor.roles.includes("SUPER_ADMIN") || actor.roles.includes("SCHOOL_ADMIN")
  );
}
export async function initializeRoles(sql: Sql) {
  for (const role of roles) {
    await sql.query("INSERT INTO roles(id) VALUES($1) ON CONFLICT DO NOTHING", [
      role,
    ]);
    for (const permission of rolePermissions[role]) {
      await sql.query(
        "INSERT INTO permissions(id) VALUES($1) ON CONFLICT DO NOTHING",
        [permission],
      );
      await sql.query(
        "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [role, permission],
      );
    }
  }
}
export async function createTenant(
  sql: Sql,
  input: z.infer<typeof tenantSchema>,
) {
  const tenant = (
    await sql.query(
      "INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING *",
      [input.name, input.slug],
    )
  ).rows[0];
  const organization = (
    await sql.query(
      "INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id",
      [input.name, input.slug],
    )
  ).rows[0];
  await sql.query(
    "INSERT INTO organization_sites(organization_id,tenant_id,site_code,is_primary) VALUES($1,$2,$3,true)",
    [organization.id, tenant.id, input.slug],
  );
  await sql.query("INSERT INTO tenant_settings(tenant_id) VALUES($1)", [
    tenant.id,
  ]);
  const account = (
    await sql.query(
      "INSERT INTO accounts(name,email) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id",
      [input.admin_name, input.admin_email],
    )
  ).rows[0];
  const user = (
    await sql.query(
      "INSERT INTO users(tenant_id,account_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [
        tenant.id,
        account.id,
        input.admin_name,
        input.admin_email,
        await hash(input.admin_password, 12),
      ],
    )
  ).rows[0];
  await sql.query(
    "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'SCHOOL_ADMIN')",
    [tenant.id, user.id],
  );
  return tenant;
}
@Injectable()
export class AuthService {
  constructor(@Inject(Database) readonly db: Database) {}
  async actor(userId: string, tenantId: string): Promise<Actor> {
    const user = (
      await this.db.query(
        `SELECT u.id,u.tenant_id,u.account_id,u.name,u.email,
         t.name AS tenant_name,t.slug AS tenant_slug,
         o.id AS organization_id,o.name AS organization_name
         FROM users u
         JOIN tenants t ON t.id=u.tenant_id
         JOIN organization_sites os ON os.tenant_id=t.id
         JOIN organizations o ON o.id=os.organization_id
         JOIN accounts a ON a.id=u.account_id
         WHERE u.id=$1 AND u.tenant_id=$2 AND u.active AND a.active
         AND t.status='ACTIVE' AND o.status='ACTIVE'`,
        [userId, tenantId],
      )
    ).rows[0];
    if (!user) throw new UnauthorizedException("Sesi tidak berlaku");
    const grants = (
      await this.db.query(
        "SELECT ur.role_id,rp.permission_id FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.tenant_id=$1 AND ur.user_id=$2",
        [tenantId, userId],
      )
    ).rows;
    return {
      ...user,
      roles: [...new Set(grants.map((g) => g.role_id))],
      permissions: [...new Set(grants.map((g) => g.permission_id))],
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
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException("Silakan masuk");
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, jwtSecret(), {
        algorithms: ["HS256"],
        issuer: "langkahsiswa",
        audience: "langkahsiswa",
      }) as jwt.JwtPayload;
      uuid.parse(claims.sub);
      uuid.parse(claims.tenant_id);
      uuid.parse(claims.sid);
    } catch {
      throw new UnauthorizedException("Token tidak valid atau kedaluwarsa");
    }
    const resolved = await this.auth.resolveTenant(req);
    if (resolved && resolved !== claims.tenant_id)
      throw new ForbiddenException("Token berasal dari tenant lain");
    const session = (
      await this.auth.db.query(
        "SELECT id FROM user_sessions WHERE tenant_id=$1 AND user_id=$2 AND id=$3 AND status='ACTIVE' AND expires_at>now()",
        [claims.tenant_id, claims.sub, claims.sid],
      )
    ).rows[0];
    if (!session) throw new UnauthorizedException("Sesi telah dicabut");
    await this.auth.db.query(
      "UPDATE user_sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '5 minutes'",
      [session.id],
    );
    req.actor = await this.auth.actor(claims.sub!, claims.tenant_id);
    return true;
  }
}
@Controller("api/v1/auth")
export class AuthController {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GoogleIdentityVerifier)
    private readonly google: GoogleIdentityVerifier,
  ) {}
  private cookie(res: Response, value: string) {
    res.cookie("langkahsiswa_refresh", value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 7 * 86400000,
    });
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
  @Get("google/config") googleConfig() {
    const clients = googleClientIds();
    return { enabled: clients.length > 0, client_id: clients[0] || null };
  }
  @Post("google") async googleLogin(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.throttle(req);
    // GIS callback uses JSON fetch. Reject form POSTs to prevent login CSRF;
    // browser Origins are allowlisted globally, native clients use JSON too.
    if (!req.is("application/json"))
      throw new ForbiddenException("Login Google memerlukan JSON");
    const input = z
      .object({
        tenant_slug: z.string().min(1).max(80).optional(),
        credential: z.string().min(20).max(10000),
        account_password: z.string().min(1).max(200).optional(),
      })
      .strict()
      .parse(body);
    const tenantId = await this.auth.resolveTenant(req, input.tenant_slug);
    if (!tenantId) throw new UnauthorizedException("Sekolah wajib ditentukan");
    const identity = await this.google.verify(input.credential);
    const result = await this.auth.db.transaction(tenantId, async (sql) => {
      const linked = (
        await sql.query(
          "SELECT u.* FROM user_identities i JOIN users u ON u.tenant_id=i.tenant_id AND u.id=i.user_id JOIN tenants t ON t.id=u.tenant_id WHERE i.tenant_id=$1 AND i.provider='GOOGLE' AND i.subject=$2 AND u.active AND t.status='ACTIVE'",
          [tenantId, identity.subject],
        )
      ).rows[0];
      let user = linked;
      if (!user) {
        user = (
          await sql.query(
            "SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.tenant_id=$1 AND u.email=$2 AND u.active AND t.status='ACTIVE'",
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
    this.cookie(res, result.refresh_token);
    return result;
  }
  @Post("login") async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.throttle(req);
    const input = loginSchema.parse(body);
    const tenantId = await this.auth.resolveTenant(req, input.tenant_slug);
    if (!tenantId) throw new UnauthorizedException("Sekolah wajib ditentukan");
    const user = (
      await this.auth.db.query(
        "SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.tenant_id=$1 AND u.email=$2 AND u.active AND t.status='ACTIVE'",
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
    const tokens = await this.auth.db.transaction(tenantId, (sql) =>
      this.auth.tokens(sql, user.id, tenantId, req),
    );
    await this.auth.db.query(
      "INSERT INTO login_history(tenant_id,user_id,email,provider,success,ip_address,user_agent) VALUES($1,$2,$3,'PASSWORD',true,$4,$5)",
      [
        tenantId,
        user.id,
        user.email,
        req.ip || null,
        req.header("user-agent") || null,
      ],
    );
    this.cookie(res, tokens.refresh_token);
    res.setHeader("Cache-Control", "no-store");
    return { ...tokens, user: await this.auth.actor(user.id, tenantId) };
  }
  @Post("refresh") async refresh(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
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
    this.cookie(res, result.refresh_token);
    res.setHeader("Cache-Control", "no-store");
    return result;
  }
  @Post("logout") async logout(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
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
    return { ok: true };
  }
  @Get("me") @UseGuards(AuthGuard) me(@Req() req: AuthRequest) {
    return req.actor;
  }
}
@Controller("api/v1/users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() async list(@Req() req: AuthRequest) {
    allow(req.actor, "people.read");
    const data = (
      await this.db.query(
        "SELECT id,tenant_id,name,email,active FROM users WHERE tenant_id=$1 ORDER BY name",
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length, page: 1, limit: data.length };
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "user.write");
    const input = userSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const user = (
        await sql.query(
          "INSERT INTO accounts(name,email) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id",
          [input.name, input.email],
        )
      ).rows[0];
      const membership = (
        await sql.query(
          "INSERT INTO users(tenant_id,account_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,tenant_id,account_id,name,email",
          [
            req.actor.tenant_id,
            user.id,
            input.name,
            input.email,
            await hash(input.password, 12),
          ],
        )
      ).rows[0];
      for (const role of new Set(input.roles))
        await sql.query(
          "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)",
          [req.actor.tenant_id, membership.id, role],
        );
      return membership;
    });
  }
}
