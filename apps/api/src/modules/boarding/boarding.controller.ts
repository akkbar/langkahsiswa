import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { BoardingService } from "./boarding.service";
@Controller("api/v1/boarding")
@UseGuards(AuthGuard)
export class BoardingController {
  constructor(
    @Inject(BoardingService) private readonly service: BoardingService,
  ) {}
  @Get("overview") async overview(@Req() req: AuthRequest) {
    return this.service.overview(req.actor);
  }
  @Get("portal") async portal(@Req() req: AuthRequest) {
    return this.service.portal(req.actor);
  }
  @Post("modules/:key") async module(
    @Req() req: AuthRequest,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    return this.service.module(req.actor, key, body);
  }
  @Post("dormitories") async dormitory(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.dormitory(req.actor, body);
  }
  @Post("rooms") async room(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.room(req.actor, body);
  }
  @Post("beds") async bed(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.bed(req.actor, body);
  }
  @Post("assignments") async assign(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.assign(req.actor, body);
  }
  @Post("assignments/:id/end") async endAssignment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.endAssignment(req.actor, id, body);
  }
  @Post("leaves") async leave(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.leave(req.actor, body);
  }
  @Post("leaves/:id/review") async reviewLeave(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.reviewLeave(req.actor, id, body);
  }
  @Post("leaves/:id/status") async leaveStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.leaveStatus(req.actor, id, body);
  }
  @Post("leaves/gate") async leaveGate(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.leaveGate(req.actor, body);
  }
  @Post("visits") async visit(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.visit(req.actor, body);
  }
  @Post("visits/:id/status") async visitStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.visitStatus(req.actor, id, body);
  }
  @Post("discipline") async discipline(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.discipline(req.actor, body);
  }
  @Post("tahfidz") async tahfidz(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.tahfidz(req.actor, body);
  }
  @Post("activities") async activity(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.activity(req.actor, body);
  }
  @Post("tahfidz-targets") async tahfidzTarget(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.tahfidzTarget(req.actor, body);
  }
  @Post("worship-habits") async worshipHabit(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.worshipHabit(req.actor, body);
  }
  @Post("worship-records") async worshipRecord(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.worshipRecord(req.actor, body);
  }
  @Post("character") async character(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.character(req.actor, body);
  }
  @Post("character/:id/review") async reviewCharacter(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.reviewCharacter(req.actor, id, body);
  }
  @Post("health") async health(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.health(req.actor, body);
  }
  @Post("diniyah-subjects") async diniyahSubject(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.diniyahSubject(req.actor, body);
  }
  @Post("diniyah-progress") async diniyahProgress(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.diniyahProgress(req.actor, body);
  }
  @Post("inspections") async inspection(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.inspection(req.actor, body);
  }
  @Post("laundry") async laundry(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.laundry(req.actor, body);
  }
  @Post("laundry/:id/status") async laundryStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.laundryStatus(req.actor, id, body);
  }
  @Post("laundry/:id/charge") async chargeLaundry(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.chargeLaundry(req.actor, id);
  }
}
