import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AnyZodObject } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import {
  foundationDocumentSchema,
  foundationLicenseSchema,
  foundationOfficialSchema,
  foundationProfileSchema,
  foundationTaxSchema,
  uuid,
} from "../../../../../packages/validation/src";
import { Database, type Sql } from "../../database/database.service";
import { allow } from "../auth/permissions";

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

function operational(actor: Actor) {
  if (actor.account_level !== "OPERATIONAL")
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

@Injectable()
export class FoundationService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  private definition(collection: string) {
    const definition = collections[collection];
    if (!definition)
      throw new NotFoundException("Bagian profil tidak ditemukan");
    return definition;
  }
  async profile(actor: Actor) {
    operational(actor);
    allow(actor, "foundation.read");
    const foundation = (
      await this.db.query(
        `SELECT o.*,
          (SELECT count(*)::int FROM organization_sites os WHERE os.organization_id=o.id) AS school_count
         FROM organizations o WHERE o.id=$1`,
        [actor.organization_id],
      )
    ).rows[0];
    if (!foundation) throw new NotFoundException("Yayasan tidak ditemukan");
    const [officials, licenses, documents, tax] = await Promise.all([
      this.db.query(
        `SELECT * FROM foundation_officials WHERE organization_id=$1
         ORDER BY is_active DESC,start_date DESC,created_at DESC`,
        [actor.organization_id],
      ),
      this.db.query(
        `SELECT * FROM foundation_licenses WHERE organization_id=$1
         ORDER BY (status='ACTIVE') DESC,valid_until DESC NULLS LAST,created_at DESC`,
        [actor.organization_id],
      ),
      this.db.query(
        `SELECT * FROM foundation_documents WHERE organization_id=$1
         ORDER BY is_active DESC,document_date DESC NULLS LAST,created_at DESC`,
        [actor.organization_id],
      ),
      this.db.query(
        "SELECT * FROM foundation_tax_profiles WHERE organization_id=$1",
        [actor.organization_id],
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
  async updateProfile(actor: Actor, body: unknown) {
    operational(actor);
    allow(actor, "foundation.update");
    const input = foundationProfileSchema.parse(body);
    const entries = Object.entries(input);
    if (!entries.length) return this.profile(actor);
    const fields: string[] = [];
    const values: unknown[] = [actor.organization_id];
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
      if (
        (
          error as {
            code?: string;
          }
        ).code === "23505"
      )
        throw new ForbiddenException("Kode yayasan sudah digunakan");
      throw error;
    }
  }
  async updateTax(actor: Actor, body: unknown) {
    operational(actor);
    allow(actor, "foundation.update");
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
        [actor.organization_id, ...keys.map((key) => valuesByKey[key])],
      )
    ).rows[0];
  }
  async createItem(actor: Actor, collection: string, body: unknown) {
    operational(actor);
    allow(actor, "foundation.create");
    const definition = this.definition(collection);
    const input = definition.schema.parse(body) as Record<string, unknown>;
    const keys = Object.keys(input);
    return (
      await this.db.query(
        `INSERT INTO ${definition.table}(organization_id,${keys.join(",")})
         VALUES($1,${keys.map((_, index) => `$${index + 2}`).join(",")}) RETURNING *`,
        [actor.organization_id, ...keys.map((key) => input[key])],
      )
    ).rows[0];
  }
  async updateItem(
    actor: Actor,
    collection: string,
    id: string,
    body: unknown,
  ) {
    operational(actor);
    allow(actor, "foundation.update");
    const definition = this.definition(collection);
    const input = definition.schema.partial().parse(body) as Record<
      string,
      unknown
    >;
    return this.db.transaction(actor.tenant_id, (sql) =>
      updateRecord(
        sql,
        definition.table,
        actor.organization_id,
        uuid.parse(id),
        input,
      ),
    );
  }
  async deleteItem(actor: Actor, collection: string, id: string) {
    operational(actor);
    allow(actor, "foundation.delete");
    const definition = this.definition(collection);
    const deleted = (
      await this.db.query(
        `DELETE FROM ${definition.table} WHERE organization_id=$1 AND id=$2 RETURNING id`,
        [actor.organization_id, uuid.parse(id)],
      )
    ).rows[0];
    if (!deleted) throw new NotFoundException("Data yayasan tidak ditemukan");
    return { id: deleted.id, deleted: true };
  }
}
