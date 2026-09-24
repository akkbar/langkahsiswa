import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import { TeacherWorkService } from "./teacher-work.service";

@Controller("api/v1/teacher-work")
@UseGuards(AuthGuard)
export class TeacherWorkController {
  constructor(@Inject(TeacherWorkService) private readonly service: TeacherWorkService) {}
  @Get("context") context(@Req() req: AuthRequest) { return this.service.context(req.actor); }
  @Get("assignments") assignments(@Req() req: AuthRequest, @Query("class_subject_id") classSubjectId?: string) { return this.service.assignments(req.actor, classSubjectId); }
  @Post("assignments") createAssignment(@Req() req: AuthRequest, @Body() body: unknown) { return this.service.createAssignment(req.actor, body); }
  @Put("assignments/:id") updateAssignment(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) { return this.service.updateAssignment(req.actor, id, body); }
  @Delete("assignments/:id") deleteAssignment(@Req() req: AuthRequest, @Param("id") id: string) { return this.service.deleteAssignment(req.actor, id); }
  @Get("assignments/:id/submissions") submissions(@Req() req: AuthRequest, @Param("id") id: string) { return this.service.submissions(req.actor, id); }
  @Put("assignments/:id/students/:studentId/review") review(@Req() req: AuthRequest, @Param("id") id: string, @Param("studentId") studentId: string, @Body() body: unknown) { return this.service.review(req.actor, id, studentId, body); }
  @Get("notes") notes(@Req() req: AuthRequest, @Query("student_id") studentId?: string) { return this.service.notes(req.actor, studentId); }
  @Post("notes") createNote(@Req() req: AuthRequest, @Body() body: unknown) { return this.service.createNote(req.actor, body); }
  @Put("notes/:id") updateNote(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) { return this.service.updateNote(req.actor, id, body); }
  @Delete("notes/:id") deleteNote(@Req() req: AuthRequest, @Param("id") id: string) { return this.service.deleteNote(req.actor, id); }
}
