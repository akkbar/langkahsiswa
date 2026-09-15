import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthSessionsService } from "./auth-sessions.service";
import { AuthGuard } from "./auth.guard";
import { AuthRequest } from "./auth.types";
import { UsersService } from "./users.service";
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthSessionsService) private readonly service: AuthSessionsService,
  ) {}
  @Get("google/config") googleConfig() {
    return this.service.googleConfig();
  }
  @Post("google") async googleLogin(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.googleLogin(req, body, res);
  }
  @Post("login") async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.login(req, body, res);
  }
  @Post("refresh") async refresh(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.refresh(req, body, res);
  }
  @Post("logout") async logout(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.logout(req, body, res);
  }
  @Get("me") @UseGuards(AuthGuard) me(@Req() req: AuthRequest) {
    return this.service.me(req.actor);
  }
}
@Controller("api/v1/users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly service: UsersService) {}
  @Get() async list(@Req() req: AuthRequest) {
    return this.service.list(req.actor);
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Patch(":id/roles")
  async addRoles(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.addRoles(req.actor, id, body);
  }
}
