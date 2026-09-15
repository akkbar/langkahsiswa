import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { ApiErrorFilter } from "./common/filters/api-error.filter";
import { requestPolicy } from "./common/request-policy.middleware";
import { jwtSecret } from "./config";
import { AuditInterceptor } from "./modules/security/audit.interceptor";
export { AppModule } from "./app.module";
export { RedisConnection } from "./common/redis.connection";
export async function createApp(logging = true) {
  jwtSecret();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logging ? ["log", "error", "warn"] : false,
  });
  app.useBodyParser("json", { limit: "7mb" });
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalInterceptors(app.get(AuditInterceptor));
  const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((v) => v.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.use(requestPolicy(origins));
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  return app;
}
