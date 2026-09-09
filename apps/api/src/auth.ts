import {
  Body,
  BadRequestException,
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
import {
  AccountType,
  Actor,
  Role,
  roles,
} from "../../../packages/shared-types/src";
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
    "site.read",
  ],
  STAFF: [
    "school.read",
    "student.read",
    "student.create",
    "student.update",
    "people.read",
    "people.write",
    "user.write",
    "admission.read",
    "admission.write",
    "event.read",
    "notification.read",
    "site.read",
  ],
  FOUNDATION_STAFF: [
    "school.read",
    "student.read",
    "people.read",
    "finance.read",
    "report.read",
    "event.read",
    "admission.read",
    "site.read",
  ],
  FOUNDATION_HEAD: [
    "school.read",
    "school.write",
    "student.read",
    "people.read",
    "academic.read",
    "finance.read",
    "report.read",
    "report.approve",
    "event.read",
    "admission.read",
    "audit.read",
    "site.read",
    "site.write",
  ],
  PARENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
    "site.read",
    "family.read",
    "family.write",
    "family.student.manage",
  ],
  STUDENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
    "site.read",
    "family.read",
  ],
  CANTEEN_ADMIN: [
    "student.read",
    "finance.read",
    "wallet.read",
    "pos.write",
    "event.read",
    "notification.read",
    "site.read",
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
const accountLevels: Record<AccountType, Actor["account_level"]> = {
  SCHOOL_ADMIN: "OPERATIONAL",
  FAMILY: "FAMILY",
  SCHOOL_TENANT: "TENANT",
};
const accountTypes: Record<Actor["account_level"], AccountType> = {
  OPERATIONAL: "SCHOOL_ADMIN",
  FAMILY: "FAMILY",
  TENANT: "SCHOOL_TENANT",
};
const accountRealmMembership = `(a.account_level='OPERATIONAL' AND EXISTS(
  SELECT 1 FROM operational_accounts realm WHERE realm.account_id=a.id
)) OR (a.account_level='FAMILY' AND EXISTS(
  SELECT 1 FROM family_accounts realm WHERE realm.account_id=a.id
)) OR (a.account_level='TENANT' AND EXISTS(
  SELECT 1 FROM tenant_accounts realm WHERE realm.account_id=a.id
))`;
export async function initializeRoles(sql: Sql) {
  for (const role of roles) {
    const level =
      role === "PARENT" || role === "STUDENT"
        ? "FAMILY"
        : role === "CANTEEN_ADMIN"
          ? "TENANT"
          : "OPERATIONAL";
    await sql.query(
      "INSERT INTO roles(id,account_level) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET account_level=excluded.account_level",
      [role, level],
    );
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
      "INSERT INTO accounts(name,email,account_level) VALUES($1,$2,'OPERATIONAL') ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id,account_level",
      [input.admin_name, input.admin_email],
    )
  ).rows[0];
  if (account.account_level !== "OPERATIONAL")
    throw new BadRequestException("Email sudah digunakan oleh akun keluarga");
  await sql.query(
    "INSERT INTO operational_accounts(account_id,position) VALUES($1,'STAFF') ON CONFLICT DO NOTHING",
    [account.id],
  );
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
        `SELECT u.id,u.tenant_id,u.account_id,a.account_level,u.name,u.email,
         t.name AS tenant_name,t.slug AS tenant_slug,
         o.id AS organization_id,o.name AS organization_name
         FROM users u
         JOIN tenants t ON t.id=u.tenant_id
         JOIN organization_sites os ON os.tenant_id=t.id
         JOIN organizations o ON o.id=os.organization_id
         JOIN accounts a ON a.id=u.account_id
         WHERE u.id=$1 AND u.tenant_id=$2 AND u.active AND a.active
         AND (${accountRealmMembership})
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
      account_type: accountTypes[user.account_level as Actor["account_level"]],
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
    const accountLevel = input.account_type
      ? accountLevels[input.account_type]
      : null;
    const identity = await this.google.verify(input.credential);
    const result = await this.auth.db.transaction(tenantId, async (sql) => {
      const linked = (
        await sql.query(
          `SELECT u.* FROM user_identities i
           JOIN users u ON u.tenant_id=i.tenant_id AND u.id=i.user_id
           JOIN accounts a ON a.id=u.account_id
           JOIN tenants t ON t.id=u.tenant_id
           WHERE i.tenant_id=$1 AND i.provider='GOOGLE' AND i.subject=$2
             AND ($3::text IS NULL OR a.account_level=$3) AND (${accountRealmMembership})
             AND u.active AND a.active AND t.status='ACTIVE'`,
          [tenantId, identity.subject, accountLevel],
        )
      ).rows[0];
      let user = linked;
      if (!user) {
        user = (
          await sql.query(
            `SELECT u.* FROM users u JOIN accounts a ON a.id=u.account_id
             JOIN tenants t ON t.id=u.tenant_id
             WHERE u.tenant_id=$1 AND u.email=$2
               AND ($3::text IS NULL OR a.account_level=$3)
               AND (${accountRealmMembership})
               AND u.active AND a.active AND t.status='ACTIVE'`,
            [tenantId, identity.email, accountLevel],
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
    this.cookie(res, result.refresh_token, input.remember);
    return result;
  }
  @Post("login") async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.throttle(req);
    const input = loginSchema.parse(body);
    const organizationCode = (
      input.organization_code ||
      input.tenant_slug ||
      ""
    ).toLowerCase();
    const tenantId = await this.auth.resolveTenant(req, organizationCode);
    if (!tenantId) throw new UnauthorizedException("Yayasan wajib ditentukan");
    const accountLevel = input.account_type
      ? accountLevels[input.account_type]
      : null;
    const user = (
      await this.auth.db.query(
        `SELECT u.* FROM organization_sites requested
         JOIN organization_sites available
           ON available.organization_id=requested.organization_id
         JOIN users u ON u.tenant_id=available.tenant_id
         JOIN accounts a ON a.id=u.account_id
         JOIN tenants t ON t.id=u.tenant_id
         WHERE requested.tenant_id=$1 AND u.email=$2
           AND ($3::text IS NULL OR a.account_level=$3)
           AND (${accountRealmMembership})
           AND u.active AND a.active AND t.status='ACTIVE'
         ORDER BY available.is_primary DESC,u.created_at LIMIT 1`,
        [tenantId, input.email, accountLevel],
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
      (sql) => this.auth.tokens(sql, user.id, authenticatedTenantId, req),
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
    this.cookie(
      res,
      result.refresh_token,
      req.cookies?.langkahsiswa_remember === "1",
    );
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
    res.clearCookie("langkahsiswa_remember", { path: "/api/v1/auth" });
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
        `SELECT u.id,u.tenant_id,u.name,u.email,u.active,a.account_level,
         COALESCE(array_agg(ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL),'{}') AS roles
         FROM users u JOIN accounts a ON a.id=u.account_id
         LEFT JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
         WHERE u.tenant_id=$1 GROUP BY u.id,a.account_level ORDER BY u.name`,
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length, page: 1, limit: data.length };
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "user.write");
    const input = userSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      if (
        input.roles.includes("SUPER_ADMIN") &&
        !req.actor.roles.includes("SUPER_ADMIN")
      )
        throw new BadRequestException(
          "Hanya super admin yang dapat memberikan role SUPER_ADMIN",
        );
      const familyRoles = input.roles.filter((role) =>
        ["PARENT", "STUDENT"].includes(role),
      );
      if (familyRoles.length && familyRoles.length !== input.roles.length)
        throw new BadRequestException(
          "Role operational dan keluarga tidak dapat digabung dalam satu akun",
        );
      const requestedType =
        input.account_type ||
        (familyRoles.length
          ? "FAMILY"
          : input.roles.includes("CANTEEN_ADMIN")
            ? "SCHOOL_TENANT"
            : "SCHOOL_ADMIN");
      const accountLevel = accountLevels[requestedType];
      const configuredRoles = (
        await sql.query(
          "SELECT id,account_level FROM roles WHERE id=ANY($1::text[])",
          [input.roles],
        )
      ).rows;
      if (configuredRoles.length !== new Set(input.roles).size)
        throw new BadRequestException("Role belum terdaftar");
      if (configuredRoles.some((role) => role.account_level !== accountLevel))
        throw new BadRequestException(
          "Role dan jenis akun harus berada pada ruang akses yang sama",
        );
      const account = (
        await sql.query(
          "INSERT INTO accounts(name,email,account_level) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id,account_level",
          [input.name, input.email, accountLevel],
        )
      ).rows[0];
      if (account.account_level !== accountLevel)
        throw new BadRequestException(
          "Email sudah terdaftar pada kategori akun yang berbeda",
        );
      if (accountLevel === "FAMILY")
        await sql.query(
          "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SCHOOL_ADMIN') ON CONFLICT DO NOTHING",
          [account.id],
        );
      else if (accountLevel === "OPERATIONAL")
        await sql.query(
          "INSERT INTO operational_accounts(account_id,position) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [
            account.id,
            input.roles.includes("FOUNDATION_HEAD")
              ? "FOUNDATION_HEAD"
              : input.roles.includes("FOUNDATION_STAFF")
                ? "FOUNDATION_STAFF"
                : input.roles.includes("PRINCIPAL")
                  ? "PRINCIPAL"
                  : input.roles.includes("TEACHER")
                    ? "TEACHER"
                    : "STAFF",
          ],
        );
      else
        await sql.query(
          "INSERT INTO tenant_accounts(account_id,tenant_kind) VALUES($1,'CANTEEN') ON CONFLICT DO NOTHING",
          [account.id],
        );
      const membership = (
        await sql.query(
          "INSERT INTO users(tenant_id,account_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,tenant_id,account_id,name,email",
          [
            req.actor.tenant_id,
            account.id,
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
