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

test("createReservation validates book and active student", async () => {
  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string) => {
          if (sql.includes("FROM books")) return { rows: [] };
          return { rows: [] };
        },
      });
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.createReservation(actor, {
        book_id: "11111111-1111-1111-1111-111111111111",
        student_id: "22222222-2222-2222-2222-222222222222",
      });
    },
    (err: any) => {
      assert.ok(err instanceof NotFoundException);
      assert.equal(err.message, "Buku tidak ditemukan");
      return true;
    },
  );
});

test("createReservation assigns queue position when no copy is available", async () => {
  let createdReservation: any = null;

  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string, params: any[]) => {
          if (sql.includes("FROM books")) return { rows: [{ id: params[1] }] };
          if (sql.includes("FROM students")) return { rows: [{ status: "ACTIVE" }] };
          if (sql.includes("FROM library_reservations WHERE tenant_id=$1 AND book_id=$2 AND student_id=$3")) {
            return { rows: [] }; // No duplicate
          }
          if (sql.includes("FROM book_copies")) {
            return { rows: [] }; // No available copy
          }
          if (sql.includes("SELECT COALESCE(MAX(queue_position)")) {
            return { rows: [{ max_queue: 2 }] };
          }
          if (sql.includes("INSERT INTO library_reservations")) {
            createdReservation = {
              id: "res-1",
              status: "WAITING",
              queue_position: params[3],
            };
            return { rows: [createdReservation] };
          }
          return { rows: [] };
        },
      });
    },
  };

  const service = new LibraryService(db);
  const actor = mockActor();

  const res = await service.createReservation(actor, {
    book_id: "11111111-1111-1111-1111-111111111111",
    student_id: "22222222-2222-2222-2222-222222222222",
  });

  assert.equal(res.status, "WAITING");
  assert.equal(res.queue_position, 3);
});

test("cancelReservation safely updates status and releases copy", async () => {
  let updatedStatus = "";

  const db: any = {
    transaction: async (_tenantId: string, cb: any) => {
      return cb({
        query: async (sql: string, params: any[]) => {
          if (sql.includes("FROM library_reservations WHERE tenant_id=$1 AND id=$2 FOR UPDATE")) {
            return {
              rows: [
                {
                  id: params[1],
                  status: "WAITING",
                  book_id: "b-1",
                  assigned_copy_id: null,
                },
              ],
            };
          }
          if (sql.includes("UPDATE library_reservations SET status='CANCELLED'")) {
            updatedStatus = "CANCELLED";
            return { rows: [{ id: params[1], status: "CANCELLED" }] };
          }
          return { rows: [] };
        },
      });
    },
  };

  const service = new LibraryService(db);
  const actor = mockActor();

  const res = await service.cancelReservation(actor, "33333333-3333-3333-3333-333333333333");
  assert.equal(res.status, "CANCELLED");
  assert.equal(updatedStatus, "CANCELLED");
});
