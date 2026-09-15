import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { DomainsService } from "./domains.service";
@Controller("api/v1/domains")
@UseGuards(AuthGuard)
export class DomainsController {
  constructor(
    @Inject(DomainsService) private readonly service: DomainsService,
  ) {}
  @Get() async list(@Req() req: AuthRequest) {
    return this.service.list(req.actor);
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Post(":id/verify") async verify(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.verify(req.actor, id);
  }
  @Post(":id/primary") async primary(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.primary(req.actor, id);
  }
  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.remove(req.actor, id);
  }
}
