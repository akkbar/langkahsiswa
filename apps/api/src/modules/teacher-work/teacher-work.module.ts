import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeacherWorkController } from "./teacher-work.controller";
import { TeacherWorkService } from "./teacher-work.service";
@Module({ imports: [DatabaseModule, AuthModule], controllers: [TeacherWorkController], providers: [TeacherWorkService] })
export class TeacherWorkModule {}
