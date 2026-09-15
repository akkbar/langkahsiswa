import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { SecurityService } from "./security.service";
@Controller("api/v1/security")
@UseGuards(AuthGuard)
export class SecurityController {
  constructor(
    @Inject(SecurityService) private readonly service: SecurityService,
  ) {}
  @Get("audit-logs") async audit(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.audit(req.actor, query);
  }
  @Get("login-history") async logins(@Req() req: AuthRequest) {
    return this.service.logins(req.actor);
  }
  @Get("sessions") async sessions(
    @Req() req: AuthRequest,
    @Query("user_id") userId?: string,
  ) {
    return this.service.sessions(req.actor, userId);
  }
  @Post("sessions/:id/revoke") async revoke(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.revoke(req.actor, id);
  }
}
