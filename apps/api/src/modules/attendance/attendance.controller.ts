import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { AttendanceService } from "./attendance.service";
@Controller("api/v1/attendance")
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly service: AttendanceService,
  ) {}
  @Get() async get(
    @Req() req: AuthRequest,
    @Query("class_id") classId: string,
    @Query("date") day: string,
  ) {
    return this.service.get(req.actor, classId, day);
  }
  @Put() async save(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.save(req.actor, body);
  }
}
