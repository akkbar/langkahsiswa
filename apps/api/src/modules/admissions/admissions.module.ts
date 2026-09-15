import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import {
  AdmissionsController,
  FilesController,
  PublicAdmissionsController,
} from "./admissions.controller";
import {
  AdmissionsService,
  FilesService,
  PublicAdmissionsService,
} from "./admissions.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    PublicAdmissionsController,
    AdmissionsController,
    FilesController,
  ],
  providers: [PublicAdmissionsService, AdmissionsService, FilesService],
  exports: [],
})
export class AdmissionsModule {}
