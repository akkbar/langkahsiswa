import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { GradebookService } from "./gradebook.service";
@Controller("api/v1/grades")
@UseGuards(AuthGuard)
export class GradebookController {
  constructor(
    @Inject(GradebookService) private readonly service: GradebookService,
  ) {}
  @Get("matrix")
  async matrix(@Req() req: AuthRequest, @Query("class_subject_id") id: string) {
    return this.service.matrix(req.actor, id);
  }
  @Get("history")
  async history(
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    return this.service.history(req.actor, query);
  }
  @Put("cell")
  async saveCell(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.saveCell(req.actor, body);
  }
  @Get() async get(
    @Req() req: AuthRequest,
    @Query("assessment_id") id: string,
  ) {
    return this.service.get(req.actor, id);
  }
  @Put() async save(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.save(req.actor, body);
  }
}
