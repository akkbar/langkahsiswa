import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { GradebookController } from "./gradebook.controller";
import { GradebookService } from "./gradebook.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [GradebookController],
  providers: [GradebookService],
  exports: [],
})
export class GradebookModule {}
