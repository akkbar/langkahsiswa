import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { LessonPlanningController } from "./lesson-planning.controller";
import { LessonPlanningService } from "./lesson-planning.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [LessonPlanningController],
  providers: [LessonPlanningService],
  exports: [],
})
export class LessonPlanningModule {}
