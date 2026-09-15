import type { z } from "zod";
import type { attendanceSchema } from "../../../../../packages/validation/src";

export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type AttendanceRecordInput = AttendanceInput["records"][number];
