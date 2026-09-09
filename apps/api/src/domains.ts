import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { resolveCname, resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { allow, AuthGuard, type AuthRequest } from "./auth";
import { Database } from "./database";

const uuid = z.string().uuid();
const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Domain tidak valid",
  );

type DnsLookup = {
  cname(domain: string): Promise<string[]>;
  txt(domain: string): Promise<string[][]>;
};
export async function verifyDomainDns(
  domain: string,
  token: string,
  cnameTarget: string,
  lookup: DnsLookup = { cname: resolveCname, txt: resolveTxt },
) {
  const expected = cnameTarget.toLowerCase().replace(/\.$/, "");
  const cnames = await lookup.cname(domain).catch(() => []);
  if (
    cnames.some((value) => value.toLowerCase().replace(/\.$/, "") === expected)
  )
    return { method: "CNAME" as const, value: expected };
  const txt = await lookup
    .txt(`_langkahsiswa-verification.${domain}`)
    .catch(() => []);
  const values = txt.map((parts) => parts.join(""));
  if (values.includes(`langkahsiswa-verification=${token}`))
    return { method: "TXT" as const, value: token };
  return null;
}

@Controller("api/v1/domains")
@UseGuards(AuthGuard)
export class DomainsController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get() async list(@Req() req: AuthRequest) {
    allow(req.actor, "domain.read");
    const data = (
      await this.db.query(
        `SELECT id,domain,is_primary,verification_status,ssl_status,cname_target,
         verification_token,last_checked_at,verification_error,verified_at,created_at
         FROM tenant_domains WHERE tenant_id=$1 ORDER BY is_primary DESC,created_at`,
        [req.actor.tenant_id],
      )
    ).rows;
    return { data, total: data.length };
  }

  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "domain.write");
    const input = z.object({ domain: domainSchema }).strict().parse(body);
    const reserved = (
      process.env.BASE_DOMAIN || "langkahsiswa.id"
    ).toLowerCase();
    if (input.domain === reserved)
      throw new BadRequestException(
        "Domain utama platform tidak dapat digunakan",
      );
    const token = randomBytes(24).toString("hex");
    const target = (
      process.env.CUSTOM_DOMAIN_CNAME_TARGET || `domains.${reserved}`
    )
      .toLowerCase()
      .replace(/\.$/, "");
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const row = (
        await sql.query(
          `INSERT INTO tenant_domains(tenant_id,domain,verification_token,cname_target,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [req.actor.tenant_id, input.domain, token, target, req.actor.id],
        )
      ).rows[0];
      return {
        ...row,
        instructions: {
          cname: { host: input.domain, value: target },
          txt: {
            host: `_langkahsiswa-verification.${input.domain}`,
            value: `langkahsiswa-verification=${token}`,
          },
        },
      };
    });
  }

  @Post(":id/verify") async verify(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "domain.write");
    uuid.parse(id);
    const domain = (
      await this.db.query(
        "SELECT * FROM tenant_domains WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!domain) throw new NotFoundException("Domain tidak ditemukan");
    const proof = await verifyDomainDns(
      domain.domain,
      domain.verification_token,
      domain.cname_target,
    );
    if (!proof) {
      await this.db.query(
        `UPDATE tenant_domains SET verification_status='FAILED',last_checked_at=now(),
         verification_error='CNAME atau TXT belum sesuai' WHERE tenant_id=$1 AND id=$2`,
        [req.actor.tenant_id, id],
      );
      throw new ConflictException(
        "DNS belum sesuai. Periksa CNAME atau TXT lalu coba lagi",
      );
    }
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const hasPrimary = (
        await sql.query(
          "SELECT 1 FROM tenant_domains WHERE tenant_id=$1 AND id<>$2 AND is_primary",
          [req.actor.tenant_id, id],
        )
      ).rowCount;
      return (
        await sql.query(
          `UPDATE tenant_domains SET verification_status='ACTIVE',verified_at=COALESCE(verified_at,now()),
           ssl_status=$5,last_checked_at=now(),verification_error=NULL,is_primary=$3
           WHERE tenant_id=$1 AND id=$2 RETURNING *, $4::text AS verification_method`,
          [
            req.actor.tenant_id,
            id,
            !hasPrimary,
            proof.method,
            process.env.CUSTOM_DOMAIN_AUTO_SSL === "true"
              ? "ACTIVE"
              : "PENDING",
          ],
        )
      ).rows[0];
    });
  }

  @Post(":id/primary") async primary(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "domain.write");
    uuid.parse(id);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const domain = (
        await sql.query(
          "SELECT * FROM tenant_domains WHERE tenant_id=$1 AND id=$2 AND verified_at IS NOT NULL FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!domain) throw new ConflictException("Domain harus terverifikasi");
      await sql.query(
        "UPDATE tenant_domains SET is_primary=false WHERE tenant_id=$1",
        [req.actor.tenant_id],
      );
      return (
        await sql.query(
          "UPDATE tenant_domains SET is_primary=true WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
    });
  }

  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "domain.write");
    uuid.parse(id);
    const row = (
      await this.db.query(
        "DELETE FROM tenant_domains WHERE tenant_id=$1 AND id=$2 RETURNING id",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Domain tidak ditemukan");
    return { ok: true };
  }
}
