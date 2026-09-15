import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import {
  PublicWebsiteController,
  WebsiteController,
} from "./website.controller";
import { PublicWebsiteService, WebsiteService } from "./website.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PublicWebsiteController, WebsiteController],
  providers: [PublicWebsiteService, WebsiteService],
  exports: [],
})
export class WebsiteModule {}
