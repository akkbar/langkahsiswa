import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { ReportsService } from "./reports.service";
@Controller("api/v1/report-cards")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly service: ReportsService,
  ) {}
  @Get() async list(
    @Req() req: AuthRequest,
    @Query("class_id") classId?: string,
    @Query("semester_id") semesterId?: string,
  ) {
    return this.service.list(req.actor, classId, semesterId);
  }
  @Get(":id") get(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.get(req.actor, id);
  }
  @Get(":id/pdf") async pdf(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.pdf(req.actor, id, res);
  }
  @Post("calculate") async calculate(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.calculate(req.actor, body);
  }
  @Post(":id/:action") async transition(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    return this.service.transition(req.actor, id, action, body);
  }
}
