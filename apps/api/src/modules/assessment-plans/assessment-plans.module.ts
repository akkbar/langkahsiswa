import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AssessmentPlansController } from "./assessment-plans.controller";
import { AssessmentPlansService } from "./assessment-plans.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AssessmentPlansController],
  providers: [AssessmentPlansService],
  exports: [],
})
export class AssessmentPlansModule {}
