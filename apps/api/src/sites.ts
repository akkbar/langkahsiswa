import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  sitePhotoSchema,
  siteSchema,
  siteUpdateSchema,
  uuid,
} from "../../../packages/validation/src";
import { allow, AuthGuard, AuthRequest, AuthService } from "./auth";
import { Database, type Sql } from "./database";
import { readManagedFile, saveManagedFile } from "./file-storage";

function refreshCookie(res: Response, value: string, remember = false) {
  res.cookie("langkahsiswa_refresh", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    ...(remember ? { maxAge: 7 * 86400000 } : {}),
  });
}

async function ensureGradeLevels(
  sql: Sql,
  tenantId: string,
  schoolId: string,
  schoolLevel: "PAUD" | "TK" | "SD" | "SMP" | "SMA",
) {
  if (["PAUD", "TK"].includes(schoolLevel)) {
    const existing = await sql.query(
      "SELECT 1 FROM grade_levels WHERE tenant_id=$1 AND school_id=$2 LIMIT 1",
      [tenantId, schoolId],
    );
    if (!existing.rowCount)
      await sql.query(
        "INSERT INTO grade_levels(tenant_id,school_id,name,level) VALUES($1,$2,'Kelompok A',1)",
        [tenantId, schoolId],
      );
    return;
  }
  const range =
    schoolLevel === "SD"
      ? [1, 2, 3, 4, 5, 6]
      : schoolLevel === "SMP"
        ? [7, 8, 9]
        : [10, 11, 12];
  for (const level of range)
    await sql.query(
      `INSERT INTO grade_levels(tenant_id,school_id,name,level)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,school_id,level) DO UPDATE SET name=excluded.name`,
      [tenantId, schoolId, `Kelas ${level}`, level],
    );
}

const siteSelect = `
  SELECT t.id,t.name,t.slug,os.site_code,os.is_primary,
   o.id AS organization_id,o.name AS organization_name,
   (t.id=$3) AS current,
   COALESCE(array_agg(DISTINCT binding.role_id) FILTER (WHERE binding.role_id IS NOT NULL),'{}') AS roles,
   CASE WHEN bool_or(binding.tenant_id IS NULL) THEN 'FOUNDATION' ELSE 'SCHOOL' END AS binding_scope,
   sch.id AS school_id,
   sch.name AS school_name,
   sch.address,
   sch.phone,
   sch.principal_teacher_id,
   sch.education_authority,
   sch.school_level,
   sch.npsn,
   sch.nss,
   sch.dapodik_id,
   sch.nsm,
   sch.emis_id,
   COALESCE(pt.name, sch.principal_name) AS principal_name,
   COALESCE((
     SELECT json_agg(json_build_object('id', mf.id, 'file_name', mf.file_name, 'mime_type', mf.mime_type) ORDER BY fl.created_at)
     FROM file_links fl
     JOIN managed_files mf ON mf.tenant_id=fl.tenant_id AND mf.id=fl.file_id AND mf.deleted_at IS NULL
     WHERE fl.tenant_id=t.id AND fl.entity_type='SCHOOL' AND fl.entity_id=sch.id
   ), '[]'::json) AS photos
   FROM organization_sites current_site
   JOIN organization_sites os ON os.organization_id=current_site.organization_id
   JOIN organizations o ON o.id=os.organization_id AND o.status='ACTIVE'
   JOIN tenants t ON t.id=os.tenant_id AND t.status='ACTIVE'
   JOIN user_bindings binding ON binding.account_id=$1
    AND binding.organization_id=o.id AND binding.status='ACTIVE'
    AND (binding.tenant_id IS NULL OR binding.tenant_id=t.id)
   LEFT JOIN schools sch ON sch.tenant_id=t.id
   LEFT JOIN teachers pt ON pt.tenant_id=sch.tenant_id AND pt.id=sch.principal_teacher_id
   WHERE current_site.tenant_id=$2
   GROUP BY t.id,t.name,t.slug,os.site_code,os.is_primary,o.id,o.name,
     sch.id,sch.name,sch.address,sch.phone,sch.principal_teacher_id,sch.principal_name,
     sch.education_authority,sch.school_level,sch.npsn,sch.nss,sch.dapodik_id,sch.nsm,sch.emis_id,pt.name
   ORDER BY os.is_primary DESC,t.name,t.id`;

async function assertSiteAccess(
  db: Database,
  accountId: string,
  currentTenantId: string,
  targetTenantId: string,
) {
  const row = (
    await db.query(
      `SELECT 1 FROM organization_sites current_site
       JOIN organization_sites target_site ON target_site.organization_id=current_site.organization_id
       JOIN tenants target ON target.id=target_site.tenant_id AND target.status='ACTIVE'
       WHERE current_site.tenant_id=$2 AND target.id=$3
       AND EXISTS(SELECT 1 FROM user_bindings binding
        WHERE binding.account_id=$1
        AND binding.organization_id=current_site.organization_id
        AND binding.status='ACTIVE'
        AND (binding.tenant_id IS NULL OR binding.tenant_id=target.id))`,
      [accountId, currentTenantId, targetTenantId],
    )
  ).rowCount;
  if (!row) throw new NotFoundException("Akses lokasi tidak ditemukan");
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
      await this.db.query(siteSelect, [
        req.actor.account_id,
        req.actor.tenant_id,
        req.actor.tenant_id,
      ])
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

  @Get(":id")
  async profile(@Req() req: AuthRequest, @Param("id") id: string) {
    allow(req.actor, "site.read");
    const targetId = uuid.parse(id);
    await assertSiteAccess(
      this.db,
      req.actor.account_id,
      req.actor.tenant_id,
      targetId,
    );
    const sites = (
      await this.db.query(siteSelect, [
        req.actor.account_id,
        req.actor.tenant_id,
        req.actor.tenant_id,
      ])
    ).rows;
    const site = sites.find((row) => row.id === targetId);
    if (!site) throw new NotFoundException("Lokasi tidak ditemukan");
    const teachers = (
      await this.db.query(
        "SELECT id,name,nip FROM teachers WHERE tenant_id=$1 ORDER BY name",
        [targetId],
      )
    ).rows;
    return { ...site, teachers };
  }

  @Patch(":id")
  async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "site.write");
    const targetId = uuid.parse(id);
    const input = siteUpdateSchema.parse(body);
    await assertSiteAccess(
      this.db,
      req.actor.account_id,
      req.actor.tenant_id,
      targetId,
    );
    return this.db.transaction(targetId, async (sql) => {
      const school = (
        await sql.query("SELECT id FROM schools WHERE tenant_id=$1 LIMIT 1", [
          targetId,
        ])
      ).rows[0];
      if (!school)
        throw new NotFoundException("Profil sekolah tidak ditemukan");

      const fields: string[] = [];
      const values: unknown[] = [targetId, school.id];
      let index = 3;

      if (input.school_name !== undefined) {
        fields.push(`name=$${index++}`);
        values.push(input.school_name);
      }
      if (input.address !== undefined) {
        fields.push(`address=$${index++}`);
        values.push(input.address);
      }
      if (input.phone !== undefined) {
        fields.push(`phone=$${index++}`);
        values.push(input.phone);
      }
      if (input.education_authority !== undefined) {
        fields.push(`education_authority=$${index++}`);
        values.push(input.education_authority);
        if (input.education_authority === "KEMENDIKBUD") {
          fields.push("nsm=NULL", "emis_id=NULL");
        } else {
          fields.push("nss=NULL", "dapodik_id=NULL");
        }
      }
      if (input.school_level !== undefined) {
        fields.push(`school_level=$${index++}`);
        values.push(input.school_level);
      }
      for (const registryField of [
        "npsn",
        "nss",
        "dapodik_id",
        "nsm",
        "emis_id",
      ] as const) {
        if (
          (input.education_authority === "KEMENDIKBUD" &&
            ["nsm", "emis_id"].includes(registryField)) ||
          (input.education_authority === "KEMENAG" &&
            ["nss", "dapodik_id"].includes(registryField))
        )
          continue;
        if (input[registryField] !== undefined) {
          fields.push(`${registryField}=$${index++}`);
          values.push(input[registryField] || null);
        }
      }
      if (input.principal_teacher_id !== undefined) {
        let principalName: string | null = null;
        if (input.principal_teacher_id) {
          const teacher = (
            await sql.query(
              "SELECT name FROM teachers WHERE tenant_id=$1 AND id=$2",
              [targetId, input.principal_teacher_id],
            )
          ).rows[0];
          if (!teacher) throw new NotFoundException("Guru tidak ditemukan");
          principalName = teacher.name;
        }
        fields.push(`principal_teacher_id=$${index++}`);
        values.push(input.principal_teacher_id);
        fields.push(`principal_name=$${index++}`);
        values.push(principalName);
      }

      if (input.name) {
        await sql.query("UPDATE tenants SET name=$2 WHERE id=$1", [
          targetId,
          input.name,
        ]);
      }

      if (!fields.length) {
        return (
          await sql.query(
            `SELECT id,name,address,phone,principal_teacher_id,principal_name,
             education_authority,school_level,npsn,nss,dapodik_id,nsm,emis_id
             FROM schools WHERE tenant_id=$1 AND id=$2`,
            [targetId, school.id],
          )
        ).rows[0];
      }

      const updated = (
        await sql.query(
          `UPDATE schools SET ${fields.join(", ")}
           WHERE tenant_id=$1 AND id=$2
           RETURNING id,name,address,phone,principal_teacher_id,principal_name,
            education_authority,school_level,npsn,nss,dapodik_id,nsm,emis_id`,
          values,
        )
      ).rows[0];
      if (input.school_level)
        await ensureGradeLevels(sql, targetId, school.id, input.school_level);
      return updated;
    });
  }

  @Post(":id/photos")
  async uploadPhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "site.write");
    const targetId = uuid.parse(id);
    const input = sitePhotoSchema.parse(body);
    await assertSiteAccess(
      this.db,
      req.actor.account_id,
      req.actor.tenant_id,
      targetId,
    );
    const school = (
      await this.db.query("SELECT id FROM schools WHERE tenant_id=$1 LIMIT 1", [
        targetId,
      ])
    ).rows[0];
    if (!school) throw new NotFoundException("Profil sekolah tidak ditemukan");

    const localUser = (
      await this.db.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND account_id=$2 AND active LIMIT 1",
        [targetId, req.actor.account_id],
      )
    ).rows[0];

    return this.db.transaction(targetId, async (sql) => {
      const file = await saveManagedFile(
        sql,
        targetId,
        localUser?.id || null,
        "SCHOOL_PHOTO",
        "Foto sekolah",
        input,
      );
      await sql.query(
        "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'SCHOOL',$3)",
        [targetId, file.id, school.id],
      );
      return file;
    });
  }

  @Delete(":id/photos/:fileId")
  async deletePhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
  ) {
    allow(req.actor, "site.write");
    const targetId = uuid.parse(id);
    const photoId = uuid.parse(fileId);
    await assertSiteAccess(
      this.db,
      req.actor.account_id,
      req.actor.tenant_id,
      targetId,
    );
    const school = (
      await this.db.query("SELECT id FROM schools WHERE tenant_id=$1 LIMIT 1", [
        targetId,
      ])
    ).rows[0];
    if (!school) throw new NotFoundException("Profil sekolah tidak ditemukan");

    const link = (
      await this.db.query(
        `SELECT fl.id FROM file_links fl
         JOIN managed_files mf ON mf.tenant_id=fl.tenant_id AND mf.id=fl.file_id
         WHERE fl.tenant_id=$1 AND fl.file_id=$2 AND fl.entity_type='SCHOOL' AND fl.entity_id=$3 AND mf.deleted_at IS NULL`,
        [targetId, photoId, school.id],
      )
    ).rows[0];
    if (!link) throw new NotFoundException("Foto tidak ditemukan");

    await this.db.query("DELETE FROM file_links WHERE tenant_id=$1 AND id=$2", [
      targetId,
      link.id,
    ]);
    await this.db.query(
      "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
      [targetId, photoId],
    );
    return { ok: true };
  }

  @Get(":id/photos/:fileId/file")
  async photoFile(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res() res: Response,
  ) {
    allow(req.actor, "site.read");
    const targetId = uuid.parse(id);
    const photoId = uuid.parse(fileId);
    await assertSiteAccess(
      this.db,
      req.actor.account_id,
      req.actor.tenant_id,
      targetId,
    );
    const row = (
      await this.db.query(
        `SELECT mf.* FROM managed_files mf
         JOIN file_links fl ON fl.tenant_id=mf.tenant_id AND fl.file_id=mf.id
         WHERE mf.tenant_id=$1 AND mf.id=$2 AND fl.entity_type='SCHOOL' AND mf.deleted_at IS NULL`,
        [targetId, photoId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Foto tidak ditemukan");
    const bytes = await readManagedFile(row.storage_key, row.storage_provider);
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(bytes);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "site.write");
    const input = siteSchema.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const duplicate = (
        await sql.query("SELECT 1 FROM tenants WHERE slug=$1", [input.slug])
      ).rowCount;
      if (duplicate) throw new ConflictException("Kode lokasi sudah digunakan");

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

      let principalName = input.principal_name || null;
      if (input.principal_teacher_id) {
        const teacher = (
          await sql.query(
            "SELECT name FROM teachers WHERE tenant_id=$1 AND id=$2",
            [req.actor.tenant_id, input.principal_teacher_id],
          )
        ).rows[0];
        if (teacher) principalName = teacher.name;
      }

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
      const sourceRoles = req.actor.roles;
      const targetRole = sourceRoles.includes("FOUNDATION_HEAD")
        ? "FOUNDATION_HEAD"
        : "SCHOOL_ADMIN";
      await sql.query(
        "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)",
        [tenant.id, localUser.id, targetRole],
      );
      const school = (
        await sql.query(
          `INSERT INTO schools(
          tenant_id,name,address,phone,principal_name,principal_teacher_id,
          education_authority,school_level,npsn,nss,dapodik_id,nsm,emis_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
          [
            tenant.id,
            input.school_name || input.name,
            input.address || null,
            input.phone || null,
            principalName,
            input.principal_teacher_id || null,
            input.education_authority,
            input.school_level,
            input.npsn || null,
            input.education_authority === "KEMENDIKBUD"
              ? input.nss || null
              : null,
            input.education_authority === "KEMENDIKBUD"
              ? input.dapodik_id || null
              : null,
            input.education_authority === "KEMENAG" ? input.nsm || null : null,
            input.education_authority === "KEMENAG"
              ? input.emis_id || null
              : null,
          ],
        )
      ).rows[0];
      await ensureGradeLevels(sql, tenant.id, school.id, input.school_level);
      await sql.query(
        `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
         VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          req.actor.account_id,
          organization.id,
          targetRole === "FOUNDATION_HEAD" ? null : tenant.id,
          targetRole,
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
        `SELECT target_user.id AS user_id,target_user.active AS user_active,
          target_user.status AS user_status,target.id AS tenant_id,
          current_site.organization_id
         FROM organization_sites current_site
         JOIN organization_sites target_site
           ON target_site.organization_id=current_site.organization_id
         JOIN tenants target ON target.id=target_site.tenant_id AND target.status='ACTIVE'
         LEFT JOIN users target_user
           ON target_user.tenant_id=target.id AND target_user.account_id=$1
         WHERE current_site.tenant_id=$2 AND target.id=$3
         AND EXISTS(SELECT 1 FROM user_bindings binding
          WHERE binding.account_id=$1
          AND binding.organization_id=current_site.organization_id
          AND binding.status='ACTIVE'
          AND (binding.tenant_id IS NULL OR binding.tenant_id=target.id))`,
        [req.actor.account_id, req.actor.tenant_id, targetId],
      )
    ).rows[0];
    if (!target) throw new NotFoundException("Akses lokasi tidak ditemukan");
    if (
      target.user_id &&
      (!target.user_active || target.user_status !== "ACTIVE")
    )
      throw new NotFoundException("Membership sekolah tidak aktif");

    const result = await this.db.transaction(target.tenant_id, async (sql) => {
      let targetUserId = target.user_id;
      if (!targetUserId) {
        const source = (
          await sql.query(
            `SELECT name,email,password_hash FROM users
             WHERE tenant_id=$1 AND id=$2 AND account_id=$3`,
            [req.actor.tenant_id, req.actor.id, req.actor.account_id],
          )
        ).rows[0];
        if (!source) throw new NotFoundException("Akun sumber tidak ditemukan");
        targetUserId = (
          await sql.query(
            `INSERT INTO users(tenant_id,account_id,name,email,password_hash)
             VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [
              target.tenant_id,
              req.actor.account_id,
              source.name,
              source.email,
              source.password_hash,
            ],
          )
        ).rows[0].id;
      }
      const effectiveRoles = (
        await sql.query(
          `SELECT DISTINCT role_id FROM user_bindings
           WHERE account_id=$1 AND organization_id=$2 AND status='ACTIVE'
           AND (tenant_id IS NULL OR tenant_id=$3)`,
          [req.actor.account_id, target.organization_id, target.tenant_id],
        )
      ).rows;
      for (const binding of effectiveRoles)
        await sql.query(
          `INSERT INTO user_roles(tenant_id,user_id,role_id)
           VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          [target.tenant_id, targetUserId, binding.role_id],
        );
      return {
        ...(await this.auth.tokens(sql, targetUserId, target.tenant_id, req)),
        user: await this.auth.actor(targetUserId, target.tenant_id),
      };
    });
    refreshCookie(
      res,
      result.refresh_token,
      req.cookies?.langkahsiswa_remember === "1",
    );
    res.setHeader("Cache-Control", "no-store");
    return result;
  }
}
