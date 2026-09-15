import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { Database } from "../../database/database.service";
import { allow } from "../auth/permissions";

const uuid = z.string().uuid();
const short = z.string().trim().min(1).max(300);
const optional = z.string().trim().max(500).default("");
const date = z.string().date();
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.max(
    0,
    Math.floor(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86400000,
    ),
  );

@Injectable()
export class LibraryService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async overview(actor: Actor) {
    allow(actor, "library.read");
    const tenant = actor.tenant_id;
    const [books, copies, borrowings, penalties] = await Promise.all([
      this.db.query(
        `SELECT b.*,count(c.id)::int AS copies,count(c.id) FILTER(WHERE c.status='AVAILABLE')::int AS available
         FROM books b LEFT JOIN book_copies c ON c.tenant_id=b.tenant_id AND c.book_id=b.id
         WHERE b.tenant_id=$1 GROUP BY b.id ORDER BY b.title`,
        [tenant],
      ),
      this.db.query(
        `SELECT c.*,b.title,b.author FROM book_copies c JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
         WHERE c.tenant_id=$1 ORDER BY b.title,c.barcode`,
        [tenant],
      ),
      this.db.query(
        `SELECT r.*,b.title,c.barcode,s.name AS student_name,s.nis,
         (r.returned_at IS NULL AND r.due_date<CURRENT_DATE) AS overdue
         FROM borrowings r JOIN book_copies c ON c.tenant_id=r.tenant_id AND c.id=r.copy_id
         JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
         JOIN students s ON s.tenant_id=r.tenant_id AND s.id=r.student_id
         WHERE r.tenant_id=$1 ORDER BY r.returned_at NULLS FIRST,r.due_date`,
        [tenant],
      ),
      this.db.query(
        `SELECT p.*,b.title,s.name AS student_name,s.nis FROM library_penalties p
         JOIN borrowings r ON r.tenant_id=p.tenant_id AND r.id=p.borrowing_id
         JOIN book_copies c ON c.tenant_id=r.tenant_id AND c.id=r.copy_id
         JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
         JOIN students s ON s.tenant_id=p.tenant_id AND s.id=p.student_id
         WHERE p.tenant_id=$1 ORDER BY p.created_at DESC`,
        [tenant],
      ),
    ]);
    return {
      books: books.rows,
      copies: copies.rows,
      borrowings: borrowings.rows,
      penalties: penalties.rows,
    };
  }
  async portal(actor: Actor) {
    allow(actor, "library.own");
    const data = (
      await this.db.query(
        `SELECT r.*,b.title,c.barcode,s.name AS student_name,
         (SELECT COALESCE(json_agg(p ORDER BY p.created_at DESC),'[]') FROM library_penalties p WHERE p.tenant_id=r.tenant_id AND p.borrowing_id=r.id) AS penalties
         FROM borrowings r JOIN book_copies c ON c.tenant_id=r.tenant_id AND c.id=r.copy_id
         JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id JOIN students s ON s.tenant_id=r.tenant_id AND s.id=r.student_id
         WHERE r.tenant_id=$1 AND (s.user_id=$2 OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$2))
         ORDER BY r.created_at DESC`,
        [actor.tenant_id, actor.id],
      )
    ).rows;
    return { data, total: data.length };
  }
  async book(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        isbn: z.union([z.literal(""), z.string().trim().max(32)]).default(""),
        title: short,
        author: short,
        publisher: optional,
        publication_year: z
          .number()
          .int()
          .min(1000)
          .max(3000)
          .nullable()
          .default(null),
        category: optional,
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        `INSERT INTO books(tenant_id,isbn,title,author,publisher,publication_year,category)
         VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7) RETURNING *`,
        [
          actor.tenant_id,
          x.isbn,
          x.title,
          x.author,
          x.publisher,
          x.publication_year,
          x.category,
        ],
      )
    ).rows[0];
  }
  async copy(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z.object({ book_id: uuid, barcode: short }).strict().parse(body);
    return (
      await this.db.query(
        "INSERT INTO book_copies(tenant_id,book_id,barcode) VALUES($1,$2,$3) RETURNING *",
        [actor.tenant_id, x.book_id, x.barcode],
      )
    ).rows[0];
  }
  async borrow(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({ copy_id: uuid, student_id: uuid, due_date: date })
      .strict()
      .parse(body);
    if (x.due_date < today())
      throw new BadRequestException("Jatuh tempo tidak boleh di masa lalu");
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const copy = (
        await sql.query(
          "SELECT * FROM book_copies WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, x.copy_id],
        )
      ).rows[0];
      if (!copy || copy.status !== "AVAILABLE")
        throw new ConflictException("Eksemplar tidak tersedia");
      const student = (
        await sql.query(
          "SELECT status FROM students WHERE tenant_id=$1 AND id=$2",
          [actor.tenant_id, x.student_id],
        )
      ).rows[0];
      if (!student || student.status !== "ACTIVE")
        throw new BadRequestException("Siswa tidak aktif");
      const active = Number(
        (
          await sql.query(
            "SELECT count(*) FROM borrowings WHERE tenant_id=$1 AND student_id=$2 AND returned_at IS NULL",
            [actor.tenant_id, x.student_id],
          )
        ).rows[0].count,
      );
      if (active >= 5)
        throw new ConflictException(
          "Siswa sudah mencapai batas lima pinjaman aktif",
        );
      const borrowing = (
        await sql.query(
          "INSERT INTO borrowings(tenant_id,copy_id,student_id,due_date,borrowed_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [actor.tenant_id, x.copy_id, x.student_id, x.due_date, actor.id],
        )
      ).rows[0];
      await sql.query(
        "UPDATE book_copies SET status='BORROWED' WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, x.copy_id],
      );
      return borrowing;
    });
  }
  async returnBook(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.write");
    uuid.parse(id);
    const x = z
      .object({
        condition: z.enum(["GOOD", "DAMAGED", "LOST"]),
        damage_fee: z.number().int().min(0).default(0),
        lost_fee: z.number().int().min(0).default(0),
      })
      .strict()
      .parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const borrowing = (
        await sql.query(
          "SELECT * FROM borrowings WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!borrowing) throw new NotFoundException("Peminjaman tidak ditemukan");
      if (borrowing.returned_at) return borrowing;
      const returned = today();
      const overdueAmount =
        daysBetween(borrowing.due_date, returned) *
        Number(process.env.LIBRARY_DAILY_PENALTY || 1000);
      const penalty = async (type: string, amount: number, notes: string) => {
        if (amount > 0)
          await sql.query(
            "INSERT INTO library_penalties(tenant_id,borrowing_id,student_id,type,amount,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,borrowing_id,type) DO NOTHING",
            [actor.tenant_id, id, borrowing.student_id, type, amount, notes],
          );
      };
      await penalty(
        "OVERDUE",
        overdueAmount,
        `${daysBetween(borrowing.due_date, returned)} hari terlambat`,
      );
      await penalty(
        "DAMAGE",
        x.condition === "DAMAGED" ? x.damage_fee : 0,
        "Kerusakan eksemplar",
      );
      await penalty(
        "LOST",
        x.condition === "LOST" ? x.lost_fee : 0,
        "Eksemplar hilang",
      );
      const status = x.condition === "LOST" ? "LOST" : "RETURNED";
      const result = (
        await sql.query(
          "UPDATE borrowings SET returned_at=now(),returned_by=$3,status=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [actor.tenant_id, id, actor.id, status],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO library_returns(tenant_id,borrowing_id,condition,returned_by) VALUES($1,$2,$3,$4)",
        [actor.tenant_id, id, x.condition, actor.id],
      );
      await sql.query(
        "UPDATE book_copies SET condition=$3,status=$4 WHERE tenant_id=$1 AND id=$2",
        [
          actor.tenant_id,
          borrowing.copy_id,
          x.condition,
          x.condition === "LOST"
            ? "LOST"
            : x.condition === "DAMAGED"
              ? "MAINTENANCE"
              : "AVAILABLE",
        ],
      );
      return result;
    });
  }
  async resolvePenalty(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.write");
    uuid.parse(id);
    const x = z
      .object({ method: z.enum(["WALLET", "WAIVE"]) })
      .strict()
      .parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const penalty = (
        await sql.query(
          "SELECT * FROM library_penalties WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!penalty) throw new NotFoundException("Denda tidak ditemukan");
      if (penalty.status !== "UNPAID") return penalty;
      if (x.method === "WAIVE")
        return (
          await sql.query(
            "UPDATE library_penalties SET status='WAIVED',resolved_by=$3,resolved_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
            [actor.tenant_id, id, actor.id],
          )
        ).rows[0];
      await sql.query(
        "INSERT INTO wallet_accounts(tenant_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [actor.tenant_id, penalty.student_id],
      );
      const account = (
        await sql.query(
          "SELECT * FROM wallet_accounts WHERE tenant_id=$1 AND student_id=$2 FOR UPDATE",
          [actor.tenant_id, penalty.student_id],
        )
      ).rows[0];
      if (Number(account.balance) < Number(penalty.amount))
        throw new ConflictException("Saldo siswa tidak mencukupi");
      const merchant = (
        await sql.query(
          "INSERT INTO wallet_merchants(tenant_id,name,category) VALUES($1,'Perpustakaan','Library') ON CONFLICT(tenant_id,name) DO UPDATE SET active=true RETURNING *",
          [actor.tenant_id],
        )
      ).rows[0];
      const balance = Number(account.balance) - Number(penalty.amount);
      const requestHash = createHash("sha256")
        .update(`${penalty.id}:${penalty.amount}`)
        .digest("hex");
      const transaction = (
        await sql.query(
          `INSERT INTO wallet_transactions(tenant_id,account_id,student_id,type,amount,balance_after,merchant_id,merchant_name,category,description,created_by,idempotency_key,request_hash)
           VALUES($1,$2,$3,'PURCHASE',$4,$5,$6,$7,'Library',$8,$9,$10,$11) RETURNING *`,
          [
            actor.tenant_id,
            account.id,
            penalty.student_id,
            -Number(penalty.amount),
            balance,
            merchant.id,
            merchant.name,
            `Denda perpustakaan ${penalty.type}`,
            actor.id,
            `library-penalty:${penalty.id}`,
            requestHash,
          ],
        )
      ).rows[0];
      await sql.query(
        "UPDATE wallet_accounts SET balance=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, account.id, balance],
      );
      return (
        await sql.query(
          "UPDATE library_penalties SET status='PAID',wallet_transaction_id=$3,resolved_by=$4,resolved_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [actor.tenant_id, id, transaction.id, actor.id],
        )
      ).rows[0];
    });
  }
}
