import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Response } from "express";
import { z } from "zod";
import type { Actor } from "../../../packages/shared-types/src";
import { AuthGuard, AuthRequest, isAdmin } from "./auth";
import { Database, Sql } from "./database";
import { notifyStudent } from "./notifications";

// Integer IDR, bounded below PostgreSQL numeric(12,0) and JavaScript safe integer.
const money = z.number().int().positive().max(1_000_000_000);
const limitMoney = z.number().int().min(0).max(1_000_000_000);
const uuid = z.string().uuid();
const label = z.string().trim().min(1).max(200);
const note = z.string().trim().max(1000).default("");
const key = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9:_-]+$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal tidak valid");
const verification = z
  .object({ decision: z.enum(["APPROVED", "REJECTED"]), notes: note })
  .strict();
const proofInput = z
  .object({
    student_id: uuid,
    file_name: z.string().trim().min(1).max(180),
    mime_type: z.enum(["image/png", "image/jpeg", "application/pdf"]),
    data_base64: z.string().min(4).max(2_796_204),
  })
  .strict();
const feeInput = z
  .object({
    name: label,
    description: note,
    amount: money,
    active: z.boolean().default(true),
  })
  .strict();
const merchantInput = z
  .object({
    name: label,
    category: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
  })
  .strict();
const productInput = z
  .object({
    merchant_id: uuid,
    name: label,
    price: money,
    stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
    active: z.boolean().default(true),
  })
  .strict();
const paymentInput = z
  .object({
    amount: money,
    proof_id: uuid,
    reference: z.string().trim().max(200).default(""),
  })
  .strict();
const limitsInput = z
  .object({
    daily_limit: limitMoney.nullable(),
    monthly_limit: limitMoney.nullable(),
    category_limits: z
      .record(z.string().trim().min(1).max(80), limitMoney)
      .refine((v) => Object.keys(v).length <= 100)
      .default({}),
    blocked_merchant_ids: z.array(uuid).max(100).default([]),
  })
  .strict();
const PAGE_LIMIT = 100;

export const canManageFinance = (actor: Actor) =>
  isAdmin(actor) || actor.roles.includes("FINANCE");
function manage(actor: Actor) {
  if (!canManageFinance(actor))
    throw new ForbiddenException("Akses petugas keuangan diperlukan");
}
function financeReader(actor: Actor) {
  if (
    !canManageFinance(actor) &&
    !actor.roles.some((r) => r === "PARENT" || r === "STUDENT")
  )
    throw new ForbiddenException("Hak akses keuangan tidak mencukupi");
}
function ownScope(actor: Actor, studentAlias = "s") {
  return canManageFinance(actor)
    ? "TRUE"
    : `(${studentAlias}.user_id=$2 OR EXISTS (SELECT 1 FROM student_guardians sg JOIN parents p ON p.tenant_id=sg.tenant_id AND p.id=sg.parent_id WHERE sg.tenant_id=${studentAlias}.tenant_id AND sg.student_id=${studentAlias}.id AND p.user_id=$2))`;
}
function scopeValues(actor: Actor): unknown[] {
  return canManageFinance(actor)
    ? [actor.tenant_id]
    : [actor.tenant_id, actor.id];
}
async function studentAccess(
  sql: Sql,
  actor: Actor,
  id: string,
  parentOnly = false,
) {
  financeReader(actor);
  uuid.parse(id);
  const row = (
    await sql.query(
      `SELECT s.* FROM students s WHERE s.tenant_id=$1 AND s.id=$2 AND ($3::boolean OR ${parentOnly ? "FALSE" : "s.user_id=$4"} OR EXISTS (SELECT 1 FROM student_guardians sg JOIN parents p ON p.tenant_id=sg.tenant_id AND p.id=sg.parent_id WHERE sg.tenant_id=s.tenant_id AND sg.student_id=s.id AND p.user_id=$4))`,
      [actor.tenant_id, id, canManageFinance(actor), actor.id],
    )
  ).rows[0];
  if (!row)
    throw new NotFoundException(
      "Siswa tidak ditemukan atau tidak terhubung dengan akun",
    );
  if (parentOnly && !canManageFinance(actor) && !actor.roles.includes("PARENT"))
    throw new ForbiddenException("Batas belanja hanya dapat diubah wali siswa");
  return row;
}
function page(rows: any[], currentPage = 1, limit = PAGE_LIMIT) {
  return {
    data: rows,
    total: rows.length ? Number(rows[0]._total ?? rows.length) : 0,
    page: currentPage,
    limit,
  };
}
function paging(query: Record<string, unknown>) {
  const value = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .parse(query);
  return { ...value, offset: (value.page - 1) * value.limit };
}
function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function storageFile(storageKey: string) {
  const root = resolve(process.env.STORAGE_PATH || ".local/uploads");
  const path = resolve(root, storageKey);
  if (!path.startsWith(root + sep))
    throw new BadRequestException("Lokasi berkas tidak valid");
  return path;
}
async function useProof(
  sql: Sql,
  actor: Actor,
  proofId: string,
  studentId: string,
) {
  const proof = (
    await sql.query(
      "SELECT id FROM payment_proofs WHERE tenant_id=$1 AND id=$2 AND student_id=$3",
      [actor.tenant_id, proofId, studentId],
    )
  ).rows[0];
  if (!proof)
    throw new BadRequestException("Bukti pembayaran tidak sesuai siswa");
  const used = (
    await sql.query(
      "SELECT id FROM payments WHERE tenant_id=$1 AND proof_id=$2 UNION ALL SELECT id FROM wallet_topups WHERE tenant_id=$1 AND proof_id=$2",
      [actor.tenant_id, proofId],
    )
  ).rows;
  if (used.length)
    throw new ConflictException("Bukti ini sudah digunakan; unggah bukti baru");
}
async function account(sql: Sql, tenantId: string, studentId: string) {
  await sql.query(
    "INSERT INTO wallet_accounts(tenant_id,student_id) VALUES($1,$2) ON CONFLICT(tenant_id,student_id) DO NOTHING",
    [tenantId, studentId],
  );
  return (
    await sql.query(
      "SELECT * FROM wallet_accounts WHERE tenant_id=$1 AND student_id=$2 FOR UPDATE",
      [tenantId, studentId],
    )
  ).rows[0];
}
async function repeated(
  sql: Sql,
  actor: Actor,
  idempotencyKey: string,
  hash: string,
) {
  const old = (
    await sql.query(
      "SELECT * FROM wallet_transactions WHERE tenant_id=$1 AND idempotency_key=$2",
      [actor.tenant_id, idempotencyKey],
    )
  ).rows[0];
  if (old && (old.request_hash !== hash || old.created_by !== actor.id))
    throw new ConflictException(
      "Kunci idempotensi sudah dipakai untuk permintaan berbeda",
    );
  return old;
}
type LedgerInput = {
  studentId: string;
  type: "TOPUP" | "PURCHASE" | "REFUND" | "ADJUSTMENT";
  amount: number;
  description: string;
  idempotencyKey: string;
  hash: string;
  merchant?: any;
  originalId?: string;
};
async function ledger(sql: Sql, actor: Actor, input: LedgerInput) {
  const wallet = await account(sql, actor.tenant_id, input.studentId);
  const balance = Number(wallet.balance) + input.amount;
  if (balance < 0) throw new ConflictException("Saldo tidak mencukupi");
  if (balance > 999_999_999_999)
    throw new BadRequestException("Saldo melebihi batas akun");
  const transaction = (
    await sql.query(
      `INSERT INTO wallet_transactions(tenant_id,account_id,student_id,type,amount,balance_after,merchant_id,merchant_name,category,description,created_by,idempotency_key,request_hash,original_transaction_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        actor.tenant_id,
        wallet.id,
        input.studentId,
        input.type,
        input.amount,
        balance,
        input.merchant?.id || null,
        input.merchant?.name || null,
        input.merchant?.category || null,
        input.description,
        actor.id,
        input.idempotencyKey,
        input.hash,
        input.originalId || null,
      ],
    )
  ).rows[0];
  await sql.query(
    "UPDATE wallet_accounts SET balance=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
    [actor.tenant_id, wallet.id, balance],
  );
  return transaction;
}
async function limits(sql: Sql, tenantId: string, studentId: string) {
  const row = (
    await sql.query(
      "SELECT daily_limit,monthly_limit,category_limits FROM wallet_limits WHERE tenant_id=$1 AND student_id=$2",
      [tenantId, studentId],
    )
  ).rows[0] || { daily_limit: null, monthly_limit: null, category_limits: {} };
  row.blocked_merchant_ids = (
    await sql.query(
      "SELECT merchant_id FROM wallet_merchant_restrictions WHERE tenant_id=$1 AND student_id=$2 ORDER BY merchant_id",
      [tenantId, studentId],
    )
  ).rows.map((r) => r.merchant_id);
  return row;
}
// Calendar periods use the school's V1 timezone, Asia/Jakarta. Refunded purchases
// no longer count toward spending; refunding a prior day never creates extra allowance today.
async function spending(
  sql: Sql,
  tenantId: string,
  studentId: string,
  category?: string,
) {
  return (
    await sql.query(
      `SELECT
    COALESCE(SUM(-t.amount) FILTER (WHERE (t.created_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date),0)::numeric AS today_spending,
    COALESCE(SUM(-t.amount),0)::numeric AS month_spending,
    COALESCE(SUM(-t.amount) FILTER (WHERE t.category=$3),0)::numeric AS category_spending
    FROM wallet_transactions t WHERE t.tenant_id=$1 AND t.student_id=$2 AND t.type='PURCHASE'
    AND t.created_at >= (date_trunc('month',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')
    AND NOT EXISTS (SELECT 1 FROM wallet_transactions r WHERE r.tenant_id=t.tenant_id AND r.original_transaction_id=t.id)`,
      [tenantId, studentId, category || null],
    )
  ).rows[0];
}

@Controller("api/v1")
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get("finance/students") async students(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    financeReader(req.actor);
    const values = scopeValues(req.actor);
    const p = paging(query);
    const search =
      z.string().trim().max(100).optional().parse(query.search) || "";
    values.push(`%${search}%`, p.limit, p.offset);
    const n = values.length;
    return page(
      (
        await this.db.query(
          `SELECT s.id,s.name,s.nis,s.status,COALESCE(w.balance,0)::numeric AS balance,count(*) OVER() AS _total FROM students s LEFT JOIN wallet_accounts w ON w.tenant_id=s.tenant_id AND w.student_id=s.id WHERE s.tenant_id=$1 AND ${ownScope(req.actor)} AND (s.name ILIKE $${n - 2} OR s.nis ILIKE $${n - 2}) ORDER BY s.name,s.id LIMIT $${n - 1} OFFSET $${n}`,
          values,
        )
      ).rows,
      p.page,
      p.limit,
    );
  }

  @Get("fee-types") async feeTypes(@Req() req: AuthRequest) {
    financeReader(req.actor);
    return page(
      (
        await this.db.query(
          "SELECT * FROM fee_types WHERE tenant_id=$1 ORDER BY name",
          [req.actor.tenant_id],
        )
      ).rows,
    );
  }
  @Post("fee-types") async addFee(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = feeInput.parse(body);
    return (
      await this.db.query(
        "INSERT INTO fee_types(tenant_id,name,description,amount,active) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.actor.tenant_id, x.name, x.description, x.amount, x.active],
      )
    ).rows[0];
  }

  @Get("invoices") async invoices(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    financeReader(req.actor);
    const p = paging(query),
      values = scopeValues(req.actor);
    let filters = "";
    if (query.student_id) {
      values.push(uuid.parse(query.student_id));
      filters += ` AND i.student_id=$${values.length}`;
    }
    if (query.status) {
      values.push(z.enum(["UNPAID", "PARTIAL", "PAID"]).parse(query.status));
      filters += ` AND i.status=$${values.length}`;
    }
    values.push(p.limit, p.offset);
    return page(
      (
        await this.db.query(
          `SELECT i.*,s.name AS student_name,s.nis,count(*) OVER() AS _total FROM invoices i JOIN students s ON s.tenant_id=i.tenant_id AND s.id=i.student_id WHERE i.tenant_id=$1 AND ${ownScope(req.actor)} ${filters} ORDER BY i.due_date,i.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows,
      p.page,
      p.limit,
    );
  }
  @Post("invoices") async addInvoice(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = z
      .object({
        student_id: uuid,
        title: label,
        due_date: date,
        items: z
          .array(
            z
              .object({
                fee_type_id: uuid.optional(),
                description: label,
                quantity: z.number().int().min(1).max(10000).default(1),
                unit_amount: money,
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(body);
    const total = x.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_amount,
      0,
    );
    money.parse(total);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      await studentAccess(sql, req.actor, x.student_id);
      for (const item of x.items)
        if (
          item.fee_type_id &&
          !(
            await sql.query(
              "SELECT id FROM fee_types WHERE tenant_id=$1 AND id=$2 AND active",
              [req.actor.tenant_id, item.fee_type_id],
            )
          ).rowCount
        )
          throw new BadRequestException("Jenis biaya tidak tersedia");
      const invoice = (
        await sql.query(
          "INSERT INTO invoices(tenant_id,student_id,title,due_date,total_amount,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            req.actor.tenant_id,
            x.student_id,
            x.title,
            x.due_date,
            total,
            req.actor.id,
          ],
        )
      ).rows[0];
      invoice.items = [];
      for (const item of x.items)
        invoice.items.push(
          (
            await sql.query(
              "INSERT INTO invoice_items(tenant_id,invoice_id,fee_type_id,description,quantity,unit_amount,amount) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                req.actor.tenant_id,
                invoice.id,
                item.fee_type_id || null,
                item.description,
                item.quantity,
                item.unit_amount,
                item.quantity * item.unit_amount,
              ],
            )
          ).rows[0],
        );
      await notifyStudent(
        sql,
        req.actor.tenant_id,
        x.student_id,
        "Tagihan baru",
        `${x.title}: Rp${total.toLocaleString("id-ID")}, jatuh tempo ${x.due_date}`,
        {
          type: "INVOICE_CREATED",
          invoice_id: invoice.id,
          student_id: x.student_id,
        },
        `invoice:${invoice.id}:created`,
      );
      return invoice;
    });
  }
  @Get("invoices/:id") async invoice(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    uuid.parse(id);
    const invoice = (
      await this.db.query(
        "SELECT i.*,s.name AS student_name,s.nis FROM invoices i JOIN students s ON s.tenant_id=i.tenant_id AND s.id=i.student_id WHERE i.tenant_id=$1 AND i.id=$2",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!invoice) throw new NotFoundException("Tagihan tidak ditemukan");
    await studentAccess(this.db, req.actor, invoice.student_id);
    invoice.items = (
      await this.db.query(
        "SELECT * FROM invoice_items WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY id",
        [req.actor.tenant_id, id],
      )
    ).rows;
    invoice.payments = (
      await this.db.query(
        "SELECT p.*,v.notes,v.verified_by,v.created_at AS verified_at FROM payments p LEFT JOIN payment_verifications v ON v.tenant_id=p.tenant_id AND v.payment_id=p.id WHERE p.tenant_id=$1 AND p.invoice_id=$2 ORDER BY p.created_at DESC",
        [req.actor.tenant_id, id],
      )
    ).rows;
    return invoice;
  }

  @Post("payment-proofs") async uploadProof(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const x = proofInput.parse(body);
    await studentAccess(this.db, req.actor, x.student_id);
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(x.data_base64) ||
      x.data_base64.length % 4 !== 0
    )
      throw new BadRequestException("Berkas base64 tidak valid");
    const bytes = Buffer.from(x.data_base64, "base64");
    if (
      !bytes.length ||
      bytes.length > 2 * 1024 * 1024 ||
      bytes.toString("base64") !== x.data_base64
    )
      throw new BadRequestException("Ukuran bukti maksimal 2 MB");
    const valid =
      x.mime_type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : x.mime_type === "image/jpeg"
          ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          : bytes.subarray(0, 5).toString() === "%PDF-";
    if (!valid)
      throw new BadRequestException(
        "Isi berkas tidak cocok dengan jenis PNG, JPEG, atau PDF",
      );
    const id = randomUUID(),
      extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "application/pdf": "pdf",
      }[x.mime_type];
    const storageKey = `${req.actor.tenant_id}/${id}.${extension}`,
      path = storageFile(storageKey);
    await mkdir(dirname(path), { recursive: true });
    let written = false;
    try {
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      written = true;
      return await this.db.transaction(req.actor.tenant_id, async (sql) => {
        const cleanName = x.file_name.replace(/[\r\n\\/]/g, "_");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const proof = (
          await sql.query(
            "INSERT INTO payment_proofs(id,tenant_id,student_id,uploaded_by,file_name,mime_type,size_bytes,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,student_id,file_name,mime_type,size_bytes,created_at",
            [
              id,
              req.actor.tenant_id,
              x.student_id,
              req.actor.id,
              cleanName,
              x.mime_type,
              bytes.length,
              storageKey,
              sha256,
            ],
          )
        ).rows[0];
        await sql.query(
          "INSERT INTO managed_files(id,tenant_id,category,file_name,mime_type,size_bytes,storage_key,sha256,description,uploaded_by,created_at) VALUES($1,$2,'PAYMENT_PROOF',$3,$4,$5,$6,$7,'Bukti pembayaran',$8,$9)",
          [
            id,
            req.actor.tenant_id,
            cleanName,
            x.mime_type,
            bytes.length,
            storageKey,
            sha256,
            req.actor.id,
            proof.created_at,
          ],
        );
        await sql.query(
          "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'STUDENT',$3)",
          [req.actor.tenant_id, id, x.student_id],
        );
        return proof;
      });
    } catch (error) {
      if (written) await unlink(path).catch(() => undefined);
      throw error;
    }
  }
  @Get("payment-proofs/:id/file") async downloadProof(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    uuid.parse(id);
    const proof = (
      await this.db.query(
        "SELECT * FROM payment_proofs WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!proof) throw new NotFoundException("Bukti pembayaran tidak ditemukan");
    await studentAccess(this.db, req.actor, proof.student_id);
    let bytes: Buffer;
    try {
      bytes = await readFile(storageFile(proof.storage_key));
    } catch {
      throw new NotFoundException("Berkas bukti tidak tersedia");
    }
    res.setHeader("Content-Type", proof.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="proof-${id}.${proof.mime_type === "application/pdf" ? "pdf" : proof.mime_type === "image/png" ? "png" : "jpg"}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.send(bytes);
  }
  @Post("invoices/:id/payments") async submitPayment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    uuid.parse(id);
    const x = paymentInput.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const invoice = (
        await sql.query(
          "SELECT * FROM invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!invoice) throw new NotFoundException("Tagihan tidak ditemukan");
      await studentAccess(sql, req.actor, invoice.student_id);
      const pending = Number(
        (
          await sql.query(
            "SELECT COALESCE(SUM(amount),0)::numeric AS amount FROM payments WHERE tenant_id=$1 AND invoice_id=$2 AND status='PENDING'",
            [req.actor.tenant_id, id],
          )
        ).rows[0].amount,
      );
      if (
        x.amount >
        Number(invoice.total_amount) - Number(invoice.paid_amount) - pending
      )
        throw new ConflictException(
          "Pembayaran melebihi sisa tagihan setelah pembayaran menunggu verifikasi",
        );
      await useProof(sql, req.actor, x.proof_id, invoice.student_id);
      return (
        await sql.query(
          "INSERT INTO payments(tenant_id,invoice_id,student_id,amount,proof_id,reference,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            req.actor.tenant_id,
            id,
            invoice.student_id,
            x.amount,
            x.proof_id,
            x.reference,
            req.actor.id,
          ],
        )
      ).rows[0];
    });
  }
  @Get("payments") async payments(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.paymentList(req.actor, query, "payments");
  }
  private async paymentList(
    actor: Actor,
    query: Record<string, unknown>,
    table: "payments" | "wallet_topups",
  ) {
    financeReader(actor);
    const p = paging(query),
      values = scopeValues(actor);
    let filter = "";
    if (query.status) {
      values.push(
        z.enum(["PENDING", "APPROVED", "REJECTED"]).parse(query.status),
      );
      filter += ` AND p.status=$${values.length}`;
    }
    if (query.student_id) {
      values.push(uuid.parse(query.student_id));
      filter += ` AND p.student_id=$${values.length}`;
    }
    values.push(p.limit, p.offset);
    return page(
      (
        await this.db.query(
          `SELECT p.*,s.name AS student_name,s.nis${table === "payments" ? ",i.title AS invoice_title" : ""},count(*) OVER() AS _total FROM ${table} p JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id ${table === "payments" ? "JOIN invoices i ON i.tenant_id=p.tenant_id AND i.id=p.invoice_id" : ""} WHERE p.tenant_id=$1 AND ${ownScope(actor)} ${filter} ORDER BY p.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows,
      p.page,
      p.limit,
    );
  }
  @Post("payments/:id/verify") async verifyPayment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    uuid.parse(id);
    const x = verification.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const payment = (
        await sql.query(
          "SELECT * FROM payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!payment) throw new NotFoundException("Pembayaran tidak ditemukan");
      if (payment.status !== "PENDING") {
        if (payment.status === x.decision) return payment;
        throw new ConflictException("Pembayaran sudah diverifikasi");
      }
      if (x.decision === "APPROVED") {
        const invoice = (
          await sql.query(
            "SELECT * FROM invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
            [req.actor.tenant_id, payment.invoice_id],
          )
        ).rows[0];
        const paid = Number(invoice.paid_amount) + Number(payment.amount);
        if (paid > Number(invoice.total_amount))
          throw new ConflictException("Pembayaran melebihi tagihan");
        await sql.query(
          "UPDATE invoices SET paid_amount=$3,status=CASE WHEN total_amount=$3 THEN 'PAID' ELSE 'PARTIAL' END WHERE tenant_id=$1 AND id=$2",
          [req.actor.tenant_id, invoice.id, paid],
        );
      }
      await sql.query(
        "INSERT INTO payment_verifications(tenant_id,payment_id,verified_by,decision,notes) VALUES($1,$2,$3,$4,$5)",
        [req.actor.tenant_id, id, req.actor.id, x.decision, x.notes],
      );
      const updated = (
        await sql.query(
          "UPDATE payments SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [req.actor.tenant_id, id, x.decision],
        )
      ).rows[0];
      await notifyStudent(
        sql,
        req.actor.tenant_id,
        payment.student_id,
        x.decision === "APPROVED"
          ? "Pembayaran terverifikasi"
          : "Pembayaran ditolak",
        `Pembayaran Rp${Number(payment.amount).toLocaleString("id-ID")}. ${x.notes}`,
        {
          type: "PAYMENT_VERIFIED",
          payment_id: id,
          invoice_id: payment.invoice_id,
          student_id: payment.student_id,
        },
        `payment:${id}:verified`,
      );
      return updated;
    });
  }

  @Get("wallets") async wallets(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    financeReader(req.actor);
    const p = paging(query),
      values = scopeValues(req.actor);
    let filter = "";
    if (query.student_id) {
      values.push(uuid.parse(query.student_id));
      filter = ` AND s.id=$${values.length}`;
    }
    values.push(p.limit, p.offset);
    return page(
      (
        await this.db.query(
          `SELECT w.id,s.id AS student_id,s.name AS student_name,s.nis,COALESCE(w.balance,0)::numeric AS balance,count(*) OVER() AS _total FROM students s LEFT JOIN wallet_accounts w ON w.tenant_id=s.tenant_id AND w.student_id=s.id WHERE s.tenant_id=$1 AND ${ownScope(req.actor)} ${filter} ORDER BY s.name,s.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows,
      p.page,
      p.limit,
    );
  }
  @Get("wallets/:studentId") async wallet(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
  ) {
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const student = await studentAccess(sql, req.actor, studentId);
      const wallet = (
        await sql.query(
          "SELECT id,balance,updated_at FROM wallet_accounts WHERE tenant_id=$1 AND student_id=$2",
          [req.actor.tenant_id, studentId],
        )
      ).rows[0] || { id: null, balance: 0 };
      const totals = await spending(sql, req.actor.tenant_id, studentId);
      const transactions = (
        await sql.query(
          "SELECT t.*,EXISTS(SELECT 1 FROM wallet_transactions r WHERE r.tenant_id=t.tenant_id AND r.original_transaction_id=t.id) AS refunded FROM wallet_transactions t WHERE t.tenant_id=$1 AND t.student_id=$2 ORDER BY t.created_at DESC,t.id DESC LIMIT 100",
          [req.actor.tenant_id, studentId],
        )
      ).rows;
      return {
        ...wallet,
        student_id: studentId,
        student_name: student.name,
        nis: student.nis,
        today_spending: totals.today_spending,
        month_spending: totals.month_spending,
        transactions,
        limits: await limits(sql, req.actor.tenant_id, studentId),
      };
    });
  }
  @Get("wallets/:studentId/transactions") async transactions(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Query() query: Record<string, unknown>,
  ) {
    await studentAccess(this.db, req.actor, studentId);
    const p = paging(query);
    return page(
      (
        await this.db.query(
          "SELECT t.*,count(*) OVER() AS _total FROM wallet_transactions t WHERE tenant_id=$1 AND student_id=$2 ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4",
          [req.actor.tenant_id, studentId, p.limit, p.offset],
        )
      ).rows,
      p.page,
      p.limit,
    );
  }
  @Put("wallets/:studentId/limits") async updateLimits(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    const x = limitsInput.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      await studentAccess(sql, req.actor, studentId, true);
      await sql.query(
        "INSERT INTO wallet_limits(tenant_id,student_id,daily_limit,monthly_limit,category_limits,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,student_id) DO UPDATE SET daily_limit=excluded.daily_limit,monthly_limit=excluded.monthly_limit,category_limits=excluded.category_limits,updated_by=excluded.updated_by,updated_at=now()",
        [
          req.actor.tenant_id,
          studentId,
          x.daily_limit,
          x.monthly_limit,
          JSON.stringify(x.category_limits),
          req.actor.id,
        ],
      );
      await sql.query(
        "DELETE FROM wallet_merchant_restrictions WHERE tenant_id=$1 AND student_id=$2",
        [req.actor.tenant_id, studentId],
      );
      for (const merchantId of new Set(x.blocked_merchant_ids))
        await sql.query(
          "INSERT INTO wallet_merchant_restrictions(tenant_id,student_id,merchant_id) VALUES($1,$2,$3)",
          [req.actor.tenant_id, studentId, merchantId],
        );
      return limits(sql, req.actor.tenant_id, studentId);
    });
  }
  @Get("wallet-topups") async topups(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.paymentList(req.actor, query, "wallet_topups");
  }
  @Post("wallet-topups") async addTopup(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const x = paymentInput.extend({ student_id: uuid }).parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      await studentAccess(sql, req.actor, x.student_id);
      await useProof(sql, req.actor, x.proof_id, x.student_id);
      return (
        await sql.query(
          "INSERT INTO wallet_topups(tenant_id,student_id,amount,proof_id,reference,submitted_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            req.actor.tenant_id,
            x.student_id,
            x.amount,
            x.proof_id,
            x.reference,
            req.actor.id,
          ],
        )
      ).rows[0];
    });
  }
  @Post("wallet-topups/:id/verify") async verifyTopup(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    uuid.parse(id);
    const x = verification.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const topup = (
        await sql.query(
          "SELECT * FROM wallet_topups WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!topup) throw new NotFoundException("Topup tidak ditemukan");
      if (topup.status !== "PENDING") {
        if (topup.status === x.decision) return topup;
        throw new ConflictException("Topup sudah diverifikasi");
      }
      const transaction =
        x.decision === "APPROVED"
          ? await ledger(sql, req.actor, {
              studentId: topup.student_id,
              type: "TOPUP",
              amount: Number(topup.amount),
              description: `Topup ${topup.reference}`.trim(),
              idempotencyKey: `topup:${id}`,
              hash: requestHash({ topup: id }),
            })
          : null;
      const updated = (
        await sql.query(
          "UPDATE wallet_topups SET status=$3,verified_by=$4,verified_at=now(),notes=$5,transaction_id=$6 WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [
            req.actor.tenant_id,
            id,
            x.decision,
            req.actor.id,
            x.notes,
            transaction?.id || null,
          ],
        )
      ).rows[0];
      await notifyStudent(
        sql,
        req.actor.tenant_id,
        topup.student_id,
        x.decision === "APPROVED" ? "Topup berhasil" : "Topup ditolak",
        `Topup Rp${Number(topup.amount).toLocaleString("id-ID")}. ${x.notes}`,
        { type: "WALLET_TOPUP", topup_id: id, student_id: topup.student_id },
        `topup:${id}:verified`,
      );
      return updated;
    });
  }
  @Post("wallets/:studentId/adjustments") async adjustment(
    @Req() req: AuthRequest,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = z
      .object({
        amount: z
          .number()
          .int()
          .min(-1_000_000_000)
          .max(1_000_000_000)
          .refine((v) => v !== 0),
        reason: z.string().trim().min(3).max(500),
        idempotency_key: key,
      })
      .strict()
      .parse(body);
    const hash = requestHash({
      operation: "ADJUSTMENT",
      studentId,
      amount: x.amount,
      reason: x.reason,
    });
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      await studentAccess(sql, req.actor, studentId);
      const old = await repeated(sql, req.actor, x.idempotency_key, hash);
      if (old) return old;
      return ledger(sql, req.actor, {
        studentId,
        type: "ADJUSTMENT",
        amount: x.amount,
        description: x.reason,
        idempotencyKey: x.idempotency_key,
        hash,
      });
    });
  }

  @Get("wallet-merchants") async merchants(@Req() req: AuthRequest) {
    financeReader(req.actor);
    return page(
      (
        await this.db.query(
          "SELECT * FROM wallet_merchants WHERE tenant_id=$1 ORDER BY name",
          [req.actor.tenant_id],
        )
      ).rows,
    );
  }
  @Post("wallet-merchants") async addMerchant(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = merchantInput.parse(body);
    return (
      await this.db.query(
        "INSERT INTO wallet_merchants(tenant_id,name,category,active) VALUES($1,$2,$3,$4) RETURNING *",
        [req.actor.tenant_id, x.name, x.category, x.active],
      )
    ).rows[0];
  }
  @Patch("wallet-merchants/:id") async editMerchant(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    uuid.parse(id);
    const x = merchantInput.partial().parse(body);
    return this.updateCatalog(req.actor, "wallet_merchants", id, x);
  }
  @Get("products") async products(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    financeReader(req.actor);
    const p = paging(query),
      merchantId = uuid.optional().parse(query.merchant_id);
    return page(
      (
        await this.db.query(
          "SELECT p.*,m.name AS merchant_name,m.category,m.active AS merchant_active,count(*) OVER() AS _total FROM products p JOIN wallet_merchants m ON m.tenant_id=p.tenant_id AND m.id=p.merchant_id WHERE p.tenant_id=$1 AND ($2::uuid IS NULL OR p.merchant_id=$2) ORDER BY p.name,p.id LIMIT $3 OFFSET $4",
          [req.actor.tenant_id, merchantId || null, p.limit, p.offset],
        )
      ).rows,
      p.page,
      p.limit,
    );
  }
  @Post("products") async addProduct(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = productInput.parse(body);
    return this.db.transaction(
      req.actor.tenant_id,
      async (sql) =>
        (
          await sql.query(
            "INSERT INTO products(tenant_id,merchant_id,name,price,stock,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              req.actor.tenant_id,
              x.merchant_id,
              x.name,
              x.price,
              x.stock,
              x.active,
            ],
          )
        ).rows[0],
    );
  }
  @Patch("products/:id") async editProduct(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    uuid.parse(id);
    // Keep merchant ownership immutable: receipt composite foreign keys preserve history.
    const x = productInput.omit({ merchant_id: true }).partial().parse(body);
    return this.updateCatalog(req.actor, "products", id, x);
  }
  private async updateCatalog(
    actor: Actor,
    table: "products" | "wallet_merchants",
    id: string,
    value: Record<string, unknown>,
  ) {
    const entries = Object.entries(value);
    if (!entries.length)
      throw new BadRequestException("Isi perubahan diperlukan");
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const row = (
        await sql.query(
          `UPDATE ${table} SET ${entries.map(([field], i) => `${field}=$${i + 3}`).join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id, ...entries.map(([, v]) => v)],
        )
      ).rows[0];
      if (!row) throw new NotFoundException("Data tidak ditemukan");
      return row;
    });
  }
  @Get("pos/students") async posStudents(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    manage(req.actor);
    return this.students(req, query);
  }
  @Post("pos/checkout") async checkout(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    const x = z
      .object({
        student_id: uuid,
        merchant_id: uuid,
        idempotency_key: key,
        items: z
          .array(
            z
              .object({
                product_id: uuid,
                quantity: z.number().int().min(1).max(1000),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(body);
    if (new Set(x.items.map((i) => i.product_id)).size !== x.items.length)
      throw new BadRequestException("Produk duplikat dalam keranjang");
    const hash = requestHash({
      operation: "PURCHASE",
      student_id: x.student_id,
      merchant_id: x.merchant_id,
      items: [...x.items].sort((a, b) =>
        a.product_id.localeCompare(b.product_id),
      ),
    });
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const student = await studentAccess(sql, req.actor, x.student_id);
      const old = await repeated(sql, req.actor, x.idempotency_key, hash);
      if (old)
        return {
          ...old,
          items: (
            await sql.query(
              "SELECT * FROM wallet_purchase_items WHERE tenant_id=$1 AND transaction_id=$2 ORDER BY id",
              [req.actor.tenant_id, old.id],
            )
          ).rows,
        };
      if (student.status !== "ACTIVE")
        throw new ConflictException("Siswa tidak aktif");
      const merchant = (
        await sql.query(
          "SELECT * FROM wallet_merchants WHERE tenant_id=$1 AND id=$2 AND active",
          [req.actor.tenant_id, x.merchant_id],
        )
      ).rows[0];
      if (!merchant) throw new BadRequestException("Merchant tidak tersedia");
      const selected: any[] = [];
      let total = 0;
      for (const item of x.items) {
        const product = (
          await sql.query(
            "SELECT * FROM products WHERE tenant_id=$1 AND id=$2 AND merchant_id=$3 AND active FOR UPDATE",
            [req.actor.tenant_id, item.product_id, x.merchant_id],
          )
        ).rows[0];
        if (!product)
          throw new BadRequestException(
            "Produk tidak tersedia pada merchant ini",
          );
        if (product.stock !== null && product.stock < item.quantity)
          throw new ConflictException(`Stok ${product.name} tidak mencukupi`);
        selected.push({ ...product, quantity: item.quantity });
        total += Number(product.price) * item.quantity;
      }
      money.parse(total);
      const policy = await limits(sql, req.actor.tenant_id, x.student_id);
      if (policy.blocked_merchant_ids.includes(x.merchant_id))
        throw new ForbiddenException("Merchant dibatasi oleh wali siswa");
      const spent = await spending(
        sql,
        req.actor.tenant_id,
        x.student_id,
        merchant.category,
      );
      if (
        policy.daily_limit !== null &&
        Number(spent.today_spending) + total > Number(policy.daily_limit)
      )
        throw new ConflictException("Batas belanja harian terlampaui");
      if (
        policy.monthly_limit !== null &&
        Number(spent.month_spending) + total > Number(policy.monthly_limit)
      )
        throw new ConflictException("Batas belanja bulanan terlampaui");
      const categoryLimit = policy.category_limits[merchant.category];
      if (
        categoryLimit !== undefined &&
        Number(spent.category_spending) + total > Number(categoryLimit)
      )
        throw new ConflictException("Batas kategori bulanan terlampaui");
      const transaction = await ledger(sql, req.actor, {
        studentId: x.student_id,
        type: "PURCHASE",
        amount: -total,
        description: `Belanja ${merchant.name}`,
        idempotencyKey: x.idempotency_key,
        hash,
        merchant,
      });
      transaction.items = [];
      for (const item of selected) {
        if (item.stock !== null)
          await sql.query(
            "UPDATE products SET stock=stock-$3 WHERE tenant_id=$1 AND id=$2",
            [req.actor.tenant_id, item.id, item.quantity],
          );
        transaction.items.push(
          (
            await sql.query(
              "INSERT INTO wallet_purchase_items(tenant_id,transaction_id,merchant_id,product_id,product_name,quantity,unit_amount) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [
                req.actor.tenant_id,
                transaction.id,
                merchant.id,
                item.id,
                item.name,
                item.quantity,
                item.price,
              ],
            )
          ).rows[0],
        );
      }
      await notifyStudent(
        sql,
        req.actor.tenant_id,
        x.student_id,
        "Transaksi dompet",
        `${merchant.name}: Rp${total.toLocaleString("id-ID")}. Saldo Rp${Number(transaction.balance_after).toLocaleString("id-ID")}.`,
        {
          type: "WALLET_PURCHASE",
          transaction_id: transaction.id,
          student_id: x.student_id,
        },
        `wallet:${transaction.id}:purchase`,
      );
      return transaction;
    });
  }
  @Post("wallet-transactions/:id/refund") async refund(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    manage(req.actor);
    uuid.parse(id);
    const x = z
      .object({
        reason: z.string().trim().min(3).max(500),
        idempotency_key: key,
      })
      .strict()
      .parse(body);
    const hash = requestHash({ operation: "REFUND", id, reason: x.reason });
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const old = await repeated(sql, req.actor, x.idempotency_key, hash);
      if (old) return old;
      const purchase = (
        await sql.query(
          "SELECT * FROM wallet_transactions WHERE tenant_id=$1 AND id=$2 AND type='PURCHASE'",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!purchase)
        throw new NotFoundException("Transaksi pembelian tidak ditemukan");
      if (
        (
          await sql.query(
            "SELECT id FROM wallet_transactions WHERE tenant_id=$1 AND original_transaction_id=$2",
            [req.actor.tenant_id, id],
          )
        ).rowCount
      )
        throw new ConflictException("Pembelian sudah dikembalikan");
      const transaction = await ledger(sql, req.actor, {
        studentId: purchase.student_id,
        type: "REFUND",
        amount: -Number(purchase.amount),
        description: x.reason,
        idempotencyKey: x.idempotency_key,
        hash,
        originalId: id,
        merchant: {
          id: purchase.merchant_id,
          name: purchase.merchant_name,
          category: purchase.category,
        },
      });
      await sql.query(
        "UPDATE products p SET stock=p.stock+i.quantity FROM wallet_purchase_items i WHERE i.tenant_id=$1 AND i.transaction_id=$2 AND p.tenant_id=i.tenant_id AND p.id=i.product_id AND p.stock IS NOT NULL",
        [req.actor.tenant_id, id],
      );
      await notifyStudent(
        sql,
        req.actor.tenant_id,
        purchase.student_id,
        "Pengembalian saldo",
        `Refund Rp${Number(transaction.amount).toLocaleString("id-ID")}: ${x.reason}`,
        {
          type: "WALLET_REFUND",
          transaction_id: transaction.id,
          student_id: purchase.student_id,
        },
        `wallet:${transaction.id}:refund`,
      );
      return transaction;
    });
  }
}
