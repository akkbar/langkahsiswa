import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  Res,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Response } from "express";
import Redis from "ioredis";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Database } from "./database";
import {
  AuthController,
  AuthGuard,
  AuthService,
  UsersController,
} from "./auth";
import { ResourcesController, TenantsController } from "./resources";
import { AttendanceController } from "./attendance";
import { GradebookController } from "./gradebook";
import { ReportsController } from "./reports";
import { ApiErrorFilter } from "./http";
import { jwtSecret } from "./config";
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
@Controller()
class HealthController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(RedisConnection) private readonly redis: RedisConnection,
  ) {}
  @Get("health") async health(@Res({ passthrough: true }) res: Response) {
    const checks = await Promise.allSettled([
      this.db.query("SELECT 1"),
      (async () => {
        if (
          this.redis.client.status === "end" ||
          this.redis.client.status === "wait"
        )
          await this.redis.client.connect();
        return this.redis.client.ping();
      })(),
    ]);
    const ok = checks.every((c) => c.status === "fulfilled");
    if (!ok) res.status(503);
    return {
      status: ok ? "ok" : "degraded",
      database: checks[0].status === "fulfilled" ? "connected" : "disconnected",
      redis: checks[1].status === "fulfilled" ? "connected" : "disconnected",
    };
  }
}
@Module({
  providers: [Database, AuthService, AuthGuard, RedisConnection],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    TenantsController,
    AttendanceController,
    GradebookController,
    ReportsController,
    ResourcesController,
  ],
})
export class AppModule {}
export async function createApp(logging = true) {
  jwtSecret();
  const app = await NestFactory.create(AppModule, {
    logger: logging ? ["log", "error", "warn"] : false,
  });
  app.use(helmet());
  app.use(cookieParser());
  const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((v) => v.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.use((req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return res.status(403).json({ message: "Origin tidak diizinkan" });
    next();
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  return app;
}
