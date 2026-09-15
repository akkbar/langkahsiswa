import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { FamilyController, PublicFamilyController } from "./family.controller";
import { FamilyService, PublicFamilyService } from "./family.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PublicFamilyController, FamilyController],
  providers: [PublicFamilyService, FamilyService],
  exports: [],
})
export class FamilyModule {}
