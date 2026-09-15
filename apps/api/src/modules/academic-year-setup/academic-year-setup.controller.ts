import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { AcademicYearSetupService } from "./academic-year-setup.service";
@Controller("api/v1/academic-year-setups")
@UseGuards(AuthGuard)
export class AcademicYearSetupController {
  constructor(
    @Inject(AcademicYearSetupService)
    private readonly service: AcademicYearSetupService,
  ) {}
  @Get()
  async list(
    @Req() req: AuthRequest,
    @Query("page") pageValue = "1",
    @Query("limit") limitValue = "20",
    @Query("search") search = "",
  ) {
    return this.service.list(req.actor, pageValue, limitValue, search);
  }
  @Post()
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Get(":id")
  async detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.detail(req.actor, id);
  }
  @Patch(":id/steps/:stepKey")
  updateStep(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("stepKey") stepKey: string,
    @Body() body: unknown,
  ) {
    return this.service.updateStep(req.actor, id, stepKey, body);
  }
  @Post(":id/activate")
  activate(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.activate(req.actor, id);
  }
  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.remove(req.actor, id);
  }
}
