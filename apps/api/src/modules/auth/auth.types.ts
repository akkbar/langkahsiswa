import type { Request } from "express";
import {
  AccountType,
  Actor,
  Role,
} from "../../../../../packages/shared-types/src";
export type AuthRequest = Request & { actor: Actor };

export const roleNames: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "Admin Sekolah",
  PRINCIPAL: "Kepala Sekolah",
  TEACHER: "Guru",
  FINANCE: "Keuangan",
  STAFF: "Staff",
  FOUNDATION_STAFF: "Staff Yayasan",
  FOUNDATION_HEAD: "Kepala Yayasan",
  PARENT: "Orang Tua / Wali",
  STUDENT: "Siswa",
  CANTEEN_ADMIN: "Administrator Kantin",
};

export const accountTypes: Record<Actor["account_level"], AccountType> = {
  OPERATIONAL: "SCHOOL_ADMIN",
  FAMILY: "FAMILY",
  TENANT: "SCHOOL_TENANT",
};
