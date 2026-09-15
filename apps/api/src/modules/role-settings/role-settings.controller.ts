import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { RoleSettingsService } from "./role-settings.service";
@Controller("api/v1/roles")
@UseGuards(AuthGuard)
export class RoleSettingsController {
  constructor(
    @Inject(RoleSettingsService) private readonly service: RoleSettingsService,
  ) {}
  @Get()
  async list(@Req() req: AuthRequest) {
    return this.service.list(req.actor);
  }
  @Get("permissions")
  async permissions(@Req() req: AuthRequest) {
    return this.service.permissions(req.actor);
  }
  @Get(":id")
  async detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.detail(req.actor, id);
  }
  @Post()
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Patch(":id")
  async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(req.actor, id, body);
  }
}
