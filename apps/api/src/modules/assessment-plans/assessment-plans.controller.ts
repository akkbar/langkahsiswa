import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { AssessmentPlansService } from "./assessment-plans.service";
@Controller("api/v1/assessment-plans")
@UseGuards(AuthGuard)
export class AssessmentPlansController {
  constructor(
    @Inject(AssessmentPlansService)
    private readonly service: AssessmentPlansService,
  ) {}
  @Get()
  async subjects(@Req() req: AuthRequest) {
    return this.service.subjects(req.actor);
  }
  @Get(":id")
  async get(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.get(req.actor, id);
  }
  @Put(":id")
  async save(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.actor, id, body);
  }
}
