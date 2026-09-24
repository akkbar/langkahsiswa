import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { LibraryService } from "../src/modules/library/library.service";
import type { Actor } from "../../../packages/shared-types/src";

function mockActor(permissions: string[] = ["library.read", "library.write"]): Actor {
  return {
    id: "user-1",
    account_id: "acc-1",
    account_level: "SCHOOL",
    account_type: "STAFF",
    tenant_id: "tenant-1",
    name: "Test Admin",
    email: "admin@test.local",
    roles: ["SCHOOL_ADMIN"],
    permissions,
  } as unknown as Actor;
}

test("renewBorrowing validates borrowing existence", async () => {
  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string) => {
          if (sql.includes("FROM borrowings")) return { rows: [] };
          return { rows: [] };
        },
      });
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.renewBorrowing(actor, "11111111-1111-1111-1111-111111111111", { days: 7 });
    },
    (err: any) => {
      assert.ok(err instanceof NotFoundException);
      assert.equal(err.message, "Peminjaman tidak ditemukan");
      return true;
    },
  );
});

test("renewBorrowing enforces max renewal limit (2x)", async () => {
  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string) => {
          if (sql.includes("FROM borrowings")) {
            return {
              rows: [
                {
                  id: "b-1",
                  status: "BORROWED",
                  returned_at: null,
                  due_date: "2026-10-01",
                  student_id: "s-1",
                },
              ],
            };
          }
          if (sql.includes("FROM students")) return { rows: [{ status: "ACTIVE" }] };
          if (sql.includes("FROM library_renewals")) return { rows: [{ count: 2 }] };
          return { rows: [] };
        },
      });
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.renewBorrowing(actor, "11111111-1111-1111-1111-111111111111", { days: 7 });
    },
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      assert.match(err.message, /Batas maksimal perpanjangan/);
      return true;
    },
  );
});

test("renewBorrowing successfully updates due date and persists renewal history", async () => {
  let updatedDueDate = "";
  let insertedRenewal: any = null;

  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string, params: any[]) => {
          if (sql.includes("FROM borrowings WHERE")) {
            return {
              rows: [
                {
                  id: "11111111-1111-1111-1111-111111111111",
                  status: "BORROWED",
                  returned_at: null,
                  due_date: "2026-10-01",
                  student_id: "s-1",
                },
              ],
            };
          }
          if (sql.includes("FROM students")) return { rows: [{ status: "ACTIVE" }] };
          if (sql.includes("FROM library_renewals WHERE")) return { rows: [{ count: 0 }] };
          if (sql.includes("UPDATE borrowings SET due_date=")) {
            updatedDueDate = params[2];
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO library_renewals")) {
            insertedRenewal = {
              id: "ren-1",
              borrowing_id: params[1],
              renewal_count: params[2],
              previous_due_date: params[3],
              new_due_date: params[4],
              renewed_by: params[5],
            };
            return { rows: [insertedRenewal] };
          }
          return { rows: [] };
        },
      });
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  const res = await service.renewBorrowing(actor, "11111111-1111-1111-1111-111111111111", { days: 7 });

  assert.equal(res.previous_due_date, "2026-10-01");
  assert.equal(res.new_due_date, "2026-10-08");
  assert.equal(updatedDueDate, "2026-10-08");
  assert.equal(insertedRenewal.renewal_count, 1);
});
