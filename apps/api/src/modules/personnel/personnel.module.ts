import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { PersonnelController } from "./personnel.controller";
import { PersonnelService } from "./personnel.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PersonnelController],
  providers: [PersonnelService],
  exports: [],
})
export class PersonnelModule {}
