import { ForbiddenException } from "@nestjs/common";
import { Actor, Role } from "../../../../../packages/shared-types/src";

export const read = [
  "school.read",
  "student.read",
  "people.read",
  "academic.read",
  "attendance.read",
  "grade.read",
  "report.read",
  "event.read",
  "notification.read",
  "site.read",
  "foundation.read",
];
export const rolePermissions: Record<Role, string[]> = {
  SUPER_ADMIN: ["*"],
  SCHOOL_ADMIN: ["*"],
  PRINCIPAL: [
    ...read,
    "academic_setup.write",
    "report.approve",
    "report.publish",
    "event.write",
    "event.read",
    "notification.read",
    "admission.read",
    "admission.write",
    "file.read",
    "website.read",
    "domain.read",
    "boarding.read",
    "boarding.write",
    "library.read",
    "library.write",
    "audit.read",
  ],
  TEACHER: [
    ...read,
    "attendance.write",
    "grade.write",
    "report.calculate",
    "report.review",
    "boarding.read",
    "library.read",
  ],
  FINANCE: [
    "student.read",
    "people.read",
    "school.read",
    "payment.verify",
    "finance.read",
    "finance.write",
    "wallet.read",
    "wallet.write",
    "pos.write",
    "event.read",
    "notification.read",
    "file.read",
    "site.read",
    "foundation.read",
  ],
  STAFF: [
    "school.read",
    "student.read",
    "student.create",
    "student.update",
    "people.read",
    "people.write",
    "user.write",
    "admission.read",
    "admission.write",
    "event.read",
    "notification.read",
    "site.read",
    "foundation.read",
  ],
  FOUNDATION_STAFF: [
    "school.read",
    "student.read",
    "people.read",
    "finance.read",
    "report.read",
    "event.read",
    "admission.read",
    "site.read",
    "foundation.read",
    "academic_setup.read",
  ],
  FOUNDATION_HEAD: [
    "school.read",
    "school.write",
    "student.read",
    "people.read",
    "academic.read",
    "finance.read",
    "report.read",
    "report.approve",
    "event.read",
    "admission.read",
    "audit.read",
    "site.read",
    "foundation.read",
    "site.write",
    "foundation.write",
    "academic_setup.write",
    "hr_private.write",
  ],
  PARENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
    "site.read",
    "family.read",
    "family.write",
    "family.student.manage",
  ],
  STUDENT: [
    "report.own",
    "event.read",
    "notification.read",
    "boarding.own",
    "library.own",
    "site.read",
    "family.read",
  ],
  CANTEEN_ADMIN: [
    "student.read",
    "finance.read",
    "wallet.read",
    "pos.write",
    "event.read",
    "notification.read",
    "site.read",
    "foundation.read",
  ],
};
export function allow(actor: Actor, permission: string) {
  if (
    !actor.permissions.includes("*") &&
    !actor.permissions.includes(permission)
  )
    throw new ForbiddenException("Hak akses tidak mencukupi");
}
export function allowAny(actor: Actor, permissions: string[]) {
  if (
    !actor.permissions.includes("*") &&
    !permissions.some((permission) => actor.permissions.includes(permission))
  )
    throw new ForbiddenException("Hak akses tidak mencukupi");
}
export function allowOperational(actor: Actor) {
  if (actor.account_level !== "OPERATIONAL")
    throw new ForbiddenException("Halaman ini hanya untuk akun operational");
}
export function isAdmin(actor: Actor) {
  return (
    actor.roles.includes("SUPER_ADMIN") || actor.roles.includes("SCHOOL_ADMIN")
  );
}
