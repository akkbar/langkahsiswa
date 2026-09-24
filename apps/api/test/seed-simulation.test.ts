import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

test("simulation seed is configured for three grade levels, six classes, and one guardian per student", async () => {
  const source = await readFile(
    resolve(process.cwd(), "apps/api/scripts/seed-simulation.ts"),
    "utf8",
  );

  assert.match(source, /for \(let level = 7; level <= 9; level\+\+\)/);
  assert.match(source, /for \(const \[genderIndex, gender\] of \["MALE", "FEMALE"\]\.entries\(\)\)/);
  assert.match(source, /for \(let i = 0; i < 25; i\+\+\)/);
  assert.match(source, /students: 150,/);
  assert.match(source, /parents: 150,/);
  assert.match(source, /classes: 6,/);
  assert.match(source, /relationship: "GUARDIAN",\s*is_primary: true,/s);
});
