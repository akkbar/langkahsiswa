import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Actor } from "../../../../../packages/shared-types/src";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { TeacherService } from "./teacher.service";

@Controller("api/v1/teacher")
@UseGuards(AuthGuard)
export class TeacherController {
  constructor(@Inject(TeacherService) private readonly teacherService: TeacherService) {}

  @Get("plans")
  listPlans(@Req() req: AuthRequest, @Query() query: any) {
    return this.teacherService.listPlans(req.actor, query);
  }

  @Post("plans")
  createPlan(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.teacherService.createPlan(req.actor, body);
  }

  @Get("plans/:id")
  getPlan(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.teacherService.getPlan(req.actor, id);
  }

  @Patch("plans/:id")
  updatePlan(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.teacherService.updatePlan(req.actor, id, body);
  }

  @Delete("plans/:id")
  deletePlan(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.teacherService.deletePlan(req.actor, id);
  }

  @Get("logs")
  listLogs(@Req() req: AuthRequest, @Query() query: any) {
    return this.teacherService.listLogs(req.actor, query);
  }

  @Post("logs")
  createLog(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.teacherService.createLog(req.actor, body);
  }

  @Get("dashboard")
  getDashboard(@Req() req: AuthRequest, @Query() query: any) {
    return this.teacherService.getDashboard(req.actor, query);
  }
}
