import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TeacherService } from "../src/modules/teacher/teacher.service";

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  user: "22222222-2222-4222-8222-222222222222",
  teacher: "33333333-3333-4333-8333-333333333333",
  year: "44444444-4444-4444-8444-444444444444",
  semester: "55555555-5555-4555-8555-555555555555",
  class: "66666666-6666-4666-8666-666666666666",
  subject: "77777777-7777-4777-8777-777777777777",
};
const actor: any = { id: ids.user, tenant_id: ids.tenant, account_level: "OPERATIONAL", permissions: ["teaching_plan.create"], roles: ["TEACHER"] };

test("teacher plan creation derives the teacher from the authenticated user and validates the assignment", async () => {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    if (sql.includes("FROM teachers")) return { rows: [{ id: ids.teacher }] };
    if (sql.includes("FROM class_subjects")) return { rows: [{ id: "assignment", teacher_id: ids.teacher }] };
    if (sql.includes("INSERT INTO teaching_plans")) return { rows: [{ id: "plan", teacher_id: ids.teacher }] };
    return { rows: [] };
  };
  const service = new TeacherService({ query, transaction: async (_tenant: string, fn: any) => fn({ query }) } as any);
  const plan = await service.createPlan(actor, {
    academic_year_id: ids.year, semester_id: ids.semester, class_id: ids.class, subject_id: ids.subject, title: "Aljabar",
  });
  assert.equal(plan.teacher_id, ids.teacher);
  assert.ok(calls.some((sql) => sql.includes("FROM class_subjects")));
});

test("teacher workflow migration protects plan and log identity with partial unique indexes", async () => {
  const migration = await readFile(resolve(process.cwd(), "apps/api/migrations/050_teacher_workflow_hardening.sql"), "utf8");
  assert.match(migration, /UNIQUE INDEX.*teaching_plans.*teacher_id.*class_id.*subject_id.*semester_id/is);
  assert.match(migration, /WHERE timetable_id IS NOT NULL/is);
  assert.match(migration, /WHERE timetable_id IS NULL/is);
});
