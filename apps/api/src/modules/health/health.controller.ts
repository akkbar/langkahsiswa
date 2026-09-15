import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.check();
    if (result.status !== "ok") res.status(503);
    return result;
  }
}
