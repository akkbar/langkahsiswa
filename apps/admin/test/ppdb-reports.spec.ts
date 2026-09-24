import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "../src/pages/ppdb-reports";

test("CSV cells stringify nested values and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell({ status: "ok" }), `"{""status"":""ok""}"`);
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell(" \t@cmd"), `"' \t@cmd"`);
  assert.equal(csvCell("plain \"text\""), `"plain ""text"""`);
});
