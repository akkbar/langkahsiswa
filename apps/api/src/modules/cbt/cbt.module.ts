import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { CbtController } from "./cbt.controller";
import { CbtService } from "./cbt.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CbtController],
  providers: [CbtService],
  exports: [],
})
export class CbtModule {}
