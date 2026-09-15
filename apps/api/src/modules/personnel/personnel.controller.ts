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
import { AuthRequest } from "../auth/auth.types";
import { PersonnelService } from "./personnel.service";
@Controller("api/v1/personnel")
@UseGuards(AuthGuard)
export class PersonnelController {
  constructor(
    @Inject(PersonnelService) private readonly service: PersonnelService,
  ) {}
  @Get(":type/:id/private")
  async getPrivate(
    @Req() req: AuthRequest,
    @Param("type") rawType: string,
    @Param("id") rawId: string,
  ) {
    return this.service.getPrivate(req.actor, rawType, rawId);
  }
  @Put(":type/:id/private")
  async savePrivate(
    @Req() req: AuthRequest,
    @Param("type") rawType: string,
    @Param("id") rawId: string,
    @Body() body: unknown,
  ) {
    return this.service.savePrivate(req.actor, rawType, rawId, body);
  }
}
