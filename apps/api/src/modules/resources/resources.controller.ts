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
import { AuthRequest } from "../auth/auth.types";
import { ResourcesService, TenantsService } from "./resources.service";
@Controller("api/v1/tenants")
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly service: TenantsService,
  ) {}
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Get(":id") async get(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.get(req.actor, id);
  }
  @Patch(":id/settings") async settings(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.settings(req.actor, id, body);
  }
}
@Controller("api/v1")
@UseGuards(AuthGuard)
export class ResourcesController {
  constructor(
    @Inject(ResourcesService) private readonly service: ResourcesService,
  ) {}
  @Get(":resource") async list(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Query() query: Record<string, string>,
  ) {
    return this.service.list(req.actor, key, query);
  }
  @Get(":resource/:id") async get(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
  ) {
    return this.service.get(req.actor, key, id);
  }
  @Post(":resource") async create(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Body() body: unknown,
  ) {
    return this.service.create(req.actor, key, body);
  }
  @Patch(":resource/:id") async update(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(req.actor, key, id, body);
  }
  @Delete(":resource/:id")
  async delete(
    @Req() req: AuthRequest,
    @Param("resource") key: string,
    @Param("id") id: string,
  ) {
    return this.service.delete(req.actor, key, id);
  }
}
