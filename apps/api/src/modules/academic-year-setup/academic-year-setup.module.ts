import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AcademicYearSetupController } from "./academic-year-setup.controller";
import { AcademicYearSetupService } from "./academic-year-setup.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AcademicYearSetupController],
  providers: [AcademicYearSetupService],
  exports: [],
})
export class AcademicYearSetupModule {}
