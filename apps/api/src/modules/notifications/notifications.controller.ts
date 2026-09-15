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
import { DeviceTokensService } from "./device-tokens.service";
import { EventsService } from "./events.service";
import { NotificationsService } from "./notifications.service";
@Controller("api/v1/events")
@UseGuards(AuthGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly service: EventsService) {}
  @Get() async list(@Req() req: AuthRequest) {
    return this.service.list(req.actor);
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(req.actor, body);
  }
  @Post(":id/publish") async publish(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.publish(req.actor, id);
  }
}
@Controller("api/v1/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly service: NotificationsService,
  ) {}
  @Get() async list(@Req() req: AuthRequest, @Query("limit") value?: string) {
    return this.service.list(req.actor, value);
  }
  @Get("deliveries") async deliveries(@Req() req: AuthRequest) {
    return this.service.deliveries(req.actor);
  }
  @Post("dispatch") dispatch(@Req() req: AuthRequest) {
    return this.service.dispatch(req.actor);
  }
  @Post("deliveries/:id/retry") async retry(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.retry(req.actor, id);
  }
  @Patch(":id/read") async read(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.read(req.actor, id);
  }
}
@Controller("api/v1/device-tokens")
@UseGuards(AuthGuard)
export class DeviceTokensController {
  constructor(
    @Inject(DeviceTokensService) private readonly service: DeviceTokensService,
  ) {}
  @Post() async register(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.register(req.actor, body);
  }
  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.remove(req.actor, id);
  }
}
