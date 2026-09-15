import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [],
})
export class PortalModule {}
