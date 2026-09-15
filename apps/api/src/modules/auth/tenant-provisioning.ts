import { hash } from "bcryptjs";
import { z } from "zod";
import { roles } from "../../../../../packages/shared-types/src";
import { tenantSchema } from "../../../../../packages/validation/src";
import { Sql } from "../../database/database.service";
import { roleNames } from "./auth.types";
import { rolePermissions } from "./permissions";
export async function initializeRoles(sql: Sql) {
  for (const role of roles) {
    const level =
      role === "PARENT" || role === "STUDENT"
        ? "FAMILY"
        : role === "CANTEEN_ADMIN"
          ? "TENANT"
          : "OPERATIONAL";
    const scopeLevel =
      role === "SUPER_ADMIN"
        ? "PLATFORM"
        : role === "FOUNDATION_HEAD" || role === "FOUNDATION_STAFF"
          ? "FOUNDATION"
          : "SCHOOL";
    await sql.query(
      `INSERT INTO roles(id,name,account_level,scope_level) VALUES($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET
        account_level=excluded.account_level,
        scope_level=excluded.scope_level`,
      [role, roleNames[role], level, scopeLevel],
    );
    const normalizedPermissions = new Set(rolePermissions[role]);
    for (const permission of rolePermissions[role])
      if (permission.endsWith(".write")) {
        const area = permission.slice(0, -".write".length);
        for (const action of ["create", "read", "update", "delete"])
          normalizedPermissions.add(`${area}.${action}`);
      }
    for (const permission of normalizedPermissions) {
      await sql.query(
        "INSERT INTO permissions(id) VALUES($1) ON CONFLICT DO NOTHING",
        [permission],
      );
      await sql.query(
        "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [role, permission],
      );
      await sql.query(
        `INSERT INTO permission_realms(permission_id,account_level) VALUES($1,$2)
         ON CONFLICT DO NOTHING`,
        [permission, level],
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
  await sql.query(
    `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
     VALUES($1,$2,$3,'SCHOOL_ADMIN') ON CONFLICT DO NOTHING`,
    [account.id, organization.id, tenant.id],
  );
  return tenant;
}
