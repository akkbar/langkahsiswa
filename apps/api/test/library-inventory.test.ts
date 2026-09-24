import assert from "node:assert/strict";
import { test } from "node:test";
import { LibraryService } from "../src/modules/library/library.service.js";
import type { Actor } from "../../../packages/shared-types/src";

function mockActor(): Actor {
  return {
    id: "user-1",
    account_id: "acc-1",
    account_level: "SCHOOL",
    account_type: "STAFF",
    tenant_id: "tenant-1",
    name: "Test Admin",
    email: "admin@test.local",
    roles: ["SCHOOL_ADMIN"],
    permissions: ["library.read", "library.write"],
  } as unknown as Actor;
}

test("listInventoryStock queries inventory stock summary", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("FROM books")) {
        return { rows: [{ id: "b1", title: "Test Book", total_copies: 5, available_copies: 3 }] };
      }
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();
  const res = await service.listInventoryStock(actor);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].title, "Test Book");
});
