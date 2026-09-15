import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { PortalService } from "./portal.service";
@Controller("api/v1/portal")
@UseGuards(AuthGuard)
export class PortalController {
  constructor(@Inject(PortalService) private readonly service: PortalService) {}
  @Get("students") async students(@Req() req: AuthRequest) {
    return this.service.students(req.actor);
  }
  @Get("overview") async overview(
    @Req() req: AuthRequest,
    @Query("student_id") studentId: string,
  ) {
    return this.service.overview(req.actor, studentId);
  }
  @Get("teaching") async teaching(@Req() req: AuthRequest) {
    return this.service.teaching(req.actor);
  }
}
