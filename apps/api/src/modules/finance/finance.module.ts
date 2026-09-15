import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [],
})
export class FinanceModule {}
