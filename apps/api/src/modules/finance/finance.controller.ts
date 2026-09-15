import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AuthRequest } from "../auth/auth.types";
import { FinanceService } from "./finance.service";
@Controller("api/v1")
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly service: FinanceService,
  ) {}
  @Get("finance/students") async students(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.students(req.actor, query);
  }
  @Get("fee-types") async feeTypes(@Req() req: AuthRequest) {
    return this.service.feeTypes(req.actor);
  }
  @Post("fee-types") async addFee(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addFee(req.actor, body);
  }
  @Get("invoices") async invoices(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.invoices(req.actor, query);
  }
  @Post("invoices") async addInvoice(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addInvoice(req.actor, body);
  }
  @Get("invoices/:id") async invoice(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.invoice(req.actor, id);
  }
  @Post("payment-proofs") async uploadProof(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.uploadProof(req.actor, body);
  }
  @Get("payment-proofs/:id/file") async downloadProof(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.downloadProof(req.actor, id, res);
  }
  @Post("invoices/:id/payments") async submitPayment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.submitPayment(req.actor, id, body);
  }
  @Get("payments") async payments(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.payments(req.actor, query);
  }
  @Post("payments/:id/verify") async verifyPayment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.verifyPayment(req.actor, id, body);
  }
  @Get("wallets") async wallets(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.wallets(req.actor, query);
  }
  @Get("wallets/:studentId") async wallet(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
  ) {
    return this.service.wallet(req.actor, studentId);
  }
  @Get("wallets/:studentId/transactions") async transactions(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.transactions(req.actor, studentId, query);
  }
  @Put("wallets/:studentId/limits") async updateLimits(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateLimits(req.actor, studentId, body);
  }
  @Get("wallet-topups") async topups(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.topups(req.actor, query);
  }
  @Post("wallet-topups") async addTopup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addTopup(req.actor, body);
  }
  @Post("wallet-topups/:id/verify") async verifyTopup(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.verifyTopup(req.actor, id, body);
  }
  @Post("wallets/:studentId/adjustments") async adjustment(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.service.adjustment(req.actor, studentId, body);
  }
  @Get("wallet-merchants") async merchants(@Req() req: AuthRequest) {
    return this.service.merchants(req.actor);
  }
  @Post("wallet-merchants") async addMerchant(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addMerchant(req.actor, body);
  }
  @Patch("wallet-merchants/:id") async editMerchant(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.editMerchant(req.actor, id, body);
  }
  @Get("products") async products(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.products(req.actor, query);
  }
  @Post("products") async addProduct(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addProduct(req.actor, body);
  }
  @Patch("products/:id") async editProduct(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.editProduct(req.actor, id, body);
  }
  @Get("pos/students") async posStudents(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.posStudents(req.actor, query);
  }
  @Post("pos/checkout") async checkout(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.checkout(req.actor, body);
  }
  @Post("wallet-transactions/:id/refund") async refund(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.refund(req.actor, id, body);
  }
}
