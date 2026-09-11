export const roles = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "FINANCE",
  "STAFF",
  "FOUNDATION_STAFF",
  "FOUNDATION_HEAD",
  "PARENT",
  "STUDENT",
  "CANTEEN_ADMIN",
] as const;
export type Role = (typeof roles)[number];
export type AccountType = "SCHOOL_ADMIN" | "FAMILY" | "SCHOOL_TENANT";
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
  account_level: "OPERATIONAL" | "FAMILY" | "TENANT";
  account_type: AccountType;
  name: string;
  email: string;
  tenant_name: string;
  tenant_slug: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  roles: Role[];
  permissions: string[];
}
export interface SitePhoto {
  id: string;
  file_name: string;
  mime_type: string;
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
  binding_scope?: "FOUNDATION" | "SCHOOL";
  school_id?: string;
  school_name?: string;
  address?: string | null;
  phone?: string | null;
  principal_teacher_id?: string | null;
  principal_name?: string | null;
  education_authority?: "KEMENDIKBUD" | "KEMENAG";
  school_level?: "PAUD" | "TK" | "SD" | "SMP" | "SMA" | null;
  npsn?: string | null;
  nss?: string | null;
  dapodik_id?: string | null;
  nsm?: string | null;
  emis_id?: string | null;
  code?: string | null;
  education_form?: string | null;
  ownership_status?: "PUBLIC" | "PRIVATE";
  province_id?: string | null;
  city_id?: string | null;
  district_id?: string | null;
  village_id?: string | null;
  postal_code?: string | null;
  establishment_decree_number?: string | null;
  establishment_decree_date?: string | null;
  operational_license_number?: string | null;
  operational_license_start?: string | null;
  operational_license_end?: string | null;
  accreditation?: string | null;
  accreditation_number?: string | null;
  accreditation_valid_until?: string | null;
  photos?: SitePhoto[];
}
export interface SiteProfile {
  id: string;
  name: string;
  slug: string;
  site_code: string;
  is_primary: boolean;
  current: boolean;
  school_id: string;
  school_name: string;
  address: string | null;
  phone: string | null;
  principal_teacher_id: string | null;
  principal_name: string | null;
  education_authority: "KEMENDIKBUD" | "KEMENAG";
  school_level: "PAUD" | "TK" | "SD" | "SMP" | "SMA" | null;
  npsn: string | null;
  nss: string | null;
  dapodik_id: string | null;
  nsm: string | null;
  emis_id: string | null;
  code: string | null;
  education_form: string | null;
  ownership_status: "PUBLIC" | "PRIVATE";
  province_id: string | null;
  city_id: string | null;
  district_id: string | null;
  village_id: string | null;
  postal_code: string | null;
  establishment_decree_number: string | null;
  establishment_decree_date: string | null;
  operational_license_number: string | null;
  operational_license_start: string | null;
  operational_license_end: string | null;
  accreditation: string | null;
  accreditation_number: string | null;
  accreditation_valid_until: string | null;
  photos: SitePhoto[];
  teachers: Array<{ id: string; name: string; nip: string }>;
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
