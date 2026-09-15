import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { DeviceTokensService } from "./device-tokens.service";
import { EventsService } from "./events.service";
import { NotificationDispatcher } from "./notification.dispatcher";
import {
  DeviceTokensController,
  EventsController,
  NotificationsController,
} from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    EventsController,
    NotificationsController,
    DeviceTokensController,
  ],
  providers: [
    EventsService,
    NotificationsService,
    DeviceTokensService,
    NotificationDispatcher,
  ],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
