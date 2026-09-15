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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import {
  AdmissionsService,
  FilesService,
  PublicAdmissionsService,
} from "./admissions.service";
@Controller("api/v1/public/admissions")
export class PublicAdmissionsController {
  constructor(
    @Inject(PublicAdmissionsService)
    private readonly service: PublicAdmissionsService,
  ) {}
  @Get(":tenant/periods") async periods(@Param("tenant") slug: string) {
    return this.service.periods(slug);
  }
  @Post(":tenant/applications") async apply(
    @Param("tenant") slug: string,
    @Body() body: unknown,
  ) {
    return this.service.apply(slug, body);
  }
  @Post(":tenant/applications/:id/status") async status(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.status(slug, id, body);
  }
  @Post(":tenant/applications/:id/documents") async document(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.document(slug, id, body);
  }
}
@Controller("api/v1")
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(
    @Inject(AdmissionsService) private readonly service: AdmissionsService,
  ) {}
  @Get("admission-periods") async periods(@Req() req: AuthRequest) {
    return this.service.periods(req.actor);
  }
  @Get("admission-tracks") async tracks(
    @Req() req: AuthRequest,
    @Query("period_id") periodId?: string,
  ) {
    return this.service.tracks(req.actor, periodId);
  }
  @Post("admission-tracks") async addTrack(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addTrack(req.actor, body);
  }
  @Post("admission-periods") async addPeriod(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addPeriod(req.actor, body);
  }
  @Patch("admission-periods/:id/status") async periodStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.periodStatus(req.actor, id, body);
  }
  @Post("admissions/applications") async addApplication(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addApplication(req.actor, body);
  }
  @Get("admissions/applications") async applications(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.applications(req.actor, query);
  }
  @Post("admissions/applications/:id/reviews") async review(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.review(req.actor, id, body);
  }
  @Post("admissions/applications/:id/documents") async addDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.addDocument(req.actor, id, body);
  }
  @Patch("admissions/documents/:id") async verifyDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.verifyDocument(req.actor, id, body);
  }
  @Post("admissions/applications/:id/enroll") async enroll(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.enroll(req.actor, id, body);
  }
}
@Controller("api/v1/files")
@UseGuards(AuthGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly service: FilesService) {}
  @Get() async list(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.actor, query);
  }
  @Post() async upload(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.upload(req.actor, body);
  }
  @Get(":id/download") async download(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.download(req.actor, id, res);
  }
  @Patch(":id") async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(req.actor, id, body);
  }
  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.remove(req.actor, id);
  }
  @Post(":id/restore") async restore(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.restore(req.actor, id);
  }
}
