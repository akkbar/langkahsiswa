import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { FoundationController } from "./foundation.controller";
import { FoundationService } from "./foundation.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FoundationController],
  providers: [FoundationService],
  exports: [],
})
export class FoundationModule {}
