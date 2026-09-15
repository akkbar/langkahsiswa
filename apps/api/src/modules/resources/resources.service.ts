import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import {
  resources,
  tenantSchema,
  uuid,
} from "../../../../../packages/validation/src";
import { Database, type Sql } from "../../database/database.service";
import {
  editableGrades,
  record,
  teachSubject,
} from "../academics/academic-policy";
import { validateResource } from "../academics/resource-policy";
import { AuthRequest } from "../auth/auth.types";
import { allow, allowOperational, isAdmin } from "../auth/permissions";
import { createTenant } from "../auth/tenant-provisioning";

async function ensureGradeLevelIsCustom(
  sql: Sql,
  tenantId: string,
  schoolId: string,
) {
  const school = (
    await sql.query(
      "SELECT school_level FROM schools WHERE tenant_id=$1 AND id=$2",
      [tenantId, schoolId],
    )
  ).rows[0];
  if (!school) throw new NotFoundException("Sekolah tidak ditemukan");
  if (["SD", "SMP", "SMA"].includes(school.school_level))
    throw new BadRequestException(
      "Tingkat kelas SD, SMP, dan SMA dibuat otomatis dan tidak dapat diubah manual",
    );
}
async function ensureOperationalPersonnelAccount(
  sql: Sql,
  actor: AuthRequest["actor"],
  userId: unknown,
) {
  if (!userId) return;
  const parsedId = uuid.parse(userId);
  const valid = await sql.query(
    `SELECT 1 FROM users u
     JOIN organization_sites os ON os.tenant_id=u.tenant_id
     JOIN user_bindings binding ON binding.account_id=u.account_id
      AND binding.organization_id=os.organization_id
      AND (binding.tenant_id IS NULL OR binding.tenant_id=u.tenant_id)
      AND binding.status='ACTIVE'
     JOIN roles role ON role.id=binding.role_id AND role.account_level='OPERATIONAL'
     WHERE u.tenant_id=$1 AND u.id=$2`,
    [actor.tenant_id, parsedId],
  );
  if (!valid.rowCount)
    throw new BadRequestException(
      "Profil guru atau staff hanya dapat di-bind ke akun realm Operational",
    );
}
@Injectable()
export class TenantsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  create(actor: Actor, body: unknown) {
    if (!actor.roles.includes("SUPER_ADMIN"))
      throw new ForbiddenException("Hanya super admin dapat membuat tenant");
    const input = tenantSchema.parse(body);
    return this.db.transaction(null, (sql) => createTenant(sql, input));
  }
  async get(actor: Actor, id: string) {
    allowOperational(actor);
    uuid.parse(id);
    if (id !== actor.tenant_id && !actor.roles.includes("SUPER_ADMIN"))
      throw new NotFoundException();
    return (
      (
        await this.db.query(
          "SELECT t.*,s.principal_approval_required FROM tenants t JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.id=$1",
          [id],
        )
      ).rows[0] ||
      (() => {
        throw new NotFoundException();
      })()
    );
  }
  async settings(actor: Actor, id: string, body: unknown) {
    allowOperational(actor);
    allow(actor, "school.write");
    if (uuid.parse(id) !== actor.tenant_id) throw new NotFoundException();
    const data = z
      .object({ principal_approval_required: z.boolean() })
      .strict()
      .parse(body);
    return this.db.transaction(
      id,
      async (sql) =>
        (
          await sql.query(
            "UPDATE tenant_settings SET principal_approval_required=$2 WHERE tenant_id=$1 RETURNING *",
            [id, data.principal_approval_required],
          )
        ).rows[0],
    );
  }
}
@Injectable()
export class ResourcesService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  private definition(key: string) {
    if (!Object.hasOwn(resources, key))
      throw new NotFoundException("Modul tidak ditemukan");
    return resources[key];
  }
  private allowResourceRealm(actor: AuthRequest["actor"], key: string) {
    if (
      [
        "academic-years",
        "semesters",
        "academic-calendar",
        "class-subjects",
        "class-students",
        "teacher-subjects",
        "teacher-competencies",
        "assessments",
        "timetables",
        "assessment-categories",
      ].includes(key)
    )
      allowOperational(actor);
  }
  async list(actor: Actor, key: string, query: Record<string, string>) {
    const r = this.definition(key);
    this.allowResourceRealm(actor, key);
    allow(actor, `${r.permission}.read`);
    const paging = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(30),
        search: z.string().max(160).optional(),
      })
      .parse(query);
    const values: unknown[] = [actor.tenant_id];
    const filters = ["tenant_id=$1"];
    for (const field of r.fields.filter((f) => f.resource))
      if (query[field.key]) {
        values.push(uuid.parse(query[field.key]));
        filters.push(`${field.key}=$${values.length}`);
      }
    if (paging.search) {
      values.push(`%${paging.search}%`);
      filters.push(`to_jsonb(${r.table})::text ILIKE $${values.length}`);
    }
    if (
      ["assessments", "assessment-categories"].includes(key) &&
      !isAdmin(actor)
    ) {
      values.push(actor.id);
      const subject =
        key === "assessments"
          ? `SELECT cat.class_subject_id FROM assessment_categories cat WHERE cat.tenant_id=${r.table}.tenant_id AND cat.id=${r.table}.category_id`
          : `${r.table}.class_subject_id`;
      filters.push(
        `EXISTS (SELECT 1 FROM class_subjects cs JOIN teachers t ON t.tenant_id=cs.tenant_id AND t.id=cs.teacher_id WHERE cs.tenant_id=${r.table}.tenant_id AND cs.id=(${subject}) AND t.user_id=$${values.length})`,
      );
    }
    const where = filters.join(" AND ");
    const total = Number(
      (
        await this.db.query(
          `SELECT count(*) FROM ${r.table} WHERE ${where}`,
          values,
        )
      ).rows[0].count,
    );
    const data = (
      await this.db.query(
        `SELECT * FROM ${r.table} WHERE ${where} ORDER BY created_at DESC,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, paging.limit, (paging.page - 1) * paging.limit],
      )
    ).rows;
    return { data, total, ...paging };
  }
  async get(actor: Actor, key: string, id: string) {
    const r = this.definition(key);
    this.allowResourceRealm(actor, key);
    allow(actor, `${r.permission}.read`);
    const row = await record(this.db, r.table, actor.tenant_id, uuid.parse(id));
    if (["assessments", "assessment-categories"].includes(key)) {
      const category =
        key === "assessments"
          ? await record(
              this.db,
              "assessment_categories",
              actor.tenant_id,
              row.category_id,
            )
          : row;
      await teachSubject(this.db, actor, category.class_subject_id);
    }
    return row;
  }
  async create(actor: Actor, key: string, body: unknown) {
    const r = this.definition(key);
    this.allowResourceRealm(actor, key);
    allow(actor, `${r.permission}.create`);
    const data = r.schema.strict().parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      if (["teachers", "staff"].includes(key))
        await ensureOperationalPersonnelAccount(sql, actor, data.user_id);
      if (key === "grade-levels")
        await ensureGradeLevelIsCustom(sql, actor.tenant_id, data.school_id);
      await validateResource(sql, key, actor, data);
      const keys = Object.keys(data);
      return (
        await sql.query(
          `INSERT INTO ${r.table}(tenant_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [actor.tenant_id, ...keys.map((k) => data[k])],
        )
      ).rows[0];
    });
  }
  async update(actor: Actor, key: string, id: string, body: unknown) {
    const r = this.definition(key);
    this.allowResourceRealm(actor, key);
    allow(actor, `${r.permission}.update`);
    uuid.parse(id);
    const patch = r.schema.partial().strict().parse(body);
    if (!Object.keys(patch).length)
      throw new BadRequestException("Tidak ada perubahan");
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const old = await record(sql, r.table, actor.tenant_id, id);
      if (key === "grade-levels")
        await ensureGradeLevelIsCustom(sql, actor.tenant_id, old.school_id);
      for (const key of r.immutable || [])
        if (key in patch && patch[key] !== old[key])
          throw new BadRequestException(
            "Relasi akademik yang sudah dibuat tidak dapat dipindahkan",
          );
      const merged = { ...old, ...patch };
      if (["teachers", "staff"].includes(key))
        await ensureOperationalPersonnelAccount(sql, actor, merged.user_id);
      await validateResource(sql, key, actor, merged, id);
      const keys = Object.keys(patch);
      return (
        await sql.query(
          `UPDATE ${r.table} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id, ...keys.map((k) => patch[k])],
        )
      ).rows[0];
    });
  }
  async delete(actor: Actor, key: string, id: string) {
    const r = this.definition(key);
    this.allowResourceRealm(actor, key);
    allow(actor, `${r.permission}.delete`);
    uuid.parse(id);
    try {
      return await this.db.transaction(actor.tenant_id, async (sql) => {
        const current = await record(sql, r.table, actor.tenant_id, id);
        if (["assessments", "assessment-categories"].includes(key)) {
          const category =
            key === "assessments"
              ? await record(
                  sql,
                  "assessment_categories",
                  actor.tenant_id,
                  current.category_id,
                )
              : current;
          const subject = await teachSubject(
            sql,
            actor,
            category.class_subject_id,
          );
          await editableGrades(
            sql,
            actor.tenant_id,
            subject.class_id,
            subject.semester_id,
          );
        }
        if (key === "grade-levels")
          await ensureGradeLevelIsCustom(
            sql,
            actor.tenant_id,
            current.school_id,
          );
        await sql.query(`DELETE FROM ${r.table} WHERE tenant_id=$1 AND id=$2`, [
          actor.tenant_id,
          id,
        ]);
        return { id, deleted: true };
      });
    } catch (error) {
      if (
        (
          error as {
            code?: string;
          }
        ).code === "23503"
      )
        throw new ConflictException(
          "Data masih digunakan oleh record lain dan tidak dapat dihapus",
        );
      throw error;
    }
  }
}
