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
import { LibraryService } from "./library.service";
@Controller("api/v1/library")
@UseGuards(AuthGuard)
export class LibraryController {
  constructor(
    @Inject(LibraryService) private readonly service: LibraryService,
  ) {}
  @Get("overview") async overview(@Req() req: AuthRequest) {
    return this.service.overview(req.actor);
  }
  @Get("portal") async portal(@Req() req: AuthRequest) {
    return this.service.portal(req.actor);
  }
  @Post("books") async book(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.book(req.actor, body);
  }
  @Post("copies") async copy(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.copy(req.actor, body);
  }
  @Post("borrowings") async borrow(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.borrow(req.actor, body);
  }
  @Post("borrowings/:id/return") async returnBook(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.returnBook(req.actor, id, body);
  }
  @Post("penalties/:id/resolve") async resolvePenalty(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.resolvePenalty(req.actor, id, body);
  }
}
