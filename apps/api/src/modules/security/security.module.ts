import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AuditInterceptor } from "./audit.interceptor";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SecurityController],
  providers: [SecurityService, AuditInterceptor],
  exports: [AuditInterceptor],
})
export class SecurityModule {}
