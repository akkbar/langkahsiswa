import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { ResourcesController, TenantsController } from "./resources.controller";
import { ResourcesService, TenantsService } from "./resources.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TenantsController, ResourcesController],
  providers: [TenantsService, ResourcesService],
  exports: [],
})
export class ResourcesModule {}
