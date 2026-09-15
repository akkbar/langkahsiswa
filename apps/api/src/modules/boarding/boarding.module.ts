import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { BoardingController } from "./boarding.controller";
import { BoardingService } from "./boarding.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BoardingController],
  providers: [BoardingService],
  exports: [],
})
export class BoardingModule {}
