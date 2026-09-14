import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { allow, allowOperational, AuthGuard, AuthRequest } from "./auth";
import { Database } from "./database";

const personnelType = z.enum(["teachers", "staff"]);
const privateRecord = z
  .object({
    employment_status: z.enum(["PERMANENT", "CONTRACT", "HONORARY", "INTERN"]),
    hire_date: z.string().date().nullable(),
    base_salary: z.number().min(0).max(999_999_999_999).nullable(),
    allowance: z.number().min(0).max(999_999_999_999).nullable(),
    bank_name: z.string().trim().max(120).nullable(),
    bank_account_number: z.string().trim().max(80).nullable(),
    tax_number: z.string().trim().max(80).nullable(),
    national_id: z.string().trim().max(80).nullable(),
    notes: z.string().trim().max(2000).nullable(),
  })
  .strict();

@Controller("api/v1/personnel")
@UseGuards(AuthGuard)
export class PersonnelController {
  constructor(@Inject(Database) private readonly db: Database) {}

  private async ensurePerson(
    type: z.infer<typeof personnelType>,
    id: string,
    tenantId: string,
  ) {
    const parsedId = z.string().uuid().parse(id);
    if (
      !(
        await this.db.query(
          `SELECT 1 FROM ${type} WHERE tenant_id=$1 AND id=$2`,
          [tenantId, parsedId],
        )
      ).rowCount
    )
      throw new NotFoundException("Guru atau staff tidak ditemukan");
    return parsedId;
  }

  @Get(":type/:id/private")
  async getPrivate(
    @Req() req: AuthRequest,
    @Param("type") rawType: string,
    @Param("id") rawId: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "hr_private.read");
    const type = personnelType.parse(rawType);
    const id = await this.ensurePerson(type, rawId, req.actor.tenant_id);
    const key = type === "teachers" ? "teacher_id" : "staff_id";
    return (
      (
        await this.db.query(
          `SELECT employment_status,hire_date,base_salary,allowance,bank_name,
           bank_account_number,tax_number,national_id,notes
           FROM personnel_private_records WHERE tenant_id=$1 AND ${key}=$2`,
          [req.actor.tenant_id, id],
        )
      ).rows[0] || {
        employment_status: "PERMANENT",
        hire_date: null,
        base_salary: null,
        allowance: null,
        bank_name: null,
        bank_account_number: null,
        tax_number: null,
        national_id: null,
        notes: null,
      }
    );
  }

  @Put(":type/:id/private")
  async savePrivate(
    @Req() req: AuthRequest,
    @Param("type") rawType: string,
    @Param("id") rawId: string,
    @Body() body: unknown,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "hr_private.update");
    const type = personnelType.parse(rawType);
    const id = await this.ensurePerson(type, rawId, req.actor.tenant_id);
    const input = privateRecord.parse(body);
    const personKey = type === "teachers" ? "teacher_id" : "staff_id";
    const fields = Object.keys(input);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const existing = (
        await sql.query(
          `SELECT id FROM personnel_private_records
           WHERE tenant_id=$1 AND ${personKey}=$2 FOR UPDATE`,
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (existing)
        return (
          await sql.query(
            `UPDATE personnel_private_records SET
             ${fields.map((field, index) => `${field}=$${index + 3}`).join(",")},updated_at=now()
             WHERE tenant_id=$1 AND id=$2 RETURNING *`,
            [req.actor.tenant_id, existing.id, ...Object.values(input)],
          )
        ).rows[0];
      return (
        await sql.query(
          `INSERT INTO personnel_private_records(tenant_id,${personKey},${fields.join(",")})
           VALUES($1,$2,${fields.map((_, index) => `$${index + 3}`).join(",")}) RETURNING *`,
          [req.actor.tenant_id, id, ...Object.values(input)],
        )
      ).rows[0];
    });
  }
}
