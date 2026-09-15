import { Module } from "@nestjs/common";
import { RedisConnection } from "../../common/redis.connection";
import { DatabaseModule } from "../../database/database.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [RedisConnection, HealthService],
})
export class HealthModule {}
