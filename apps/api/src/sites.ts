import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { siteSchema, uuid } from "../../../packages/validation/src";
import { allow, AuthGuard, AuthRequest, AuthService } from "./auth";
import { Database } from "./database";

function refreshCookie(res: Response, value: string) {
  res.cookie("langkahsiswa_refresh", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 86400000,
  });
}

@Controller("api/v1/sites")
@UseGuards(AuthGuard)
export class SitesController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    allow(req.actor, "site.read");
    const data = (
      await this.db.query(
        `SELECT t.id,t.name,t.slug,os.site_code,os.is_primary,
         o.id AS organization_id,o.name AS organization_name,
         (t.id=$3) AS current,
         COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL),'{}') AS roles
         FROM organization_sites current_site
         JOIN organization_sites os ON os.organization_id=current_site.organization_id
         JOIN organizations o ON o.id=os.organization_id AND o.status='ACTIVE'
         JOIN tenants t ON t.id=os.tenant_id AND t.status='ACTIVE'
         JOIN users u ON u.tenant_id=t.id AND u.account_id=$1 AND u.active
         LEFT JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
         WHERE current_site.tenant_id=$2
         GROUP BY t.id,t.name,t.slug,os.site_code,os.is_primary,o.id,o.name
         ORDER BY os.is_primary DESC,t.name,t.id`,
        [req.actor.account_id, req.actor.tenant_id, req.actor.tenant_id],
      )
    ).rows;
    return {
      organization: {
        id: req.actor.organization_id,
        name: req.actor.organization_name,
      },
      data,
      total: data.length,
    };
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "site.write");
    const input = siteSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const duplicate = (
        await sql.query("SELECT 1 FROM tenants WHERE slug=$1", [input.slug])
      ).rowCount;
      if (duplicate)
        throw new ConflictException("Kode lokasi sudah digunakan");

      const organization = (
        await sql.query(
          `SELECT o.id FROM organizations o
           JOIN organization_sites os ON os.organization_id=o.id
           WHERE os.tenant_id=$1 AND o.status='ACTIVE'`,
          [req.actor.tenant_id],
        )
      ).rows[0];
      if (!organization) throw new NotFoundException("Yayasan tidak ditemukan");

      const sourceUser = (
        await sql.query(
          "SELECT name,email,password_hash,account_id FROM users WHERE tenant_id=$1 AND id=$2 AND active",
          [req.actor.tenant_id, req.actor.id],
        )
      ).rows[0];
      if (!sourceUser) throw new NotFoundException("Akun tidak ditemukan");

      const tenant = (
        await sql.query(
          "INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id,name,slug,status,created_at",
          [input.name, input.slug],
        )
      ).rows[0];
      await sql.query("INSERT INTO tenant_settings(tenant_id) VALUES($1)", [
        tenant.id,
      ]);
      await sql.query(
        "INSERT INTO organization_sites(organization_id,tenant_id,site_code) VALUES($1,$2,$3)",
        [organization.id, tenant.id, input.slug],
      );
      const localUser = (
        await sql.query(
          `INSERT INTO users(tenant_id,account_id,name,email,password_hash)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [
            tenant.id,
            sourceUser.account_id,
            sourceUser.name,
            sourceUser.email,
            sourceUser.password_hash,
          ],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'SCHOOL_ADMIN')",
        [tenant.id, localUser.id],
      );
      await sql.query(
        "INSERT INTO schools(tenant_id,name,address,phone,principal_name) VALUES($1,$2,$3,$4,$5)",
        [
          tenant.id,
          input.school_name || input.name,
          input.address || null,
          input.phone || null,
          input.principal_name || null,
        ],
      );
      return {
        ...tenant,
        site_code: input.slug,
        is_primary: false,
        organization_id: organization.id,
      };
    });
  }

  @Post(":id/switch")
  async switch(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
  ) {
    allow(req.actor, "site.read");
    const targetId = uuid.parse(id);
    const target = (
      await this.db.query(
        `SELECT target_user.id AS user_id,target.id AS tenant_id
         FROM organization_sites current_site
         JOIN organization_sites target_site
           ON target_site.organization_id=current_site.organization_id
         JOIN tenants target ON target.id=target_site.tenant_id AND target.status='ACTIVE'
         JOIN users target_user
           ON target_user.tenant_id=target.id AND target_user.account_id=$1 AND target_user.active
         WHERE current_site.tenant_id=$2 AND target.id=$3`,
        [req.actor.account_id, req.actor.tenant_id, targetId],
      )
    ).rows[0];
    if (!target) throw new NotFoundException("Akses lokasi tidak ditemukan");

    const result = await this.db.transaction(target.tenant_id, async (sql) => ({
      ...(await this.auth.tokens(
        sql,
        target.user_id,
        target.tenant_id,
        req,
      )),
      user: await this.auth.actor(target.user_id, target.tenant_id),
    }));
    refreshCookie(res, result.refresh_token);
    res.setHeader("Cache-Control", "no-store");
    return result;
  }
}
