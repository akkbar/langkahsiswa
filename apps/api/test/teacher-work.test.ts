import test from "node:test";
import assert from "node:assert/strict";
import { assignmentInputSchema, noteInputSchema } from "../src/modules/teacher-work/teacher-work.service";

test("assignment input requires a class subject and coherent dates", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    assignmentInputSchema.safeParse({
      class_subject_id: id,
      title: "Latihan pecahan",
      instructions: "Kerjakan nomor 1 sampai 10",
      assigned_date: "2026-01-10",
      due_date: "2026-01-09",
    }).success,
    false,
  );
  assert.equal(
    assignmentInputSchema.safeParse({
      class_subject_id: id,
      title: "Latihan pecahan",
      instructions: "Kerjakan nomor 1 sampai 10",
      assigned_date: "2026-01-10",
      due_date: "2026-01-12",
    }).success,
    true,
  );
});

test("student notes require visibility and reject tenant controlled fields", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    noteInputSchema.safeParse({ student_id: id, note: "Perlu pendampingan" }).success,
    false,
  );
  assert.equal(
    noteInputSchema.safeParse({
      student_id: id,
      note: "Perlu pendampingan",
      visibility: "TEACHERS_ONLY",
      tenant_id: id,
    }).success,
    false,
  );
});
