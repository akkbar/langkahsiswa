import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [],
})
export class SitesModule {}
