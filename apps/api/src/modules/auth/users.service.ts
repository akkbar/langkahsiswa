import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Actor } from "../../../../../packages/shared-types/src";
import { userSchema, uuid } from "../../../../../packages/validation/src";
import { Database } from "../../database/database.service";
import { allow, allowAny, allowOperational } from "./permissions";
@Injectable()
export class UsersService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async list(actor: Actor) {
    allowOperational(actor);
    allowAny(actor, ["user.read", "people.read"]);
    const data = (
      await this.db.query(
        `SELECT u.id,u.tenant_id,u.name,u.email,u.active,u.status,u.last_login_at,
         COALESCE(array_agg(DISTINCT binding.role_id) FILTER (WHERE binding.role_id IS NOT NULL),'{}') AS roles
         FROM users u JOIN accounts a ON a.id=u.account_id
         JOIN organization_sites os ON os.tenant_id=u.tenant_id
         LEFT JOIN user_bindings binding ON binding.account_id=a.id
          AND binding.organization_id=os.organization_id AND binding.status='ACTIVE'
          AND (binding.tenant_id IS NULL OR binding.tenant_id=u.tenant_id)
         WHERE u.tenant_id=$1 GROUP BY u.id ORDER BY u.name`,
        [actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length, page: 1, limit: data.length };
  }
  async create(actor: Actor, body: unknown) {
    allowOperational(actor);
    allow(actor, "user.create");
    const input = userSchema.parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      if (
        input.roles.includes("SUPER_ADMIN") &&
        !actor.roles.includes("SUPER_ADMIN")
      )
        throw new BadRequestException(
          "Hanya super admin yang dapat memberikan role SUPER_ADMIN",
        );
      const configuredRoles = (
        await sql.query(
          `SELECT id,scope_level,account_level FROM roles
           WHERE id=ANY($1::text[]) AND (organization_id IS NULL OR organization_id=$2)`,
          [input.roles, actor.organization_id],
        )
      ).rows;
      if (configuredRoles.length !== new Set(input.roles).size)
        throw new BadRequestException("Role belum terdaftar");
      const configuredRealms = new Set(
        configuredRoles.map((role) => role.account_level),
      );
      if (configuredRealms.size !== 1)
        throw new BadRequestException(
          "Semua role pada satu akun harus berasal dari realm yang sama",
        );
      if (
        configuredRoles.some((role) => role.scope_level === "FOUNDATION") &&
        !(
          await sql.query(
            `SELECT 1 FROM user_bindings binding
             JOIN roles role ON role.id=binding.role_id
             WHERE binding.account_id=$1 AND binding.organization_id=$2
             AND binding.tenant_id IS NULL AND binding.status='ACTIVE'
             AND role.scope_level IN ('PLATFORM','FOUNDATION')`,
            [actor.account_id, actor.organization_id],
          )
        ).rowCount
      )
        throw new ForbiddenException(
          "Hanya pengurus yayasan yang dapat memberikan role yayasan",
        );
      const legacyLevel = [...configuredRealms][0];
      const operationalRoles = legacyLevel === "OPERATIONAL" ? input.roles : [];
      const account = (
        await sql.query(
          "INSERT INTO accounts(name,email,account_level) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id,account_level",
          [input.name, input.email, legacyLevel],
        )
      ).rows[0];
      if (input.roles.some((role) => ["PARENT", "STUDENT"].includes(role)))
        await sql.query(
          "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SCHOOL_ADMIN') ON CONFLICT DO NOTHING",
          [account.id],
        );
      if (operationalRoles.length)
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
      if (input.roles.includes("CANTEEN_ADMIN"))
        await sql.query(
          "INSERT INTO tenant_accounts(account_id,tenant_kind) VALUES($1,'CANTEEN') ON CONFLICT DO NOTHING",
          [account.id],
        );
      const membership = (
        await sql.query(
          "INSERT INTO users(tenant_id,account_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,tenant_id,account_id,name,email",
          [
            actor.tenant_id,
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
          [actor.tenant_id, membership.id, role],
        );
      const organizationId = (
        await sql.query(
          "SELECT organization_id FROM organization_sites WHERE tenant_id=$1",
          [actor.tenant_id],
        )
      ).rows[0]?.organization_id;
      for (const role of configuredRoles)
        await sql.query(
          `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
           VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            account.id,
            organizationId,
            role.scope_level === "SCHOOL" ? actor.tenant_id : null,
            role.id,
          ],
        );
      return membership;
    });
  }
  async addRoles(actor: Actor, id: string, body: unknown) {
    allowOperational(actor);
    allow(actor, "user.update");
    const input = z
      .union([
        z.object({
          add: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/)).min(1),
        }),
        z.object({
          set: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/)).min(1),
        }),
      ])
      .parse(body);
    const requestedRoles = "set" in input ? input.set : input.add;
    uuid.parse(id);
    if (
      requestedRoles.includes("SUPER_ADMIN") &&
      !actor.roles.includes("SUPER_ADMIN")
    )
      throw new ForbiddenException(
        "Hanya super admin yang dapat memberikan role SUPER_ADMIN",
      );
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const target = (
        await sql.query(
          `SELECT u.id,u.account_id,os.organization_id
           FROM users u JOIN organization_sites os ON os.tenant_id=u.tenant_id
           WHERE u.tenant_id=$1 AND u.id=$2`,
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!target) throw new BadRequestException("Akun tidak ditemukan");
      if ("set" in input && target.id === actor.id)
        throw new BadRequestException(
          "Role akun yang sedang digunakan tidak dapat diubah sendiri",
        );
      const configuredRoles = (
        await sql.query(
          `SELECT id,scope_level,account_level FROM roles
           WHERE id=ANY($1::text[]) AND (organization_id IS NULL OR organization_id=$2)`,
          [requestedRoles, actor.organization_id],
        )
      ).rows;
      if (configuredRoles.length !== new Set(requestedRoles).size)
        throw new BadRequestException("Role belum terdaftar");
      if (
        "set" in input &&
        new Set(configuredRoles.map((role) => role.account_level)).size !== 1
      )
        throw new BadRequestException(
          "Semua role pada satu akun harus berasal dari realm yang sama",
        );
      if (
        configuredRoles.some((role) => role.scope_level === "FOUNDATION") &&
        !actor.roles.some((role) =>
          ["SUPER_ADMIN", "FOUNDATION_HEAD"].includes(role),
        )
      )
        throw new ForbiddenException(
          "Hanya pengurus yayasan yang dapat memberikan role yayasan",
        );
      if ("set" in input) {
        await sql.query(
          `DELETE FROM user_roles WHERE tenant_id=$1 AND user_id=$2
           AND NOT(role_id=ANY($3::text[]))`,
          [actor.tenant_id, id, requestedRoles],
        );
        await sql.query(
          `DELETE FROM user_bindings WHERE account_id=$1 AND organization_id=$2
           AND (tenant_id=$3 OR tenant_id IS NULL)
           AND NOT(role_id=ANY($4::text[]))`,
          [
            target.account_id,
            target.organization_id,
            actor.tenant_id,
            requestedRoles,
          ],
        );
      }
      for (const role of configuredRoles) {
        await sql.query(
          `INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [actor.tenant_id, id, role.id],
        );
        await sql.query(
          `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
           VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            target.account_id,
            target.organization_id,
            role.scope_level === "SCHOOL" ? actor.tenant_id : null,
            role.id,
          ],
        );
      }
      if (requestedRoles.some((role) => ["PARENT", "STUDENT"].includes(role)))
        await sql.query(
          "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SCHOOL_ADMIN') ON CONFLICT DO NOTHING",
          [target.account_id],
        );
      if (
        requestedRoles.some(
          (role) => !["PARENT", "STUDENT", "CANTEEN_ADMIN"].includes(role),
        )
      ) {
        await sql.query(
          `INSERT INTO operational_accounts(account_id,position) VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [
            target.account_id,
            requestedRoles.includes("FOUNDATION_HEAD")
              ? "FOUNDATION_HEAD"
              : requestedRoles.includes("FOUNDATION_STAFF")
                ? "FOUNDATION_STAFF"
                : requestedRoles.includes("PRINCIPAL")
                  ? "PRINCIPAL"
                  : requestedRoles.includes("TEACHER")
                    ? "TEACHER"
                    : "STAFF",
          ],
        );
        await sql.query(
          `UPDATE accounts SET account_level='OPERATIONAL' WHERE id=$1`,
          [target.account_id],
        );
      }
      if (requestedRoles.includes("CANTEEN_ADMIN"))
        await sql.query(
          `INSERT INTO tenant_accounts(account_id,tenant_kind)
           VALUES($1,'CANTEEN') ON CONFLICT DO NOTHING`,
          [target.account_id],
        );
      return {
        id,
        roles: "set" in input ? requestedRoles : undefined,
        added_roles: "add" in input ? requestedRoles : undefined,
      };
    });
  }
}
