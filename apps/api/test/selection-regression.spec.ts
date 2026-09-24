import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function source(path: string) {
  return readFile(join(__dirname, "..", path), "utf8");
}

test("selection enforces both period and track capacity with latest stage scores", async () => {
  const service = await source("src/modules/admissions/admissions.service.ts");

  assert.match(service, /status IN \('ACCEPTED','ENROLLED'\)/);
  assert.match(service, /DISTINCT ON \(stage\)/);
  assert.match(service, /new Map\(reviews\.map\(\(review\) => \[review\.stage, review\]\)\)/);
  assert.match(service, /latestReview\.decision !== "PASSED"/);
  assert.match(service, /const periodOccupied = Number/);
  assert.match(service, /Math\.min\(trackAvailableCapacity, periodAvailableCapacity\)/);
});

test("Kanban gives selection outcomes an exclusive column", async () => {
  const queue = await source("../admin/src/pages/admissions-queue-tab.tsx");

  assert.match(queue, /WAITING_LIST/);
  assert.match(queue, /NOT_SELECTED/);
  assert.match(queue, /field === "selection_status" \|\| a\.selection_status === null/);
});

test("selection criteria scope has a null-safe unique index", async () => {
  const migration = await source("migrations/045_ppdb_selection.sql");
  assert.match(migration, /CREATE UNIQUE INDEX admission_selection_criteria_scope/);
  assert.match(migration, /COALESCE\(track_id/);
});
