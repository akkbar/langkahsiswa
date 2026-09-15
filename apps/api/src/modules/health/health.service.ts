import { Inject, Injectable } from "@nestjs/common";
import { RedisConnection } from "../../common/redis.connection";
import { Database } from "../../database/database.service";

@Injectable()
export class HealthService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(RedisConnection) private readonly redis: RedisConnection,
  ) {}

  async check() {
    const checks = await Promise.allSettled([
      this.db.query("SELECT 1"),
      (async () => {
        if (["end", "wait"].includes(this.redis.client.status)) {
          await this.redis.client.connect();
        }
        return this.redis.client.ping();
      })(),
    ]);
    return {
      status: checks.every((check) => check.status === "fulfilled")
        ? "ok"
        : "degraded",
      database: checks[0].status === "fulfilled" ? "connected" : "disconnected",
      redis: checks[1].status === "fulfilled" ? "connected" : "disconnected",
    };
  }
}
