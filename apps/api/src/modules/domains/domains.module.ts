import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [],
})
export class DomainsModule {}
