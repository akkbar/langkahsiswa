import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFinalGrade } from "../src/modules/gradebook/gradebook.service";
import {
  attendanceSchema,
  date,
  resources,
} from "../../../packages/validation/src";
test("weighted grades normalize unequal maximum scores and average within category", () => {
  const result = calculateFinalGrade([
    {
      name: "Tugas",
      weight: 20,
      assessments: [
        { name: "A", score: 40, max_score: 50 },
        { name: "B", score: 100, max_score: 100 },
      ],
    },
    {
      name: "Ujian",
      weight: 80,
      assessments: [{ name: "UAS", score: 70, max_score: 100 }],
    },
  ]);
  assert.equal(result.final_grade, 74);
  assert.equal(result.details[0].average, 90);
});
test("zero is a real score; missing score is not zero", () => {
  assert.equal(
    calculateFinalGrade([
      {
        name: "Ujian",
        weight: 100,
        assessments: [{ name: "UAS", score: 0, max_score: 100 }],
      },
    ]).final_grade,
    0,
  );
  assert.throws(() =>
    calculateFinalGrade([
      {
        name: "Ujian",
        weight: 100,
        assessments: [{ name: "UAS", score: null, max_score: 100 }],
      },
    ]),
  );
});
test("incomplete weights, empty categories, and out of range grades fail", () => {
  for (const categories of [
    [],
    [{ name: "X", weight: 99, assessments: [] }],
    [{ name: "X", weight: 100, assessments: [] }],
    [
      {
        name: "X",
        weight: 100,
        assessments: [{ name: "X", score: 101, max_score: 100 }],
      },
    ],
  ])
    assert.throws(() => calculateFinalGrade(categories));
});
test("date validation rejects impossible dates", () => {
  assert.equal(date.parse("2028-02-29"), "2028-02-29");
  assert.equal(date.safeParse("2026-02-29").success, false);
  assert.equal(date.safeParse("2026-13-01").success, false);
});
test("strict DTO rejects tenant injection and unsupported attendance sources", () => {
  assert.equal(
    resources.students.schema
      .strict()
      .safeParse({ name: "Test", nis: "1", tenant_id: "other" }).success,
    false,
  );
  assert.equal(attendanceSchema.safeParse({ source: "RFID" }).success, false);
});
