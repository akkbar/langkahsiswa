import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AnyZodObject } from "zod";
import {
  foundationDocumentSchema,
  foundationLicenseSchema,
  foundationOfficialSchema,
  foundationProfileSchema,
  foundationTaxSchema,
  uuid,
} from "../../../packages/validation/src";
import { allow, AuthGuard, type AuthRequest } from "./auth";
import { Database, type Sql } from "./database";

const collections: Record<
  string,
  { table: string; schema: AnyZodObject; order: string }
> = {
  officials: {
    table: "foundation_officials",
    schema: foundationOfficialSchema,
    order: "is_active DESC,start_date DESC,created_at DESC",
  },
  licenses: {
    table: "foundation_licenses",
    schema: foundationLicenseSchema,
    order: "status='ACTIVE' DESC,valid_until DESC NULLS LAST,created_at DESC",
  },
  documents: {
    table: "foundation_documents",
    schema: foundationDocumentSchema,
    order: "is_active DESC,document_date DESC NULLS LAST,created_at DESC",
  },
};

function operational(req: AuthRequest) {
  if (req.actor.account_level !== "OPERATIONAL")
    throw new ForbiddenException("Profil yayasan hanya untuk akun operational");
}

async function updateRecord(
  sql: Sql,
  table: string,
  organizationId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const keys = Object.keys(data);
  if (!keys.length) throw new NotFoundException("Tidak ada perubahan");
  const updated = (
    await sql.query(
      `UPDATE ${table} SET ${keys.map((key, index) => `${key}=$${index + 3}`).join(",")},updated_at=now()
       WHERE organization_id=$1 AND id=$2 RETURNING *`,
      [organizationId, id, ...keys.map((key) => data[key])],
    )
  ).rows[0];
  if (!updated) throw new NotFoundException("Data yayasan tidak ditemukan");
  return updated;
}

@Controller("api/v1/foundation-profile")
@UseGuards(AuthGuard)
export class FoundationController {
  constructor(@Inject(Database) private readonly db: Database) {}

  private definition(collection: string) {
    const definition = collections[collection];
    if (!definition)
      throw new NotFoundException("Bagian profil tidak ditemukan");
    return definition;
  }

  @Get()
  async profile(@Req() req: AuthRequest) {
    operational(req);
    allow(req.actor, "foundation.read");
    const foundation = (
      await this.db.query(
        `SELECT o.*,
          (SELECT count(*)::int FROM organization_sites os WHERE os.organization_id=o.id) AS school_count
         FROM organizations o WHERE o.id=$1`,
        [req.actor.organization_id],
      )
    ).rows[0];
    if (!foundation) throw new NotFoundException("Yayasan tidak ditemukan");
    const [officials, licenses, documents, tax] = await Promise.all([
      this.db.query(
        `SELECT * FROM foundation_officials WHERE organization_id=$1
         ORDER BY is_active DESC,start_date DESC,created_at DESC`,
        [req.actor.organization_id],
      ),
      this.db.query(
        `SELECT * FROM foundation_licenses WHERE organization_id=$1
         ORDER BY (status='ACTIVE') DESC,valid_until DESC NULLS LAST,created_at DESC`,
        [req.actor.organization_id],
      ),
      this.db.query(
        `SELECT * FROM foundation_documents WHERE organization_id=$1
         ORDER BY is_active DESC,document_date DESC NULLS LAST,created_at DESC`,
        [req.actor.organization_id],
      ),
      this.db.query(
        "SELECT * FROM foundation_tax_profiles WHERE organization_id=$1",
        [req.actor.organization_id],
      ),
    ]);
    return {
      ...foundation,
      officials: officials.rows,
      licenses: licenses.rows,
      documents: documents.rows,
      tax_profile: tax.rows[0] || null,
    };
  }

  @Patch()
  async updateProfile(@Req() req: AuthRequest, @Body() body: unknown) {
    operational(req);
    allow(req.actor, "foundation.update");
    const input = foundationProfileSchema.parse(body);
    const entries = Object.entries(input);
    if (!entries.length) return this.profile(req);
    const fields: string[] = [];
    const values: unknown[] = [req.actor.organization_id];
    for (const [rawKey, value] of entries) {
      const key = rawKey === "code" ? "slug" : rawKey;
      fields.push(`${key}=$${values.length + 1}`);
      values.push(value);
    }
    try {
      return (
        await this.db.query(
          `UPDATE organizations SET ${fields.join(",")},updated_at=now()
           WHERE id=$1 RETURNING *`,
          values,
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ForbiddenException("Kode yayasan sudah digunakan");
      throw error;
    }
  }

  @Patch("tax")
  async updateTax(@Req() req: AuthRequest, @Body() body: unknown) {
    operational(req);
    allow(req.actor, "foundation.update");
    const input = foundationTaxSchema.parse(body);
    const valuesByKey = input as Record<string, unknown>;
    const keys = Object.keys(input);
    return (
      await this.db.query(
        `INSERT INTO foundation_tax_profiles(organization_id,${keys.join(",")})
         VALUES($1,${keys.map((_, index) => `$${index + 2}`).join(",")})
         ON CONFLICT(organization_id) DO UPDATE SET
          ${keys.map((key) => `${key}=excluded.${key}`).join(",")},updated_at=now()
         RETURNING *`,
        [req.actor.organization_id, ...keys.map((key) => valuesByKey[key])],
      )
    ).rows[0];
  }

  @Post(":collection")
  async createItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Body() body: unknown,
  ) {
    operational(req);
    allow(req.actor, "foundation.create");
    const definition = this.definition(collection);
    const input = definition.schema.parse(body) as Record<string, unknown>;
    const keys = Object.keys(input);
    return (
      await this.db.query(
        `INSERT INTO ${definition.table}(organization_id,${keys.join(",")})
         VALUES($1,${keys.map((_, index) => `$${index + 2}`).join(",")}) RETURNING *`,
        [req.actor.organization_id, ...keys.map((key) => input[key])],
      )
    ).rows[0];
  }

  @Patch(":collection/:id")
  async updateItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    operational(req);
    allow(req.actor, "foundation.update");
    const definition = this.definition(collection);
    const input = definition.schema.partial().parse(body) as Record<
      string,
      unknown
    >;
    return this.db.transaction(req.actor.tenant_id, (sql) =>
      updateRecord(
        sql,
        definition.table,
        req.actor.organization_id,
        uuid.parse(id),
        input,
      ),
    );
  }

  @Delete(":collection/:id")
  async deleteItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Param("id") id: string,
  ) {
    operational(req);
    allow(req.actor, "foundation.delete");
    const definition = this.definition(collection);
    const deleted = (
      await this.db.query(
        `DELETE FROM ${definition.table} WHERE organization_id=$1 AND id=$2 RETURNING id`,
        [req.actor.organization_id, uuid.parse(id)],
      )
    ).rows[0];
    if (!deleted) throw new NotFoundException("Data yayasan tidak ditemukan");
    return { id: deleted.id, deleted: true };
  }
}
