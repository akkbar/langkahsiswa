import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisConnection implements OnModuleDestroy {
  readonly client = new Redis(
    process.env.REDIS_URL || "redis://127.0.0.1:6379",
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      retryStrategy: () => null,
    },
  );

  constructor() {
    this.client.on("error", () => {});
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
