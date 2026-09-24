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

test("createCopy validates book_id existence", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("FROM books")) return { rows: [] };
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.createCopy(actor, {
        book_id: "11111111-1111-1111-1111-111111111111",
        barcode: "COPY-001",
      });
    },
    (err: any) => {
      assert.ok(err instanceof NotFoundException);
      assert.equal(err.message, "Buku tidak ditemukan");
      return true;
    },
  );
});

test("createCopy validates duplicate barcode", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("FROM books")) return { rows: [{ id: "b1" }] };
      if (sql.includes("FROM book_copies WHERE tenant_id=$1 AND barcode=$2"))
        return { rows: [{ id: "c1" }] };
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.createCopy(actor, {
        book_id: "11111111-1111-1111-1111-111111111111",
        barcode: "COPY-001",
      });
    },
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      assert.equal(err.message, "Barcode eksemplar sudah terdaftar");
      return true;
    },
  );
});

test("createCopy validates shelf_id existence if provided", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("FROM books")) return { rows: [{ id: "b1" }] };
      if (sql.includes("FROM book_copies WHERE tenant_id=$1 AND barcode=$2"))
        return { rows: [] };
      if (sql.includes("FROM shelves")) return { rows: [] };
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.createCopy(actor, {
        book_id: "11111111-1111-1111-1111-111111111111",
        barcode: "COPY-001",
        shelf_id: "22222222-2222-2222-2222-222222222222",
      });
    },
    (err: any) => {
      assert.ok(err instanceof BadRequestException);
      assert.equal(err.message, "Rak tidak ditemukan");
      return true;
    },
  );
});

test("createCopy succeeds with valid parameters", async () => {
  const db: any = {
    query: async (sql: string, params: any[]) => {
      if (sql.includes("FROM books")) return { rows: [{ id: params[1] }] };
      if (sql.includes("FROM book_copies WHERE tenant_id=$1 AND barcode=$2"))
        return { rows: [] };
      if (sql.includes("FROM shelves")) return { rows: [{ id: params[1] }] };
      if (sql.includes("INSERT INTO book_copies")) {
        return {
          rows: [
            {
              id: "copy-123",
              tenant_id: params[0],
              book_id: params[1],
              barcode: params[2],
              shelf_id: params[3],
              acquisition_date: params[4],
              condition: params[5],
              status: params[6],
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  const copy = await service.createCopy(actor, {
    book_id: "11111111-1111-1111-1111-111111111111",
    barcode: "COPY-001",
    shelf_id: "22222222-2222-2222-2222-222222222222",
    acquisition_date: "2026-09-23",
    condition: "GOOD",
    status: "AVAILABLE",
  });

  assert.equal(copy.id, "copy-123");
  assert.equal(copy.barcode, "COPY-001");
  assert.equal(copy.condition, "GOOD");
  assert.equal(copy.status, "AVAILABLE");
});

test("updateCopy validates duplicate barcode on edit", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("FROM book_copies WHERE tenant_id=$1 AND barcode=$2 AND id!=$3"))
        return { rows: [{ id: "copy-other" }] };
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.updateCopy(
        actor,
        "33333333-3333-3333-3333-333333333333",
        { barcode: "COPY-EXISTS" },
      );
    },
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      assert.equal(err.message, "Barcode eksemplar sudah terdaftar");
      return true;
    },
  );
});

test("deleteCopy rejects if active borrowing exists", async () => {
  const db: any = {
    query: async (sql: string) => {
      if (sql.includes("WHERE tenant_id=$1 AND copy_id=$2 AND returned_at IS NULL"))
        return { rows: [{ id: "borrowing-1" }] };
      return { rows: [] };
    },
  };
  const service = new LibraryService(db);
  const actor = mockActor();

  await assert.rejects(
    async () => {
      await service.deleteCopy(actor, "33333333-3333-3333-3333-333333333333");
    },
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      assert.equal(err.message, "Eksemplar sedang dipinjam");
      return true;
    },
  );
});

test("enforces authorization for copy operations", async () => {
  const service = new LibraryService({} as any);
  const unprivilegedActor = mockActor([]);

  await assert.rejects(async () => {
    await service.listCopies(unprivilegedActor);
  });

  await assert.rejects(async () => {
    await service.createCopy(unprivilegedActor, {
      book_id: "11111111-1111-1111-1111-111111111111",
      barcode: "COPY-001",
    });
  });
});
