import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database, Sql } from "../../database/database.service";
import { allow, allowOperational } from "../auth/permissions";

const realms = ["OPERATIONAL", "FAMILY", "TENANT"] as const;
const scopes = ["SCHOOL", "FOUNDATION"] as const;
const roleInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    account_level: z.enum(realms),
    scope_level: z.enum(scopes),
    permissions: z.array(z.string().trim().min(1).max(100)).max(300),
  })
  .strict();

function allowManageRoles(actor: Actor) {
  allowOperational(actor);
  allow(actor, "user.update");
  if (!actor.permissions.includes("*"))
    throw new ForbiddenException(
      "Hanya administrator yang dapat mengubah role",
    );
}

async function validatePermissions(
  sql: Sql,
  accountLevel: (typeof realms)[number],
  permissions: string[],
) {
  const unique = [...new Set(permissions)];
  const available = (
    await sql.query(
      `SELECT permission_id FROM permission_realms
       WHERE account_level=$1 AND permission_id=ANY($2::text[])`,
      [accountLevel, unique],
    )
  ).rows.map((row) => row.permission_id);
  if (available.length !== unique.length)
    throw new BadRequestException(
      "Ada permission yang tidak tersedia untuk realm account tersebut",
    );
  return unique;
}

@Injectable()
export class RoleSettingsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async list(actor: Actor) {
    allowOperational(actor);
    allow(actor, "user.read");
    const roles = (
      await this.db.query(
        `SELECT r.id,r.name,r.account_level,r.scope_level,r.is_system,
         CASE WHEN override.role_id IS NOT NULL THEN
          (SELECT count(*)::int FROM organization_role_permissions op
           WHERE op.organization_id=$1 AND op.role_id=r.id)
         ELSE (SELECT count(*)::int FROM role_permissions rp
          WHERE rp.role_id=r.id) END AS permission_count,
         (SELECT count(*)::int FROM user_bindings b
          WHERE b.role_id=r.id AND b.organization_id=$1) AS account_count
         FROM roles r
         LEFT JOIN organization_role_overrides override
          ON override.organization_id=$1 AND override.role_id=r.id
         WHERE r.organization_id IS NULL OR r.organization_id=$1
         ORDER BY r.account_level,r.name`,
        [actor.organization_id],
      )
    ).rows;
    return { roles };
  }
  private async permissionCatalog() {
    return (
      await this.db.query(`SELECT p.id,
         COALESCE(array_agg(pr.account_level ORDER BY pr.account_level)
          FILTER (WHERE pr.account_level IS NOT NULL),'{}') AS realms
         FROM permissions p LEFT JOIN permission_realms pr ON pr.permission_id=p.id
         GROUP BY p.id ORDER BY p.id`)
    ).rows;
  }
  async permissions(actor: Actor) {
    allowOperational(actor);
    allow(actor, "user.read");
    return { permissions: await this.permissionCatalog() };
  }
  async detail(actor: Actor, id: string) {
    allowOperational(actor);
    allow(actor, "user.read");
    if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(id))
      throw new BadRequestException("Role tidak valid");
    const role = (
      await this.db.query(
        `SELECT r.id,r.name,r.account_level,r.scope_level,r.is_system,
         CASE WHEN override.role_id IS NOT NULL THEN
          COALESCE((SELECT array_agg(op.permission_id ORDER BY op.permission_id)
           FROM organization_role_permissions op
           WHERE op.organization_id=$1 AND op.role_id=r.id),'{}')
         ELSE COALESCE((SELECT array_agg(rp.permission_id ORDER BY rp.permission_id)
           FROM role_permissions rp WHERE rp.role_id=r.id),'{}') END AS permissions,
         (SELECT count(*)::int FROM user_bindings b
          WHERE b.role_id=r.id AND b.organization_id=$1) AS account_count
         FROM roles r
         LEFT JOIN organization_role_overrides override
          ON override.organization_id=$1 AND override.role_id=r.id
         WHERE r.id=$2 AND (r.organization_id IS NULL OR r.organization_id=$1)`,
        [actor.organization_id, id],
      )
    ).rows[0];
    if (!role) throw new BadRequestException("Role tidak ditemukan");
    return { role, permissions: await this.permissionCatalog() };
  }
  async create(actor: Actor, body: unknown) {
    allowManageRoles(actor);
    const input = roleInput.parse(body);
    if (input.account_level !== "OPERATIONAL" && input.scope_level !== "SCHOOL")
      throw new BadRequestException(
        "Realm Family dan Tenant hanya dapat menggunakan cakupan sekolah",
      );
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const permissions = await validatePermissions(
        sql,
        input.account_level,
        input.permissions,
      );
      const duplicate = await sql.query(
        `SELECT 1 FROM roles WHERE lower(name)=lower($1)
         AND (organization_id IS NULL OR organization_id=$2)`,
        [input.name, actor.organization_id],
      );
      if (duplicate.rowCount)
        throw new BadRequestException("Nama role sudah digunakan");
      const id = `CUSTOM_${randomBytes(8).toString("hex").toUpperCase()}`;
      const role = (
        await sql.query(
          `INSERT INTO roles(id,name,account_level,scope_level,is_system,organization_id)
           VALUES($1,$2,$3,$4,false,$5) RETURNING *`,
          [
            id,
            input.name,
            input.account_level,
            input.scope_level,
            actor.organization_id,
          ],
        )
      ).rows[0];
      for (const permission of permissions)
        await sql.query(
          "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",
          [id, permission],
        );
      return { ...role, permissions, account_count: 0 };
    });
  }
  async update(actor: Actor, id: string, body: unknown) {
    allowManageRoles(actor);
    if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(id))
      throw new BadRequestException("Role tidak valid");
    if (id === "SUPER_ADMIN")
      throw new ForbiddenException("Role Super Admin tidak dapat diubah");
    const input = roleInput.parse(body);
    if (input.account_level !== "OPERATIONAL" && input.scope_level !== "SCHOOL")
      throw new BadRequestException(
        "Realm Family dan Tenant hanya dapat menggunakan cakupan sekolah",
      );
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const current = (
        await sql.query(
          `SELECT r.*,(SELECT count(*)::int FROM user_bindings b
            WHERE b.role_id=r.id AND b.organization_id=$2) AS account_count
           FROM roles r WHERE r.id=$1
            AND (r.organization_id IS NULL OR r.organization_id=$2) FOR UPDATE`,
          [id, actor.organization_id],
        )
      ).rows[0];
      if (!current) throw new BadRequestException("Role tidak ditemukan");
      if (
        current.account_level !== input.account_level &&
        current.account_count > 0
      )
        throw new BadRequestException(
          "Realm tidak dapat diubah karena role sudah digunakan akun",
        );
      if (current.is_system && current.account_level !== input.account_level)
        throw new BadRequestException("Realm role bawaan tidak dapat diubah");
      if (current.is_system && current.scope_level !== input.scope_level)
        throw new BadRequestException("Cakupan role bawaan tidak dapat diubah");
      if (current.is_system && current.name !== input.name)
        throw new BadRequestException("Nama role bawaan tidak dapat diubah");
      const duplicate = await sql.query(
        `SELECT 1 FROM roles WHERE lower(name)=lower($1) AND id<>$2
         AND (organization_id IS NULL OR organization_id=$3)`,
        [input.name, id, actor.organization_id],
      );
      if (duplicate.rowCount)
        throw new BadRequestException("Nama role sudah digunakan");
      const permissions = await validatePermissions(
        sql,
        input.account_level,
        input.permissions,
      );
      if (current.organization_id) {
        await sql.query(
          `UPDATE roles SET name=$2,account_level=$3,scope_level=$4 WHERE id=$1`,
          [id, input.name, input.account_level, input.scope_level],
        );
        await sql.query("DELETE FROM role_permissions WHERE role_id=$1", [id]);
        for (const permission of permissions)
          await sql.query(
            "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",
            [id, permission],
          );
      } else {
        await sql.query(
          `INSERT INTO organization_role_overrides(organization_id,role_id)
           VALUES($1,$2) ON CONFLICT(organization_id,role_id)
           DO UPDATE SET updated_at=now()`,
          [actor.organization_id, id],
        );
        await sql.query(
          `DELETE FROM organization_role_permissions
           WHERE organization_id=$1 AND role_id=$2`,
          [actor.organization_id, id],
        );
        for (const permission of permissions)
          await sql.query(
            `INSERT INTO organization_role_permissions(organization_id,role_id,permission_id)
             VALUES($1,$2,$3)`,
            [actor.organization_id, id, permission],
          );
      }
      return { ...current, ...input, id };
    });
  }
}
