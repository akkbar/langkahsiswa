import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { CbtService } from "./cbt.service";
@Controller("cbt")
export class CbtController {
  constructor(@Inject(CbtService) private readonly service: CbtService) {}
  @Get("options")
  async getOptions() {
    return this.service.getOptions();
  }
  @Post("sessions")
  async createSession(
    @Req() req: Request,
    @Body()
    body: {
      grade_level: string;
      subject: string;
      question_count: number;
      guest_session_id?: string;
    },
  ) {
    return this.service.createSession(req, body);
  }
  @Get("sessions/:id")
  async getSession(@Param("id") id: string) {
    return this.service.getSession(id);
  }
  @Post("sessions/:id/answer")
  async saveAnswer(
    @Param("id") id: string,
    @Body()
    body: {
      question_id: string;
      selected_option_id?: string;
      is_flagged?: boolean;
    },
  ) {
    return this.service.saveAnswer(id, body);
  }
  @Post("sessions/:id/finish")
  async finishSession(@Param("id") id: string) {
    return this.service.finishSession(id);
  }
}
