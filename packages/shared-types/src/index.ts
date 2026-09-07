export const roles = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "FINANCE",
  "PARENT",
  "STUDENT",
] as const;
export type Role = (typeof roles)[number];
export const attendanceStatuses = [
  "PRESENT",
  "LATE",
  "SICK",
  "PERMISSION",
  "ABSENT",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export interface Actor {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  roles: Role[];
  permissions: string[];
}
export interface Entity {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}
export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
