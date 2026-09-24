import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
  @Get("statistics") async statistics(@Req() req: AuthRequest) {
    return this.service.statistics(req.actor);
  }
  @Get("activities") async activities(@Req() req: AuthRequest) {
    return this.service.activities(req.actor);
  }
  @Get("portal") async portal(@Req() req: AuthRequest) {
    return this.service.portal(req.actor);
  }
  @Get("books") async listBooks(@Req() req: AuthRequest) {
    return this.service.listBooks(req.actor);
  }
  @Post("books") async book(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.book(req.actor, body);
  }
  @Get("borrowings") async listBorrowings(
    @Req() req: AuthRequest,
    @Query("status") status?: string,
  ) {
    return this.service.listBorrowings(req.actor, status);
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
  @Get("penalties") async listPenalties(
    @Req() req: AuthRequest,
    @Query("status") status?: string,
  ) {
    return this.service.listPenalties(req.actor, status);
  }

  @Post("penalties/:id/resolve") async resolvePenalty(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.resolvePenalty(req.actor, id, body);
  }

  // ============================================================
  // SHELVES
  // ============================================================
  @Get("shelves") async listShelves(@Req() req: AuthRequest) {
    return this.service.listShelves(req.actor);
  }
  @Post("shelves") async createShelf(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createShelf(req.actor, body);
  }
  @Patch("shelves/:id") async updateShelf(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateShelf(req.actor, id, body);
  }
  @Delete("shelves/:id") async deleteShelf(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteShelf(req.actor, id);
  }

  // ============================================================
  // BOOK COPIES (Extended)
  // ============================================================
  @Get("copies") async listCopies(
    @Req() req: AuthRequest,
    @Query("book_id") bookId?: string,
  ) {
    return this.service.listCopies(req.actor, bookId);
  }
  @Post("copies") async createCopy(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createCopy(req.actor, body);
  }
  @Patch("copies/:id") async updateCopy(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateCopy(req.actor, id, body);
  }
  @Delete("copies/:id") async deleteCopy(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteCopy(req.actor, id);
  }

  // ============================================================
  // RENEWALS
  // ============================================================
  @Get("renewals") async listRenewals(
    @Req() req: AuthRequest,
    @Query("borrowing_id") borrowingId?: string,
  ) {
    return this.service.listRenewals(req.actor, borrowingId);
  }

  @Post("borrowings/:id/renew") async renewBorrowing(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.renewBorrowing(req.actor, id, body);
  }

  // ============================================================
  // RESERVATIONS
  // ============================================================
  @Get("reservations") async listReservations(
    @Req() req: AuthRequest,
    @Query("book_id") bookId?: string,
  ) {
    return this.service.listReservations(req.actor, bookId);
  }

  @Post("reservations") async createReservation(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createReservation(req.actor, body);
  }

  @Post("reservations/:id/cancel") async cancelReservation(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.cancelReservation(req.actor, id);
  }

  // ============================================================
  // INVENTORY
  // ============================================================
  @Get("inventory/stock") async listInventoryStock(@Req() req: AuthRequest) {
    return this.service.listInventoryStock(req.actor);
  }

  @Get("inventory/opnames") async listStockOpnames(@Req() req: AuthRequest) {
    return this.service.listStockOpnames(req.actor);
  }

  @Post("inventory/opnames") async createStockOpname(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createStockOpname(req.actor, body);
  }

  @Post("inventory/opnames/:id/finalize") async finalizeStockOpname(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.finalizeStockOpname(req.actor, id, body);
  }

  @Get("inventory/incidents") async listIncidents(@Req() req: AuthRequest) {
    return this.service.listIncidents(req.actor);
  }

  @Post("inventory/incidents") async createIncident(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createIncident(req.actor, body);
  }

  @Get("inventory/mutations") async listMutations(@Req() req: AuthRequest) {
    return this.service.listMutations(req.actor);
  }

  @Post("inventory/mutations") async createMutation(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createMutation(req.actor, body);
  }

  @Get("settings") async getSettings(@Req() req: AuthRequest) {
    return this.service.getSettings(req.actor);
  }

  @Put("settings") async updateSettings(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.updateSettings(req.actor, body);
  }

  @Get("reports/peminjaman") async getReportPeminjaman(@Req() req: AuthRequest) {
    return this.service.getReportPeminjaman(req.actor);
  }

  @Get("reports/pengembalian") async getReportPengembalian(@Req() req: AuthRequest) {
    return this.service.getReportPengembalian(req.actor);
  }

  @Get("reports/keterlambatan") async getReportKeterlambatan(@Req() req: AuthRequest) {
    return this.service.getReportKeterlambatan(req.actor);
  }

  @Get("reports/buku-terpopuler") async getReportBukuTerpopuler(@Req() req: AuthRequest) {
    return this.service.getReportBukuTerpopuler(req.actor);
  }

  @Get("reports/inventaris") async getReportInventaris(@Req() req: AuthRequest) {
    return this.service.getReportInventaris(req.actor);
  }

  @Get("reports/denda") async getReportDenda(@Req() req: AuthRequest) {
    return this.service.getReportDenda(req.actor);
  }

  @Get("categories") async listCategories(@Req() req: AuthRequest) {
    return this.service.listCategories(req.actor);
  }

  @Get("authors") async listAuthors(@Req() req: AuthRequest) {
    return this.service.listAuthors(req.actor);
  }

  @Get("publishers") async listPublishers(@Req() req: AuthRequest) {
    return this.service.listPublishers(req.actor);
  }
}
