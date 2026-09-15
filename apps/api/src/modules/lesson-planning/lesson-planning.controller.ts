import {
  Body,
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
import { LessonPlanningService } from "./lesson-planning.service";
@Controller("api/v1/lesson-planning")
@UseGuards(AuthGuard)
export class LessonPlanningController {
  constructor(
    @Inject(LessonPlanningService)
    private readonly service: LessonPlanningService,
  ) {}
  @Get("curriculum")
  async curriculum(@Req() req: AuthRequest) {
    return this.service.curriculum(req.actor);
  }
  @Post("settings")
  async settings(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.settings(req.actor, body);
  }
  @Post("subjects/:id")
  async weights(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.weights(req.actor, id, body);
  }
  @Get("schedule")
  async schedule(
    @Req() req: AuthRequest,
    @Query("semester_id") semesterId: string,
  ) {
    return this.service.schedule(req.actor, semesterId);
  }
  @Post("generate")
  async generate(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.generate(req.actor, body);
  }
}
