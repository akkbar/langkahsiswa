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
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
import { FoundationService } from "./foundation.service";
@Controller("api/v1/foundation-profile")
@UseGuards(AuthGuard)
export class FoundationController {
  constructor(
    @Inject(FoundationService) private readonly service: FoundationService,
  ) {}
  @Get()
  async profile(@Req() req: AuthRequest) {
    return this.service.profile(req.actor);
  }
  @Patch()
  async updateProfile(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.updateProfile(req.actor, body);
  }
  @Patch("tax")
  async updateTax(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.updateTax(req.actor, body);
  }
  @Post(":collection")
  async createItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Body() body: unknown,
  ) {
    return this.service.createItem(req.actor, collection, body);
  }
  @Patch(":collection/:id")
  async updateItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateItem(req.actor, collection, id, body);
  }
  @Delete(":collection/:id")
  async deleteItem(
    @Req() req: AuthRequest,
    @Param("collection") collection: string,
    @Param("id") id: string,
  ) {
    return this.service.deleteItem(req.actor, collection, id);
  }
}
