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
  Query,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { z } from "zod";
import {
  resources,
  tenantSchema,
  uuid,
} from "../../../packages/validation/src";
import { Database, type Sql } from "./database";
import {
  allow,
  allowOperational,
  AuthGuard,
  AuthRequest,
  createTenant,
} from "./auth";
import { record, validateResource } from "./academic-policy";

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
@Controller("api/v1/tenants")
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown) {
    if (!req.actor.roles.includes("SUPER_ADMIN"))
      throw new ForbiddenException("Hanya super admin dapat membuat tenant");
    const input = tenantSchema.parse(body);
    return this.db.transaction(null, (sql) => createTenant(sql, input));
  }
  @Get(":id") async get(@Req() req: AuthRequest, @Param("id") id: string) {
    allowOperational(req.actor);
    uuid.parse(id);
    if (id !== req.actor.tenant_id && !req.actor.roles.includes("SUPER_ADMIN"))
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
  @Patch(":id/settings") async settings(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "school.write");
    if (uuid.parse(id) !== req.actor.tenant_id) throw new NotFoundException();
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
@Controller("api/v1")
@UseGuards(AuthGuard)
export class ResourcesController {
  constructor(@Inject(Database) private readonly db: Database) {}
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
  @Get(":resource") async list(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Query() query: Record<string, string>,
  ) {
    const r = this.definition(key);
    this.allowResourceRealm(req.actor, key);
    allow(req.actor, `${r.permission}.read`);
    const paging = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(30),
        search: z.string().max(160).optional(),
      })
      .parse(query);
    const values: unknown[] = [req.actor.tenant_id];
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
  @Get(":resource/:id") async get(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
  ) {
    const r = this.definition(key);
    this.allowResourceRealm(req.actor, key);
    allow(req.actor, `${r.permission}.read`);
    return record(this.db, r.table, req.actor.tenant_id, uuid.parse(id));
  }
  @Post(":resource") async create(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Body() body: unknown,
  ) {
    const r = this.definition(key);
    this.allowResourceRealm(req.actor, key);
    allow(req.actor, `${r.permission}.create`);
    const data = r.schema.strict().parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      if (key === "grade-levels")
        await ensureGradeLevelIsCustom(
          sql,
          req.actor.tenant_id,
          data.school_id,
        );
      await validateResource(sql, key, req.actor, data);
      const keys = Object.keys(data);
      return (
        await sql.query(
          `INSERT INTO ${r.table}(tenant_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [req.actor.tenant_id, ...keys.map((k) => data[k])],
        )
      ).rows[0];
    });
  }
  @Patch(":resource/:id") async update(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const r = this.definition(key);
    this.allowResourceRealm(req.actor, key);
    allow(req.actor, `${r.permission}.update`);
    uuid.parse(id);
    const patch = r.schema.partial().strict().parse(body);
    if (!Object.keys(patch).length)
      throw new BadRequestException("Tidak ada perubahan");
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const old = await record(sql, r.table, req.actor.tenant_id, id);
      if (key === "grade-levels")
        await ensureGradeLevelIsCustom(sql, req.actor.tenant_id, old.school_id);
      for (const key of r.immutable || [])
        if (key in patch && patch[key] !== old[key])
          throw new BadRequestException(
            "Relasi akademik yang sudah dibuat tidak dapat dipindahkan",
          );
      const merged = { ...old, ...patch };
      await validateResource(sql, key, req.actor, merged, id);
      const keys = Object.keys(patch);
      return (
        await sql.query(
          `UPDATE ${r.table} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [req.actor.tenant_id, id, ...keys.map((k) => patch[k])],
        )
      ).rows[0];
    });
  }

  @Delete(":resource/:id")
  async delete(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
  ) {
    const r = this.definition(key);
    this.allowResourceRealm(req.actor, key);
    allow(req.actor, `${r.permission}.delete`);
    uuid.parse(id);
    try {
      return await this.db.transaction(req.actor.tenant_id, async (sql) => {
        const current = await record(sql, r.table, req.actor.tenant_id, id);
        if (key === "grade-levels")
          await ensureGradeLevelIsCustom(
            sql,
            req.actor.tenant_id,
            current.school_id,
          );
        await sql.query(`DELETE FROM ${r.table} WHERE tenant_id=$1 AND id=$2`, [
          req.actor.tenant_id,
          id,
        ]);
        return { id, deleted: true };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23503")
        throw new ConflictException(
          "Data masih digunakan oleh record lain dan tidak dapat dihapus",
        );
      throw error;
    }
  }
}
