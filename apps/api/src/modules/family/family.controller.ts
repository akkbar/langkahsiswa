import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { FamilyService, PublicFamilyService } from "./family.service";
@Controller("api/v1/public/family")
export class PublicFamilyController {
  constructor(
    @Inject(PublicFamilyService) private readonly service: PublicFamilyService,
  ) {}
  @Post("register")
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    return this.service.register(req, res, body);
  }
}
@Controller("api/v1/family")
@UseGuards(AuthGuard)
export class FamilyController {
  constructor(@Inject(FamilyService) private readonly service: FamilyService) {}
  @Get("overview")
  async overview(@Req() req: AuthRequest) {
    return this.service.overview(req.actor);
  }
  @Post("applications")
  async apply(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.apply(req.actor, body);
  }
  @Post("applications/:id/documents")
  async uploadDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.uploadDocument(req.actor, id, body);
  }
  @Post("students/:id/account")
  async createStudentAccount(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.createStudentAccount(req.actor, id, body);
  }
}
