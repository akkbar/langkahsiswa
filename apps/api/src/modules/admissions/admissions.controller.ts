import {
  BadRequestException,
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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { type AuthRequest } from "../auth/auth.types";
function strictPositiveInteger(value: string, field: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) throw new BadRequestException(`${field} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new BadRequestException(`${field} must be between ${min} and ${max}`);
  return parsed;
}

import {
  AdmissionsService,
  AdmissionFormService,
  AdmissionPaymentService,
  AdmissionInterviewService,
  AdmissionDocumentTemplateService,
  FilesService,
  PublicAdmissionsService,
  AdmissionReportsService,
} from "./admissions.service";
@Controller("api/v1/public/admissions")
export class PublicAdmissionsController {
  constructor(
    @Inject(PublicAdmissionsService)
    private readonly service: PublicAdmissionsService,
  ) {}
  @Get(":tenant/periods") async periods(@Param("tenant") slug: string) {
    return this.service.periods(slug);
  }
  @Post(":tenant/applications") async apply(
    @Param("tenant") slug: string,
    @Body() body: unknown,
  ) {
    return this.service.apply(slug, body);
  }
  @Post(":tenant/applications/:id/status") async status(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.status(slug, id, body);
  }
  @Post(":tenant/applications/:id/documents") async document(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.document(slug, id, body);
  }
  @Get(":tenant/form/:periodId") async getForm(
    @Param("tenant") slug: string,
    @Param("periodId") periodId: string,
  ) {
    return this.service.getForm(slug, periodId);
  }
}
@Controller("api/v1")
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(
    @Inject(AdmissionsService) private readonly service: AdmissionsService,
  ) {}
  @Get("admission-periods") async periods(@Req() req: AuthRequest) {
    return this.service.periods(req.actor);
  }
  @Get("admission-tracks") async tracks(
    @Req() req: AuthRequest,
    @Query("period_id") periodId?: string,
  ) {
    return this.service.tracks(req.actor, periodId);
  }
  @Post("admission-tracks") async addTrack(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addTrack(req.actor, body);
  }
  @Post("admission-periods") async addPeriod(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addPeriod(req.actor, body);
  }
  @Patch("admission-periods/:id/status") async periodStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.periodStatus(req.actor, id, body);
  }
  @Post("admissions/applications") async addApplication(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.addApplication(req.actor, body);
  }
  @Get("admissions/applications") async applications(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.applications(req.actor, query);
  }
  @Get("admissions/applications/:id") async application(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.application(req.actor, id);
  }
  @Get("admissions/applications/:id/documents") async applicationDocuments(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.applicationDocuments(req.actor, id);
  }
  @Post("admissions/applications/:id/reviews") async review(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.review(req.actor, id, body);
  }
  @Get("admissions/selection/criteria") async selectionCriteria(
    @Req() req: AuthRequest,
    @Query("period_id") periodId: string,
    @Query("track_id") trackId?: string,
  ) {
    return this.service.selectionCriteria(req.actor, periodId, trackId);
  }
  @Post("admissions/selection/criteria") async saveSelectionCriteria(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.saveSelectionCriteria(req.actor, body);
  }
  @Post("admissions/selection/run") async runSelection(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.runSelection(req.actor, body);
  }
  @Post("admissions/applications/:id/documents") async addDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.addDocument(req.actor, id, body);
  }
  @Patch("admissions/documents/:id") async verifyDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.verifyDocument(req.actor, id, body);
  }
  @Post("admissions/applications/:id/re-registration") async reRegister(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.reRegister(req.actor, id, body);
  }
  @Post("admissions/applications/:id/enroll") async enroll(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.enroll(req.actor, id, body);
  }
}
@Controller("api/v1/admissions/forms")
@UseGuards(AuthGuard)
export class AdmissionFormController {
  constructor(
    @Inject(AdmissionFormService)
    private readonly service: AdmissionFormService,
  ) {}

  @Get("sections") async listSections(
    @Req() req: AuthRequest,
    @Query("period_id") periodId: string,
  ) {
    return this.service.listSections(req.actor, periodId);
  }

  @Post("sections") async createSection(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createSection(req.actor, body);
  }

  @Patch("sections/:id") async updateSection(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateSection(req.actor, id, body);
  }

  @Delete("sections/:id") async deleteSection(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteSection(req.actor, id);
  }

  @Get("fields") async listFields(
    @Req() req: AuthRequest,
    @Query("section_id") sectionId: string,
  ) {
    return this.service.listFields(req.actor, sectionId);
  }

  @Post("fields") async createField(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createField(req.actor, body);
  }

  @Patch("fields/:id") async updateField(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateField(req.actor, id, body);
  }

  @Delete("fields/:id") async deleteField(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteField(req.actor, id);
  }

  @Get("responses") async getResponses(
    @Req() req: AuthRequest,
    @Query("application_id") applicationId: string,
  ) {
    return this.service.getResponses(req.actor, applicationId);
  }

  @Post("responses") async submitResponses(
    @Req() req: AuthRequest,
    @Body()
    body: { application_id: string; section_id: string; responses: any[] },
  ) {
    return this.service.submitResponses(req.actor, body.application_id, body);
  }
}
@Controller("api/v1/admissions/payments")
@UseGuards(AuthGuard)
export class AdmissionPaymentController {
  constructor(
    @Inject(AdmissionPaymentService)
    private readonly service: AdmissionPaymentService,
  ) {}

  @Get("schemes") async listSchemes(
    @Req() req: AuthRequest,
    @Query("track_id") trackId: string,
  ) {
    return this.service.listSchemes(req.actor, trackId);
  }

  @Post("schemes") async createScheme(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createScheme(req.actor, body);
  }

  @Patch("schemes/:id") async updateScheme(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateScheme(req.actor, id, body);
  }

  @Delete("schemes/:id") async deleteScheme(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteScheme(req.actor, id);
  }

  @Get("application") async getApplicationPayments(
    @Req() req: AuthRequest,
    @Query("application_id") applicationId: string,
  ) {
    return this.service.getApplicationPayments(req.actor, applicationId);
  }

  @Post("record") async recordPayment(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.recordPayment(req.actor, body);
  }

  @Post("proof") async uploadPaymentProof(
    @Req() req: AuthRequest,
    @Query("application_id") applicationId: string,
    @Query("scheme_id") schemeId: string,
    @Query("installment_number") installmentNumber: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.uploadPaymentProof(
      req.actor,
      applicationId,
      schemeId,
      installmentNumber,
      body,
    );
  }
}
@Controller("api/v1/admissions/interviews")
@UseGuards(AuthGuard)
export class AdmissionInterviewController {
  constructor(
    @Inject(AdmissionInterviewService)
    private readonly service: AdmissionInterviewService,
  ) {}

  @Get("slots") async listSlots(
    @Req() req: AuthRequest,
    @Query("period_id") periodId: string,
  ) {
    return this.service.listSlots(req.actor, periodId);
  }

  @Post("slots") async createSlot(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createSlot(req.actor, body);
  }

  @Patch("slots/:id") async updateSlot(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateSlot(req.actor, id, body);
  }

  @Delete("slots/:id") async deleteSlot(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteSlot(req.actor, id);
  }

  @Get("available") async getAvailableSlots(
    @Req() req: AuthRequest,
    @Query("application_id") applicationId: string,
  ) {
    return this.service.getAvailableSlots(req.actor, applicationId);
  }

  @Post("book") async bookSlot(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.bookSlot(req.actor, body);
  }

  @Post("cancel") async cancelBooking(
    @Req() req: AuthRequest,
    @Query("application_id") applicationId: string,
  ) {
    return this.service.cancelBooking(req.actor, applicationId);
  }

  @Get("bookings") async listBookings(
    @Req() req: AuthRequest,
    @Query("period_id") periodId: string,
  ) {
    return this.service.listBookings(req.actor, periodId);
  }

  @Patch("bookings/:id/attendance") async markAttendance(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { status: "ATTENDED" | "NO_SHOW" },
  ) {
    return this.service.markAttendance(req.actor, id, body.status);
  }
}
@Controller("api/v1/admissions/templates")
@UseGuards(AuthGuard)
export class AdmissionTemplateController {
  constructor(
    @Inject(AdmissionDocumentTemplateService)
    private readonly service: AdmissionDocumentTemplateService,
  ) {}

  @Get() async listTemplates(
    @Req() req: AuthRequest,
    @Query("period_id") periodId?: string,
  ) {
    return this.service.listTemplates(req.actor, periodId);
  }

  @Post() async createTemplate(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.createTemplate(req.actor, body);
  }

  @Patch(":id") async updateTemplate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateTemplate(req.actor, id, body);
  }

  @Delete(":id") async deleteTemplate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.deleteTemplate(req.actor, id);
  }

  @Post(":id/render") async renderTemplate(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query("application_id") applicationId: string,
  ) {
    return this.service.renderTemplate(req.actor, id, applicationId);
  }
}
@Controller("api/v1/files")
@UseGuards(AuthGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly service: FilesService) {}
  @Get() async list(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.actor, query);
  }
  @Post() async upload(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.upload(req.actor, body);
  }
  @Get(":id/download") async download(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    return this.service.download(req.actor, id, res);
  }
  @Patch(":id") async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(req.actor, id, body);
  }
  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.remove(req.actor, id);
  }
  @Post(":id/restore") async restore(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.restore(req.actor, id);
  }
}
@Controller("api/v1/admissions/reports")
@UseGuards(AuthGuard)
export class AdmissionReportsController {
  constructor(
    @Inject(AdmissionReportsService)
    private readonly service: AdmissionReportsService,
  ) {}

  @Get("dashboard") async dashboard(@Req() req: AuthRequest) {
    return this.service.dashboard(req.actor);
  }

  @Get("export") async export(
    @Req() req: AuthRequest,
    @Query("academic_year_id") academicYearId?: string,
    @Query("period_id") periodId?: string,
    @Query("track_id") trackId?: string,
    @Query("status") status?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.export(req.actor, {
      academicYearId,
      periodId,
      trackId,
      status,
      dateFrom,
      dateTo,
      type,
      page: page === undefined ? 1 : strictPositiveInteger(page, "page", 1, 2147483647),
      limit: limit === undefined ? 30 : strictPositiveInteger(limit, "limit", 1, 100),
    });
  }
}
