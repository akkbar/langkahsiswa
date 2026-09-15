import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { uuid } from "../../../../../packages/validation/src";
import { Database } from "../../database/database.service";
@Injectable()
export class DeviceTokensService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async register(actor: Actor, body: unknown) {
    const input = z
      .object({
        token: z.string().min(20).max(4096),
        platform: z.enum(["ANDROID", "IOS", "WEB"]),
      })
      .strict()
      .parse(body);
    return this.db.transaction(null, async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
        input.token,
      ]);
      await sql.query(
        "UPDATE device_tokens SET active=false,updated_at=now() WHERE token=$1 AND (tenant_id<>$2 OR user_id<>$3)",
        [input.token, actor.tenant_id, actor.id],
      );
      return (
        await sql.query(
          `INSERT INTO device_tokens(tenant_id,user_id,token,platform) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id,token) DO UPDATE SET active=true,platform=EXCLUDED.platform,updated_at=now() RETURNING id,platform,active`,
          [actor.tenant_id, actor.id, input.token, input.platform],
        )
      ).rows[0];
    });
  }
  async remove(actor: Actor, id: string) {
    const row = (
      await this.db.query(
        "UPDATE device_tokens SET active=false,updated_at=now() WHERE tenant_id=$1 AND user_id=$2 AND id=$3 RETURNING id",
        [actor.tenant_id, actor.id, uuid.parse(id)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Perangkat tidak ditemukan");
    return { ok: true };
  }
}
