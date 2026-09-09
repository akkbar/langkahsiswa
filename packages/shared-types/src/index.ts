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
  account_id: string;
  name: string;
  email: string;
  tenant_name: string;
  tenant_slug: string;
  organization_id: string;
  organization_name: string;
  roles: Role[];
  permissions: string[];
}
export interface SiteSummary {
  id: string;
  name: string;
  slug: string;
  site_code: string;
  is_primary: boolean;
  current: boolean;
  organization_id: string;
  organization_name: string;
  roles: Role[];
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
