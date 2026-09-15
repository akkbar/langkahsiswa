import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { RoleSettingsController } from "./role-settings.controller";
import { RoleSettingsService } from "./role-settings.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RoleSettingsController],
  providers: [RoleSettingsService],
  exports: [],
})
export class RoleSettingsModule {}
