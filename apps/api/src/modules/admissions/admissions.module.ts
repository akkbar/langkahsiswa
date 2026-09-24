import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import {
  AdmissionsController,
  AdmissionFormController,
  AdmissionPaymentController,
  AdmissionInterviewController,
  AdmissionTemplateController,
  FilesController,
  PublicAdmissionsController,
  AdmissionReportsController,
} from "./admissions.controller";
import {
  AdmissionsService,
  AdmissionFormService,
  AdmissionPaymentService,
  AdmissionInterviewService,
  AdmissionDocumentTemplateService,
  FilesService,
  PublicAdmissionsService,
  AdmissionReportsService,
} from "./admissions.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    PublicAdmissionsController,
    AdmissionsController,
    AdmissionFormController,
    AdmissionPaymentController,
    AdmissionInterviewController,
    AdmissionTemplateController,
    FilesController,
    AdmissionReportsController,
  ],
  providers: [
    PublicAdmissionsService,
    AdmissionsService,
    AdmissionFormService,
    AdmissionPaymentService,
    AdmissionInterviewService,
    AdmissionDocumentTemplateService,
    FilesService,
    AdmissionReportsService,
  ],
  exports: [],
})
export class AdmissionsModule {}
