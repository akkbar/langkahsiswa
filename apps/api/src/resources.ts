import {
  Body,
  Controller,
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
import { Database } from "./database";
import { allow, AuthGuard, AuthRequest, createTenant } from "./auth";
import { record, validateResource } from "./academic-policy";
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
  @Get(":resource") async list(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Query() query: Record<string, string>,
  ) {
    const r = this.definition(key);
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
    if (paging.search && r.fields.some((f) => f.key === "name")) {
      values.push(`%${paging.search}%`);
      filters.push(`name ILIKE $${values.length}`);
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
    allow(req.actor, `${r.permission}.read`);
    return record(this.db, r.table, req.actor.tenant_id, uuid.parse(id));
  }
  @Post(":resource") async create(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Body() body: unknown,
  ) {
    const r = this.definition(key);
    allow(
      req.actor,
      `${r.permission}.${r.permission === "student" ? "create" : "write"}`,
    );
    const data = r.schema.strict().parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
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
    allow(
      req.actor,
      `${r.permission}.${r.permission === "student" ? "update" : "write"}`,
    );
    uuid.parse(id);
    const patch = r.schema.partial().strict().parse(body);
    if (!Object.keys(patch).length)
      throw new BadRequestException("Tidak ada perubahan");
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const old = await record(sql, r.table, req.actor.tenant_id, id);
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
}
