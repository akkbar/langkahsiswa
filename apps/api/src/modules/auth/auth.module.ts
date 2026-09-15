import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthSessionsService } from "./auth-sessions.service";
import { AuthController, UsersController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { GoogleIdentityVerifier } from "./google-identity.verifier";
import { UsersService } from "./users.service";
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, UsersController],
  providers: [
    AuthSessionsService,
    UsersService,
    AuthService,
    AuthGuard,
    GoogleIdentityVerifier,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
