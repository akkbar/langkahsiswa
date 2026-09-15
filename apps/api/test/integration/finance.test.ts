import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../../src/database/database.service";
import {
  createTenant,
  initializeRoles,
} from "../../src/modules/auth/tenant-provisioning";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 10–13: real PostgreSQL finance, proof files and concurrent POS", async (t) => {
  const base = new Database();
  const schema = `finance_test_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const previousUrl = process.env.DATABASE_URL,
    previousStorage = process.env.STORAGE_PATH;
  const url = new URL(previousUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  const storage = await mkdtemp(join(tmpdir(), "langkahsiswa-finance-"));
  process.env.STORAGE_PATH = storage;
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Finance A",
        slug: "finance-a",
        admin_name: "Admin",
        admin_email: "admin@finance.test",
        admin_password: "Password!2026",
      }),
    );
    const otherTenant = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Finance B",
        slug: "finance-b",
        admin_name: "Admin B",
        admin_email: "admin@other.test",
        admin_password: "Password!2026",
      }),
    );
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function raw(
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
    ) {
      return fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
      expected = 200,
    ) {
      const res = await raw(path, method, body, token);
      const value = await res.json();
      assert.equal(
        res.status,
        expected,
        `${method} ${path}: ${JSON.stringify(value)}`,
      );
      return value;
    }
    const login = async (email: string, tenant_slug = "finance-a") =>
      (
        await request(
          "auth/login",
          "POST",
          { tenant_slug, email, password: "Password!2026" },
          undefined,
          201,
        )
      ).access_token;
    const admin = await login("admin@finance.test");
    const other = await login("admin@other.test", "finance-b");
    const post = (path: string, body: unknown, expected = 201, token = admin) =>
      request(path, "POST", body, token, expected);
    const student = await post("students", { name: "Santri A", nis: "0001" });
    const second = await post("students", { name: "Santri B", nis: "0002" });
    const foreign = await post(
      "students",
      { name: "Foreign", nis: "0001" },
      201,
      other,
    );
    async function createRole(email: string, role: string) {
      const user = await post("users", {
        name: role,
        email,
        password: "Password!2026",
        roles: [role],
      });
      return { user, token: await login(email) };
    }
    const parentAuth = await createRole("parent@finance.test", "PARENT");
    const unlinkedAuth = await createRole("unlinked@finance.test", "PARENT");
    const studentAuth = await createRole("student@finance.test", "STUDENT");
    const financeAuth = await createRole("finance@finance.test", "FINANCE");
    const teacherAuth = await createRole("teacher@finance.test", "TEACHER");
    const parent = await post("parents", {
      name: "Wali",
      user_id: parentAuth.user.id,
    });
    await post("student-guardians", {
      student_id: student.id,
      parent_id: parent.id,
      relationship: "GUARDIAN",
    });
    await request(
      `students/${student.id}`,
      "PATCH",
      { user_id: studentAuth.user.id },
      admin,
    );
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF",
    );
    const proof = (studentId = student.id, token = parentAuth.token) =>
      post(
        "payment-proofs",
        {
          student_id: studentId,
          file_name: "transfer.pdf",
          mime_type: "application/pdf",
          data_base64: pdf.toString("base64"),
        },
        201,
        token,
      );
    let invoice: any, payment: any, merchant: any, product: any, topup: any;

    await t.test(
      "scope, ownership, integer amounts and real proof downloads",
      async () => {
        assert.deepEqual(
          (
            await request(
              "finance/students",
              "GET",
              undefined,
              parentAuth.token,
            )
          ).data.map((s: any) => s.id),
          [student.id],
        );
        assert.equal(
          (await request("wallets", "GET", undefined, unlinkedAuth.token)).data
            .length,
          0,
        );
        await request(
          `wallets/${student.id}`,
          "GET",
          undefined,
          unlinkedAuth.token,
          404,
        );
        await request(
          `wallets/${second.id}`,
          "GET",
          undefined,
          parentAuth.token,
          404,
        );
        await request(
          "finance/students",
          "GET",
          undefined,
          teacherAuth.token,
          403,
        );
        await post("fee-types", { name: "Bad", amount: 1.5 }, 400);
        await post(
          "fee-types",
          { name: "Denied", amount: 10000 },
          403,
          parentAuth.token,
        );
        await post(
          "payment-proofs",
          {
            student_id: student.id,
            file_name: "fake.pdf",
            mime_type: "application/pdf",
            data_base64: Buffer.from("not a PDF").toString("base64"),
          },
          400,
          parentAuth.token,
        );
        const uploaded = await proof();
        const download = await raw(
          `payment-proofs/${uploaded.id}/file`,
          "GET",
          undefined,
          parentAuth.token,
        );
        assert.equal(download.status, 200);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
        assert.match(
          download.headers.get("content-disposition")!,
          /attachment/,
        );
        await request(
          `payment-proofs/${uploaded.id}/file`,
          "GET",
          undefined,
          other,
          404,
        );
        await request(
          `payment-proofs/${uploaded.id}/file`,
          "GET",
          undefined,
          unlinkedAuth.token,
          404,
        );
        await request(
          `payment-proofs/${uploaded.id}/file`,
          "GET",
          undefined,
          undefined,
          401,
        );
        const validLarge = Buffer.concat([
          Buffer.from("%PDF-1.4\n"),
          Buffer.alloc(200000),
        ]);
        await post(
          "payment-proofs",
          {
            student_id: student.id,
            file_name: "large.pdf",
            mime_type: "application/pdf",
            data_base64: validLarge.toString("base64"),
          },
          201,
          parentAuth.token,
        );
        await post(
          "payment-proofs",
          {
            student_id: foreign.id,
            file_name: "cross.pdf",
            mime_type: "application/pdf",
            data_base64: pdf.toString("base64"),
          },
          404,
        );
      },
    );
    await t.test(
      "invoice item totals, partial approval, proof reuse and verification replay",
      async () => {
        const fee = await post(
          "fee-types",
          { name: "SPP", amount: 100000 },
          201,
          financeAuth.token,
        );
        invoice = await post(
          "invoices",
          {
            student_id: student.id,
            title: "SPP September",
            due_date: "2026-09-30",
            items: [
              {
                fee_type_id: fee.id,
                description: "SPP",
                unit_amount: 100000,
                quantity: 2,
              },
            ],
          },
          201,
          financeAuth.token,
        );
        assert.equal(invoice.total_amount, 200000);
        assert.equal(
          (await request("invoices", "GET", undefined, parentAuth.token)).total,
          1,
        );
        await request(
          `invoices/${invoice.id}`,
          "GET",
          undefined,
          unlinkedAuth.token,
          404,
        );
        const uploaded = await proof();
        payment = await post(
          `invoices/${invoice.id}/payments`,
          { amount: 100000, proof_id: uploaded.id },
          201,
          parentAuth.token,
        );
        await post(
          "wallet-topups",
          { student_id: student.id, amount: 100000, proof_id: uploaded.id },
          409,
          parentAuth.token,
        );
        await post(
          `payments/${payment.id}/verify`,
          { decision: "APPROVED" },
          403,
          parentAuth.token,
        );
        await post(
          `payments/${payment.id}/verify`,
          { decision: "APPROVED" },
          404,
          other,
        );
        const results = await Promise.all(
          [1, 2].map(() =>
            post(
              `payments/${payment.id}/verify`,
              { decision: "APPROVED" },
              201,
              financeAuth.token,
            ),
          ),
        );
        assert.ok(results.every((v) => v.status === "APPROVED"));
        const detail = await request(
          `invoices/${invoice.id}`,
          "GET",
          undefined,
          parentAuth.token,
        );
        assert.equal(detail.status, "PARTIAL");
        assert.equal(detail.paid_amount, 100000);
        assert.equal(
          (
            await db.query(
              "SELECT count(*) AS n FROM payment_verifications WHERE payment_id=$1",
              [payment.id],
            )
          ).rows[0].n,
          "1",
        );
        await post(
          `payments/${payment.id}/verify`,
          { decision: "REJECTED" },
          409,
        );
        const proof2 = await proof();
        await post(
          `invoices/${invoice.id}/payments`,
          { amount: 100001, proof_id: proof2.id },
          409,
          parentAuth.token,
        );
        const final = await post(
          `invoices/${invoice.id}/payments`,
          { amount: 100000, proof_id: proof2.id },
          201,
          parentAuth.token,
        );
        await post(`payments/${final.id}/verify`, { decision: "APPROVED" });
        assert.equal(
          (await request(`invoices/${invoice.id}`, "GET", undefined, admin))
            .status,
          "PAID",
        );
      },
    );
    await t.test(
      "rejected payment leaves amount due and keeps immutable audit",
      async () => {
        const bill = await post("invoices", {
          student_id: student.id,
          title: "Laundry",
          due_date: "2026-10-01",
          items: [{ description: "Laundry", unit_amount: 30000 }],
        });
        const uploaded = await proof();
        const pay = await post(
          `invoices/${bill.id}/payments`,
          { amount: 30000, proof_id: uploaded.id },
          201,
          parentAuth.token,
        );
        await post(`payments/${pay.id}/verify`, {
          decision: "REJECTED",
          notes: "Transfer belum diterima",
        });
        assert.equal(
          (await request(`invoices/${bill.id}`, "GET", undefined, admin))
            .paid_amount,
          0,
        );
        await assert.rejects(
          db.query("DELETE FROM payment_verifications WHERE payment_id=$1", [
            pay.id,
          ]),
          { code: "23514" },
        );
      },
    );
    await t.test(
      "verified topup credits once and sends a single notification per recipient",
      async () => {
        const uploaded = await proof();
        topup = await post(
          "wallet-topups",
          { student_id: student.id, amount: 100000, proof_id: uploaded.id },
          201,
          parentAuth.token,
        );
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          0,
        );
        await post(
          `wallet-topups/${topup.id}/verify`,
          { decision: "APPROVED" },
          403,
          studentAuth.token,
        );
        const replies = await Promise.all(
          [1, 2, 3].map(() =>
            post(`wallet-topups/${topup.id}/verify`, { decision: "APPROVED" }),
          ),
        );
        assert.ok(
          replies.every((x) => x.transaction_id === replies[0].transaction_id),
        );
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          100000,
        );
        const notifications = (
          await db.query(
            "SELECT * FROM notifications WHERE tenant_id=$1 AND dedupe_key=$2",
            [tenant.id, `topup:${topup.id}:verified`],
          )
        ).rows;
        assert.equal(notifications.length, 2);
        await post(
          `wallet-topups/${topup.id}/verify`,
          { decision: "REJECTED" },
          409,
        );
      },
    );
    await t.test(
      "cashier permissions, authoritative pricing and atomic idempotent checkout",
      async () => {
        merchant = await post("wallet-merchants", {
          name: "Kantin",
          category: "FOOD",
        });
        product = await post("products", {
          merchant_id: merchant.id,
          name: "Nasi",
          price: 20000,
          stock: 10,
        });
        const checkout = {
          student_id: student.id,
          merchant_id: merchant.id,
          items: [{ product_id: product.id, quantity: 1 }],
          idempotency_key: randomUUID(),
        };
        await post("pos/checkout", checkout, 403, parentAuth.token);
        await post("pos/checkout", { ...checkout, amount: 1 }, 400);
        await post(
          "pos/checkout",
          { ...checkout, items: [{ product_id: product.id, quantity: -1 }] },
          400,
        );
        const results = await Promise.all(
          [1, 2].map(() =>
            post("pos/checkout", checkout, 201, financeAuth.token),
          ),
        );
        assert.equal(results[0].id, results[1].id);
        assert.equal(results[0].amount, -20000);
        assert.equal(results[0].items[0].unit_amount, 20000);
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          80000,
        );
        assert.equal(
          (
            await db.query("SELECT stock FROM products WHERE id=$1", [
              product.id,
            ])
          ).rows[0].stock,
          9,
        );
        await post(
          "pos/checkout",
          { ...checkout, items: [{ product_id: product.id, quantity: 2 }] },
          409,
          financeAuth.token,
        );
        await post(
          `wallets/${student.id}/adjustments`,
          {
            amount: -90000,
            reason: "Must fail",
            idempotency_key: randomUUID(),
          },
          409,
        );
      },
    );
    await t.test(
      "parent daily/monthly/category limits and merchant blocks enforced inside checkout",
      async () => {
        const baseLimits = {
          daily_limit: null,
          monthly_limit: null,
          category_limits: {},
          blocked_merchant_ids: [],
        };
        const set = (
          limits: unknown,
          token = parentAuth.token,
          expected = 200,
        ) =>
          request(
            `wallets/${student.id}/limits`,
            "PUT",
            limits,
            token,
            expected,
          );
        const buy = () => ({
          student_id: student.id,
          merchant_id: merchant.id,
          items: [{ product_id: product.id, quantity: 1 }],
          idempotency_key: randomUUID(),
        });
        await set(baseLimits, studentAuth.token, 404);
        await set(baseLimits, unlinkedAuth.token, 404);
        await set({ ...baseLimits, daily_limit: 30000 });
        await post("pos/checkout", buy(), 409);
        await set({ ...baseLimits, monthly_limit: 30000 });
        await post("pos/checkout", buy(), 409);
        await set({ ...baseLimits, category_limits: { FOOD: 30000 } });
        await post("pos/checkout", buy(), 409);
        await set({ ...baseLimits, blocked_merchant_ids: [merchant.id] });
        await post("pos/checkout", buy(), 403);
        await set(
          { ...baseLimits, blocked_merchant_ids: [randomUUID()] },
          parentAuth.token,
          400,
        );
        assert.deepEqual(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).limits.blocked_merchant_ids,
          [merchant.id],
          "Failed FK must roll back entire limits change",
        );
        await set(baseLimits);
      },
    );
    await t.test(
      "concurrent purchases never overspend; unsuccessful checkout preserves stock",
      async () => {
        const expensive = await post("products", {
          merchant_id: merchant.id,
          name: "Paket",
          price: 50000,
          stock: 2,
        });
        const replies = await Promise.all(
          [1, 2].map(() =>
            raw(
              "pos/checkout",
              "POST",
              {
                student_id: student.id,
                merchant_id: merchant.id,
                items: [{ product_id: expensive.id, quantity: 1 }],
                idempotency_key: randomUUID(),
              },
              admin,
            ),
          ),
        );
        assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          30000,
        );
        assert.equal(
          (
            await db.query("SELECT stock FROM products WHERE id=$1", [
              expensive.id,
            ])
          ).rows[0].stock,
          1,
        );
        const wallet = await request(
          `wallets/${student.id}`,
          "GET",
          undefined,
          parentAuth.token,
        );
        assert.equal(wallet.today_spending, 70000);
        assert.equal(wallet.month_spending, 70000);
      },
    );
    await t.test(
      "refund is full, once-only, restores stock, ledger never mutates",
      async () => {
        const purchase = (
          await db.query(
            "SELECT * FROM wallet_transactions WHERE tenant_id=$1 AND student_id=$2 AND type='PURCHASE' AND amount=-50000",
            [tenant.id, student.id],
          )
        ).rows[0];
        const input = {
          reason: "Pesanan dibatalkan",
          idempotency_key: randomUUID(),
        };
        const refunds = await Promise.all(
          [1, 2].map(() =>
            post(`wallet-transactions/${purchase.id}/refund`, input),
          ),
        );
        assert.equal(refunds[0].id, refunds[1].id);
        await post(
          `wallet-transactions/${purchase.id}/refund`,
          { ...input, idempotency_key: randomUUID() },
          409,
        );
        const wallet = await request(
          `wallets/${student.id}`,
          "GET",
          undefined,
          parentAuth.token,
        );
        assert.equal(wallet.balance, 80000);
        assert.equal(wallet.today_spending, 20000);
        assert.equal(
          (
            await db.query(
              "SELECT SUM(amount)::numeric AS amount FROM wallet_transactions WHERE tenant_id=$1 AND student_id=$2",
              [tenant.id, student.id],
            )
          ).rows[0].amount,
          wallet.balance,
        );
        await assert.rejects(
          db.query("UPDATE wallet_transactions SET amount=-1 WHERE id=$1", [
            purchase.id,
          ]),
          { code: "23514" },
        );
        await assert.rejects(
          db.query(
            "DELETE FROM wallet_purchase_items WHERE transaction_id=$1",
            [purchase.id],
          ),
          { code: "23514" },
        );
      },
    );
    await t.test(
      "cross-tenant foreign keys, product merchant binding and rejected topups",
      async () => {
        await post(
          "products",
          { merchant_id: merchant.id, name: "Cross", price: 1 },
          400,
          other,
        );
        await assert.rejects(
          db.query(
            "INSERT INTO wallet_accounts(tenant_id,student_id) VALUES($1,$2)",
            [otherTenant.id, student.id],
          ),
          { code: "23503" },
        );
        const merchant2 = await post("wallet-merchants", {
          name: "Laundry",
          category: "LAUNDRY",
        });
        await post(
          "pos/checkout",
          {
            student_id: student.id,
            merchant_id: merchant2.id,
            items: [{ product_id: product.id, quantity: 1 }],
            idempotency_key: randomUUID(),
          },
          400,
        );
        const uploaded = await proof();
        const rejected = await post(
          "wallet-topups",
          { student_id: student.id, amount: 50000, proof_id: uploaded.id },
          201,
          parentAuth.token,
        );
        await post(`wallet-topups/${rejected.id}/verify`, {
          decision: "REJECTED",
          notes: "Bukti tidak sesuai",
        });
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          80000,
        );
        assert.equal(
          (
            await request(
              "wallet-topups?status=REJECTED",
              "GET",
              undefined,
              financeAuth.token,
            )
          ).total,
          1,
        );
        const adjustment = {
          amount: 10000,
          reason: "Koreksi saldo",
          idempotency_key: randomUUID(),
        };
        const a = await post(`wallets/${student.id}/adjustments`, adjustment);
        const b = await post(`wallets/${student.id}/adjustments`, adjustment);
        assert.equal(a.id, b.id);
        assert.equal(
          (
            await request(
              `wallets/${student.id}`,
              "GET",
              undefined,
              parentAuth.token,
            )
          ).balance,
          90000,
        );
      },
    );
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = previousUrl;
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
    // mkdtemp returned this exact task-owned directory; never a user-supplied path.
    await rm(storage, { recursive: true, force: true });
  }
});
