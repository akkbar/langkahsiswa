import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { PublicWebsiteService, WebsiteService } from "./website.service";
@Controller("api/v1/public/websites")
export class PublicWebsiteController {
  constructor(
    @Inject(PublicWebsiteService)
    private readonly service: PublicWebsiteService,
  ) {}
  @Get(":tenant/pages/:slug") async page(
    @Param("tenant") tenantSlug: string,
    @Param("slug") slug: string,
  ) {
    return this.service.page(tenantSlug, slug);
  }
  @Get("domains/:domain/pages/:slug") async domainPage(
    @Param("domain") domain: string,
    @Param("slug") slug: string,
  ) {
    return this.service.domainPage(domain, slug);
  }
  @Get(":tenant/assets/:id") async asset(
    @Param("tenant") tenantSlug: string,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.asset(tenantSlug, id, res);
  }
}
@Controller("api/v1/website")
@UseGuards(AuthGuard)
export class WebsiteController {
  constructor(
    @Inject(WebsiteService) private readonly service: WebsiteService,
  ) {}
  @Get("settings") async settings(@Req() req: AuthRequest) {
    return this.service.settings(req.actor);
  }
  @Put("settings") async updateSettings(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.updateSettings(req.actor, body);
  }
  @Get("assets/:id/file") async assetFile(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.assetFile(req.actor, id, res);
  }
  @Get("pages") async pages(@Req() req: AuthRequest) {
    return this.service.pages(req.actor);
  }
  @Post("pages") async createPage(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createPage(req.actor, body);
  }
  @Get("pages/:id") async page(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.page(req.actor, id);
  }
  @Post("pages/:id/versions") async version(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.version(req.actor, id, body);
  }
  @Post("pages/:id/publish") async publish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.publish(req.actor, id, body);
  }
  @Post("pages/:id/unpublish") async unpublish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.unpublish(req.actor, id);
  }
  @Get("assets") async assets(@Req() req: AuthRequest) {
    return this.service.assets(req.actor);
  }
  @Post("assets") async addAsset(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addAsset(req.actor, body);
  }
}
