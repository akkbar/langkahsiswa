import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { SitesService } from "./sites.service";
@Controller("api/v1/sites")
@UseGuards(AuthGuard)
export class SitesController {
  constructor(@Inject(SitesService) private readonly service: SitesService) {}
  @Get()
  async list(@Req() req: AuthRequest) {
    return this.service.list(req.actor);
  }
  @Get(":id")
  async profile(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.service.profile(req.actor, id);
  }
  @Patch(":id")
  async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(req.actor, id, body);
  }
  @Post(":id/photos")
  async uploadPhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.uploadPhoto(req.actor, id, body);
  }
  @Delete(":id/photos/:fileId")
  async deletePhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
  ) {
    return this.service.deletePhoto(req.actor, id, fileId);
  }
  @Get(":id/photos/:fileId/file")
  async photoFile(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res() res: Response,
  ) {
    return this.service.photoFile(req.actor, id, fileId, res);
  }
  @Post()
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Post(":id/switch")
  async switch(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
  ) {
    return this.service.switch(req, res, id);
  }
}
