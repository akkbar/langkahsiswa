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
    const [books, copies, borrowings, penalties, shelves] = await Promise.all([
      this.db.query(
        `SELECT b.*,count(c.id)::int AS copies,count(c.id) FILTER(WHERE c.status='AVAILABLE')::int AS available
         FROM books b LEFT JOIN book_copies c ON c.tenant_id=b.tenant_id AND c.book_id=b.id
         WHERE b.tenant_id=$1 GROUP BY b.id ORDER BY b.title`,
        [tenant],
      ),
      this.db.query(
        `SELECT c.*,b.title,b.author,b.isbn,s.code AS shelf_code,s.name AS shelf_name
         FROM book_copies c
         JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
         LEFT JOIN shelves s ON s.tenant_id=c.tenant_id AND s.id=c.shelf_id
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
      this.db.query(
        `SELECT * FROM shelves WHERE tenant_id=$1 ORDER BY code`,
        [tenant],
      ),
    ]);
    return {
      books: books.rows,
      copies: copies.rows,
      borrowings: borrowings.rows,
      penalties: penalties.rows,
      shelves: shelves.rows,
    };
  }

  async statistics(actor: Actor) {
    allow(actor, "library.read");
    const tenant = actor.tenant_id;
    const [borrowingPerMonth, returnPerMonth, mostBorrowedBooks, bookStatusDistribution] = await Promise.all([
      this.db.query(
        `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS count
         FROM borrowings WHERE tenant_id=$1
         GROUP BY to_char(created_at, 'YYYY-MM')
         ORDER BY month DESC LIMIT 12`,
        [tenant]
      ),
      this.db.query(
        `SELECT to_char(returned_at, 'YYYY-MM') AS month, count(*)::int AS count
         FROM borrowings WHERE tenant_id=$1 AND returned_at IS NOT NULL
         GROUP BY to_char(returned_at, 'YYYY-MM')
         ORDER BY month DESC LIMIT 12`,
        [tenant]
      ),
      this.db.query(
        `SELECT b.title, b.author, count(r.id)::int AS borrowings_count
         FROM borrowings r
         JOIN book_copies c ON c.tenant_id=r.tenant_id AND c.id=r.copy_id
         JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
         WHERE r.tenant_id=$1
         GROUP BY b.id, b.title, b.author
         ORDER BY borrowings_count DESC LIMIT 10`,
        [tenant]
      ),
      this.db.query(
        `SELECT status, count(*)::int AS count
         FROM book_copies WHERE tenant_id=$1
         GROUP BY status`,
        [tenant]
      ),
    ]);
    return {
      borrowing_per_month: borrowingPerMonth.rows,
      return_per_month: returnPerMonth.rows,
      most_borrowed_books: mostBorrowedBooks.rows,
      book_status_distribution: bookStatusDistribution.rows,
    };
  }

  async activities(actor: Actor) {
    allow(actor, "library.read");
    const tenant = actor.tenant_id;
    const res = await this.db.query(
      `SELECT r.id, 'BORROW' AS activity_type, s.name AS student_name, b.title AS book_title, c.barcode, r.created_at AS timestamp,
              CASE WHEN r.returned_at IS NOT NULL THEN 'RETURNED' WHEN r.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE 'BORROWED' END AS status
       FROM borrowings r
       JOIN book_copies c ON c.tenant_id=r.tenant_id AND c.id=r.copy_id
       JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
       JOIN students s ON s.tenant_id=r.tenant_id AND s.id=r.student_id
       WHERE r.tenant_id=$1
       ORDER BY r.created_at DESC LIMIT 50`,
      [tenant]
    );
    return { data: res.rows };
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
    return this.createCopy(actor, body);
  }

  async listBorrowings(actor: Actor, status?: string) {
    allow(actor, "library.read");
    let query = `
      SELECT r.*, b.title AS book_title, c.barcode, s.name AS student_name, s.nis AS student_nis
      FROM borrowings r
      JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.copy_id
      JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
      JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
      WHERE r.tenant_id = $1
    `;
    const params: any[] = [actor.tenant_id];
    if (status) {
      query += ` AND r.status = $2`;
      params.push(status);
    }
    query += ` ORDER BY r.created_at DESC`;
    const res = await this.db.query(query, params);
    return { data: res.rows };
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
      const newStatus =
        x.condition === "LOST"
          ? "LOST"
          : x.condition === "DAMAGED"
            ? "MAINTENANCE"
            : "AVAILABLE";

      await sql.query(
        "UPDATE book_copies SET condition=$3,status=$4 WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, borrowing.copy_id, x.condition, newStatus],
      );

      // Workflow 7.3: Check if there is a WAITING reservation for this book
      if (newStatus === "AVAILABLE") {
        const copyBook = (
          await sql.query(
            "SELECT book_id FROM book_copies WHERE tenant_id=$1 AND id=$2",
            [actor.tenant_id, borrowing.copy_id],
          )
        ).rows[0];
        if (copyBook) {
          const nextReservation = (
            await sql.query(
              `SELECT id FROM library_reservations
               WHERE tenant_id=$1 AND book_id=$2 AND status='WAITING'
               ORDER BY queue_position ASC, reserved_at ASC
               LIMIT 1
               FOR UPDATE`,
              [actor.tenant_id, copyBook.book_id],
            )
          ).rows[0];

          if (nextReservation) {
            // Mark copy as RESERVED / keep it safe or assign directly
            await sql.query(
              `UPDATE library_reservations
               SET status='READY', assigned_copy_id=$3, expiry_date=CURRENT_DATE + INTERVAL '2 days'
               WHERE tenant_id=$1 AND id=$2`,
              [actor.tenant_id, nextReservation.id, borrowing.copy_id],
            );
          }
        }
      }

      return result;
    });
  }

  async listPenalties(actor: Actor, status?: string) {
    allow(actor, "library.read");
    let query = `
      SELECT p.*, s.name as student_name, s.nis, b.title as book_title, c.barcode,
             EXTRACT(DAY FROM (COALESCE(r.returned_at, now()) - r.due_date))::int as late_days
      FROM library_penalties p
      JOIN students s ON s.tenant_id = p.tenant_id AND s.id = p.student_id
      JOIN borrowings r ON r.tenant_id = p.tenant_id AND r.id = p.borrowing_id
      JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.copy_id
      JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
      WHERE p.tenant_id = $1
    `;
    const params: any[] = [actor.tenant_id];
    if (status) {
      query += ` AND p.status = $2`;
      params.push(status);
    }
    query += ` ORDER BY p.created_at DESC`;
    const res = await this.db.query(query, params);
    return { data: res.rows };
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

  // ============================================================
  // SHELVES (Rak Buku)
  // ============================================================
  async listShelves(actor: Actor) {
    allow(actor, "library.shelves.read");
    return (
      await this.db.query(
        `SELECT * FROM shelves WHERE tenant_id=$1 ORDER BY code`,
        [actor.tenant_id],
      )
    ).rows;
  }

  async createShelf(actor: Actor, body: unknown) {
    allow(actor, "library.shelves.write");
    const x = z
      .object({
        code: short,
        name: short,
        description: optional,
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        `INSERT INTO shelves(tenant_id,code,name,description) VALUES($1,$2,$3,$4) RETURNING *`,
        [actor.tenant_id, x.code, x.name, x.description],
      )
    ).rows[0];
  }

  async updateShelf(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.shelves.write");
    uuid.parse(id);
    const x = z
      .object({
        code: short.optional(),
        name: short.optional(),
        description: optional.optional(),
      })
      .strict()
      .parse(body);
    const sets: string[] = [];
    const vals: unknown[] = [actor.tenant_id, id];
    let idx = 3;
    if (x.code !== undefined) {
      sets.push(`code=$${idx++}`);
      vals.push(x.code);
    }
    if (x.name !== undefined) {
      sets.push(`name=$${idx++}`);
      vals.push(x.name);
    }
    if (x.description !== undefined) {
      sets.push(`description=$${idx++}`);
      vals.push(x.description);
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE shelves SET ${sets.join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteShelf(actor: Actor, id: string) {
    allow(actor, "library.shelves.write");
    uuid.parse(id);
    // Check if shelf has copies
    const copies = (
      await this.db.query(
        `SELECT 1 FROM book_copies WHERE tenant_id=$1 AND shelf_id=$2 LIMIT 1`,
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (copies)
      throw new ConflictException(
        "Rak masih memiliki eksemplar, pindahkan dulu",
      );
    await this.db.query(`DELETE FROM shelves WHERE tenant_id=$1 AND id=$2`, [
      actor.tenant_id,
      id,
    ]);
    return { ok: true };
  }

  // ============================================================
  // BOOK COPIES (Eksemplar) - Extended
  // ============================================================
  async listCopies(actor: Actor, bookId?: string) {
    allow(actor, "library.read");
    let query = `SELECT c.*,b.title,b.author,s.code AS shelf_code,s.name AS shelf_name
                 FROM book_copies c
                 JOIN books b ON b.tenant_id=c.tenant_id AND b.id=c.book_id
                 LEFT JOIN shelves s ON s.tenant_id=c.tenant_id AND s.id=c.shelf_id
                 WHERE c.tenant_id=$1`;
    const params: unknown[] = [actor.tenant_id];
    if (bookId) {
      uuid.parse(bookId);
      query += ` AND c.book_id=$2`;
      params.push(bookId);
    }
    query += ` ORDER BY b.title,c.barcode`;
    return (await this.db.query(query, params)).rows;
  }

  async createCopy(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        book_id: uuid,
        barcode: short,
        shelf_id: uuid.optional().nullable(),
        acquisition_date: date.optional().nullable(),
        condition: z.enum(["GOOD", "FAIR", "DAMAGED", "LOST"]).default("GOOD"),
        status: z
          .enum([
            "AVAILABLE",
            "BORROWED",
            "RESERVED",
            "LOST",
            "DAMAGED",
            "MAINTENANCE",
          ])
          .default("AVAILABLE"),
      })
      .strict()
      .parse(body);
    // Validate book exists
    const book = (
      await this.db.query(
        `SELECT 1 FROM books WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, x.book_id],
      )
    ).rows[0];
    if (!book) throw new NotFoundException("Buku tidak ditemukan");

    // Validate duplicate barcode
    const existingBarcode = (
      await this.db.query(
        `SELECT 1 FROM book_copies WHERE tenant_id=$1 AND barcode=$2`,
        [actor.tenant_id, x.barcode],
      )
    ).rows[0];
    if (existingBarcode) throw new ConflictException("Barcode eksemplar sudah terdaftar");

    // Validate shelf exists if provided
    if (x.shelf_id) {
      const shelf = (
        await this.db.query(
          `SELECT 1 FROM shelves WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, x.shelf_id],
        )
      ).rows[0];
      if (!shelf) throw new BadRequestException("Rak tidak ditemukan");
    }
    return (
      await this.db.query(
        `INSERT INTO book_copies(tenant_id,book_id,barcode,shelf_id,acquisition_date,condition,status)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          actor.tenant_id,
          x.book_id,
          x.barcode,
          x.shelf_id,
          x.acquisition_date,
          x.condition,
          x.status,
        ],
      )
    ).rows[0];
  }

  async updateCopy(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.write");
    uuid.parse(id);
    const x = z
      .object({
        barcode: short.optional(),
        shelf_id: uuid.optional().nullable(),
        acquisition_date: date.optional().nullable(),
        condition: z.enum(["GOOD", "FAIR", "DAMAGED", "LOST"]).optional(),
        status: z
          .enum([
            "AVAILABLE",
            "BORROWED",
            "RESERVED",
            "LOST",
            "DAMAGED",
            "MAINTENANCE",
          ])
          .optional(),
      })
      .strict()
      .parse(body);
    // Validate barcode if provided
    if (x.barcode) {
      const existingBarcode = (
        await this.db.query(
          `SELECT 1 FROM book_copies WHERE tenant_id=$1 AND barcode=$2 AND id!=$3`,
          [actor.tenant_id, x.barcode, id],
        )
      ).rows[0];
      if (existingBarcode)
        throw new ConflictException("Barcode eksemplar sudah terdaftar");
    }
    // Validate shelf if provided
    if (x.shelf_id) {
      const shelf = (
        await this.db.query(
          `SELECT 1 FROM shelves WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, x.shelf_id],
        )
      ).rows[0];
      if (!shelf) throw new BadRequestException("Rak tidak ditemukan");
    }
    const sets: string[] = [];
    const vals: unknown[] = [actor.tenant_id, id];
    let idx = 3;
    if (x.barcode !== undefined) {
      sets.push(`barcode=$${idx++}`);
      vals.push(x.barcode);
    }
    if (x.shelf_id !== undefined) {
      sets.push(`shelf_id=$${idx++}`);
      vals.push(x.shelf_id);
    }
    if (x.acquisition_date !== undefined) {
      sets.push(`acquisition_date=$${idx++}`);
      vals.push(x.acquisition_date);
    }
    if (x.condition !== undefined) {
      sets.push(`condition=$${idx++}`);
      vals.push(x.condition);
    }
    if (x.status !== undefined) {
      sets.push(`status=$${idx++}`);
      vals.push(x.status);
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE book_copies SET ${sets.join(",")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteCopy(actor: Actor, id: string) {
    allow(actor, "library.write");
    uuid.parse(id);
    // Check if copy has active borrowing
    const borrowing = (
      await this.db.query(
        `SELECT 1 FROM borrowings WHERE tenant_id=$1 AND copy_id=$2 AND returned_at IS NULL LIMIT 1`,
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (borrowing) throw new ConflictException("Eksemplar sedang dipinjam");
    // Check if copy has borrowing history
    const history = (
      await this.db.query(
        `SELECT 1 FROM borrowings WHERE tenant_id=$1 AND copy_id=$2 LIMIT 1`,
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (history) {
      // Soft delete - mark as LOST
      return (
        await this.db.query(
          `UPDATE book_copies SET status='LOST',condition='LOST' WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id],
        )
      ).rows[0];
    }
    await this.db.query(
      `DELETE FROM book_copies WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id, id],
    );
    return { ok: true };
  }

  async listRenewals(actor: Actor, borrowingId?: string) {
    allow(actor, "library.read");
    let query = `
      SELECT r.*, u.name as renewed_by_name, b.due_date as current_due_date,
             bk.title as book_title, s.name as student_name
      FROM library_renewals r
      JOIN borrowings b ON b.tenant_id = r.tenant_id AND b.id = r.borrowing_id
      JOIN book_copies c ON c.tenant_id = b.tenant_id AND c.id = b.copy_id
      JOIN books bk ON bk.tenant_id = c.tenant_id AND bk.id = c.book_id
      JOIN students s ON s.tenant_id = b.tenant_id AND s.id = b.student_id
      JOIN users u ON u.tenant_id = r.tenant_id AND u.id = r.renewed_by
      WHERE r.tenant_id = $1
    `;
    const params: any[] = [actor.tenant_id];
    if (borrowingId) {
      uuid.parse(borrowingId);
      query += ` AND r.borrowing_id = $2`;
      params.push(borrowingId);
    }
    query += ` ORDER BY r.renewed_at DESC`;
    const res = await this.db.query(query, params);
    return { data: res.rows };
  }

  async renewBorrowing(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.write");
    uuid.parse(id);
    const x = z
      .object({
        days: z.number().int().min(1).max(30).default(7),
        new_due_date: date.optional(),
      })
      .strict()
      .parse(body || {});

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const borrowing = (
        await sql.query(
          "SELECT * FROM borrowings WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!borrowing) throw new NotFoundException("Peminjaman tidak ditemukan");
      if (borrowing.returned_at)
        throw new BadRequestException("Buku sudah dikembalikan");
      if (borrowing.status !== "BORROWED")
        throw new BadRequestException("Status peminjaman tidak aktif");

      const student = (
        await sql.query(
          "SELECT status FROM students WHERE tenant_id=$1 AND id=$2",
          [actor.tenant_id, borrowing.student_id],
        )
      ).rows[0];
      if (!student || student.status !== "ACTIVE")
        throw new BadRequestException("Siswa tidak aktif atau dibatasi");

      const renewalStats = (
        await sql.query(
          "SELECT count(*) as count FROM library_renewals WHERE tenant_id=$1 AND borrowing_id=$2",
          [actor.tenant_id, id],
        )
      ).rows[0];
      const count = Number(renewalStats?.count || 0);
      const MAX_RENEWALS = Number(process.env.LIBRARY_MAX_RENEWALS || 2);
      if (count >= MAX_RENEWALS) {
        throw new ConflictException(
          `Batas maksimal perpanjangan (${MAX_RENEWALS}x) telah tercapai`,
        );
      }

      const prevDueDate = typeof borrowing.due_date === "string" 
        ? borrowing.due_date.slice(0, 10) 
        : borrowing.due_date.toISOString().slice(0, 10);
      
      let nextDueDate = x.new_due_date;
      if (!nextDueDate) {
        const base = new Date(prevDueDate);
        base.setDate(base.getDate() + x.days);
        nextDueDate = base.toISOString().slice(0, 10);
      }

      if (nextDueDate <= prevDueDate) {
        throw new BadRequestException(
          "Tanggal jatuh tempo baru harus lebih besar dari tanggal sebelumnya",
        );
      }

      await sql.query(
        "UPDATE borrowings SET due_date=$3 WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, id, nextDueDate],
      );

      const renewal = (
        await sql.query(
          `INSERT INTO library_renewals(tenant_id, borrowing_id, renewal_count, previous_due_date, new_due_date, renewed_by)
           VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            actor.tenant_id,
            id,
            count + 1,
            prevDueDate,
            nextDueDate,
            actor.id,
          ],
        )
      ).rows[0];

      return {
        ...renewal,
        borrowing_id: id,
        previous_due_date: prevDueDate,
        new_due_date: nextDueDate,
      };
    });
  }

  // ============================================================
  // PHASE 7: RESERVATIONS
  // ============================================================
  async listBooks(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT b.*, count(c.id)::int AS copies, count(c.id) FILTER(WHERE c.status='AVAILABLE')::int AS available
       FROM books b LEFT JOIN book_copies c ON c.tenant_id = b.tenant_id AND c.book_id = b.id
       WHERE b.tenant_id = $1 GROUP BY b.id ORDER BY b.title`,
      [actor.tenant_id],
    );
    return { data: res.rows };
  }

  async listReservations(actor: Actor, bookId?: string) {
    allow(actor, "library.read");
    let query = `
      SELECT r.*, b.title as book_title, b.author as book_author,
             s.name as student_name, s.nis as student_nis,
             c.barcode as assigned_barcode
      FROM library_reservations r
      JOIN books b ON b.tenant_id = r.tenant_id AND b.id = r.book_id
      JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
      LEFT JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.assigned_copy_id
      WHERE r.tenant_id = $1
    `;
    const params: any[] = [actor.tenant_id];
    if (bookId) {
      uuid.parse(bookId);
      query += ` AND r.book_id = $2`;
      params.push(bookId);
    }
    query += ` ORDER BY r.status ASC, r.queue_position ASC, r.reserved_at DESC`;
    const res = await this.db.query(query, params);
    return { data: res.rows };
  }

  async createReservation(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        book_id: uuid,
        student_id: uuid,
      })
      .strict()
      .parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const book = (
        await sql.query(
          "SELECT id FROM books WHERE tenant_id=$1 AND id=$2",
          [actor.tenant_id, x.book_id],
        )
      ).rows[0];
      if (!book) throw new NotFoundException("Buku tidak ditemukan");

      const student = (
        await sql.query(
          "SELECT status FROM students WHERE tenant_id=$1 AND id=$2",
          [actor.tenant_id, x.student_id],
        )
      ).rows[0];
      if (!student || student.status !== "ACTIVE")
        throw new BadRequestException("Siswa tidak aktif atau dibatasi");

      // Check duplicate active reservation
      const existing = (
        await sql.query(
          `SELECT id FROM library_reservations
           WHERE tenant_id=$1 AND book_id=$2 AND student_id=$3 AND status IN ('WAITING', 'READY')`,
          [actor.tenant_id, x.book_id, x.student_id],
        )
      ).rows[0];
      if (existing) {
        throw new ConflictException("Siswa sudah memiliki reservasi aktif untuk buku ini");
      }

      // Check if there is an available copy right now
      const availableCopy = (
        await sql.query(
          `SELECT id FROM book_copies
           WHERE tenant_id=$1 AND book_id=$2 AND status='AVAILABLE'
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [actor.tenant_id, x.book_id],
        )
      ).rows[0];

      if (availableCopy) {
        // Immediate READY status
        const reservation = (
          await sql.query(
            `INSERT INTO library_reservations(tenant_id, book_id, student_id, status, queue_position, assigned_copy_id, expiry_date, created_by)
             VALUES($1, $2, $3, 'READY', 1, $4, CURRENT_DATE + INTERVAL '2 days', $5) RETURNING *`,
            [actor.tenant_id, x.book_id, x.student_id, availableCopy.id, actor.id],
          )
        ).rows[0];
        return reservation;
      }

      // Assign next queue position
      const lastQueue = (
        await sql.query(
          `SELECT COALESCE(MAX(queue_position), 0) as max_queue
           FROM library_reservations
           WHERE tenant_id=$1 AND book_id=$2 AND status='WAITING'`,
          [actor.tenant_id, x.book_id],
        )
      ).rows[0];
      const nextPos = Number(lastQueue?.max_queue || 0) + 1;

      const reservation = (
        await sql.query(
          `INSERT INTO library_reservations(tenant_id, book_id, student_id, status, queue_position, created_by)
           VALUES($1, $2, $3, 'WAITING', $4, $5) RETURNING *`,
          [actor.tenant_id, x.book_id, x.student_id, nextPos, actor.id],
        )
      ).rows[0];

      return reservation;
    });
  }

  async cancelReservation(actor: Actor, id: string) {
    allow(actor, "library.write");
    uuid.parse(id);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const res = (
        await sql.query(
          `SELECT * FROM library_reservations WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!res) throw new NotFoundException("Reservasi tidak ditemukan");
      if (res.status !== "WAITING" && res.status !== "READY") {
        throw new BadRequestException("Reservasi tidak dalam status aktif");
      }

      const updated = (
        await sql.query(
          `UPDATE library_reservations SET status='CANCELLED' WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id],
        )
      ).rows[0];

      // If it had an assigned copy, reassign to next waiting reservation if available
      if (res.assigned_copy_id) {
        const nextWaiting = (
          await sql.query(
            `SELECT id FROM library_reservations
             WHERE tenant_id=$1 AND book_id=$2 AND status='WAITING'
             ORDER BY queue_position ASC, reserved_at ASC
             LIMIT 1
             FOR UPDATE`,
            [actor.tenant_id, res.book_id],
          )
        ).rows[0];

        if (nextWaiting) {
          await sql.query(
            `UPDATE library_reservations
             SET status='READY', assigned_copy_id=$3, expiry_date=CURRENT_DATE + INTERVAL '2 days'
             WHERE tenant_id=$1 AND id=$2`,
            [actor.tenant_id, nextWaiting.id, res.assigned_copy_id],
          );
        }
      }

      return updated;
    });
  }

  async listInventoryStock(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT b.id, b.isbn, b.title, b.author, b.publisher, b.category,
              count(c.id)::int AS total_copies,
              count(c.id) FILTER (WHERE c.status='AVAILABLE')::int AS available_copies,
              count(c.id) FILTER (WHERE c.status='BORROWED')::int AS borrowed_copies,
              count(c.id) FILTER (WHERE c.status='RESERVED')::int AS reserved_copies,
              count(c.id) FILTER (WHERE c.status='LOST')::int AS lost_copies,
              count(c.id) FILTER (WHERE c.status='DAMAGED')::int AS damaged_copies,
              count(c.id) FILTER (WHERE c.status='MAINTENANCE')::int AS maintenance_copies
       FROM books b
       LEFT JOIN book_copies c ON c.tenant_id = b.tenant_id AND c.book_id = b.id
       WHERE b.tenant_id = $1
       GROUP BY b.id
       ORDER BY b.title`,
      [actor.tenant_id],
    );
    return { data: res.rows };
  }

  async listStockOpnames(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT op.*, u.name as created_by_name, s.name as shelf_name,
              (SELECT count(*)::int FROM library_stock_opname_items item WHERE item.tenant_id=op.tenant_id AND item.opname_id=op.id) as total_items,
              (SELECT count(*)::int FROM library_stock_opname_items item WHERE item.tenant_id=op.tenant_id AND item.opname_id=op.id AND item.is_match=false) as discrepancy_count
       FROM library_stock_opnames op
       LEFT JOIN users u ON u.tenant_id = op.tenant_id AND u.id = op.created_by
       LEFT JOIN shelves s ON s.tenant_id = op.tenant_id AND s.id = op.shelf_id
       WHERE op.tenant_id = $1
       ORDER BY op.created_at DESC`,
      [actor.tenant_id],
    );
    return { data: res.rows };
  }

  async createStockOpname(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        title: z.string().min(2),
        shelf_id: uuid.optional(),
        notes: z.string().optional(),
      })
      .strict()
      .parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const opname = (
        await sql.query(
          `INSERT INTO library_stock_opnames (tenant_id, title, shelf_id, notes, created_by, status)
           VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS') RETURNING *`,
          [actor.tenant_id, x.title, x.shelf_id || null, x.notes || null, actor.id],
        )
      ).rows[0];

      // Populate items for copies in shelf or all copies if shelf not specified
      let copiesQuery = `SELECT id, status FROM book_copies WHERE tenant_id = $1`;
      const qParams: any[] = [actor.tenant_id];
      if (x.shelf_id) {
        copiesQuery += ` AND shelf_id = $2`;
        qParams.push(x.shelf_id);
      }
      const copies = (await sql.query(copiesQuery, qParams)).rows;

      for (const cp of copies) {
        await sql.query(
          `INSERT INTO library_stock_opname_items (tenant_id, opname_id, copy_id, expected_status, actual_status, is_match)
           VALUES ($1, $2, $3, $4, $4, true)`,
          [actor.tenant_id, opname.id, cp.id, cp.status],
        );
      }

      return opname;
    });
  }

  async finalizeStockOpname(actor: Actor, id: string, body: unknown) {
    allow(actor, "library.write");
    uuid.parse(id);
    const x = z
      .object({
        items: z.array(
          z.object({
            id: uuid,
            actual_status: z.string(),
            notes: z.string().optional(),
          })
        ),
      })
      .strict()
      .parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const op = (
        await sql.query(
          `SELECT * FROM library_stock_opnames WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (!op) throw new NotFoundException("Stock opname tidak ditemukan");
      if (op.status === "COMPLETED" || op.status === "CANCELLED") {
        throw new BadRequestException("Stock opname sudah selesai atau dibatalkan");
      }

      for (const item of x.items) {
        const curr = (
          await sql.query(
            `SELECT * FROM library_stock_opname_items WHERE tenant_id=$1 AND id=$2`,
            [actor.tenant_id, item.id],
          )
        ).rows[0];
        if (curr) {
          const isMatch = curr.expected_status === item.actual_status;
          await sql.query(
            `UPDATE library_stock_opname_items SET actual_status=$3, is_match=$4, notes=$5 WHERE tenant_id=$1 AND id=$2`,
            [actor.tenant_id, item.id, item.actual_status, isMatch, item.notes || null],
          );
          // Update actual copy status if changed
          if (!isMatch) {
            await sql.query(
              `UPDATE book_copies SET status=$3 WHERE tenant_id=$1 AND id=$2`,
              [actor.tenant_id, curr.copy_id, item.actual_status],
            );
          }
        }
      }

      const updated = (
        await sql.query(
          `UPDATE library_stock_opnames SET status='COMPLETED', completed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id],
        )
      ).rows[0];
      return updated;
    });
  }

  async listIncidents(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT inc.*, c.barcode, b.title as book_title, u.name as reported_by_name
       FROM library_incidents inc
       JOIN book_copies c ON c.tenant_id = inc.tenant_id AND c.id = inc.copy_id
       JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
       LEFT JOIN users u ON u.tenant_id = inc.tenant_id AND u.id = inc.reported_by
       WHERE inc.tenant_id = $1
       ORDER BY inc.reported_at DESC`,
      [actor.tenant_id],
    );
    return { data: res.rows };
  }

  async createIncident(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        copy_id: uuid,
        type: z.enum(["LOST", "DAMAGED"]),
        description: z.string().min(2),
        resolution: z.string().optional(),
      })
      .strict()
      .parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const copy = (
        await sql.query(
          `SELECT * FROM book_copies WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [actor.tenant_id, x.copy_id],
        )
      ).rows[0];
      if (!copy) throw new NotFoundException("Eksemplar buku tidak ditemukan");

      const incident = (
        await sql.query(
          `INSERT INTO library_incidents (tenant_id, copy_id, type, description, resolution, reported_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [actor.tenant_id, x.copy_id, x.type, x.description, x.resolution || null, actor.id],
        )
      ).rows[0];

      // Update copy status and condition
      const newStatus = x.type === "LOST" ? "LOST" : "DAMAGED";
      await sql.query(
        `UPDATE book_copies SET status=$3, condition=$3 WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, x.copy_id, newStatus],
      );

      return incident;
    });
  }

  async listMutations(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT m.*, c.barcode, b.title as book_title,
              fs.name as from_shelf_name, ts.name as to_shelf_name,
              u.name as performed_by_name
       FROM library_mutations m
       JOIN book_copies c ON c.tenant_id = m.tenant_id AND c.id = m.copy_id
       JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
       LEFT JOIN shelves fs ON fs.tenant_id = m.tenant_id AND fs.id = m.from_shelf_id
       LEFT JOIN shelves ts ON ts.tenant_id = m.tenant_id AND ts.id = m.to_shelf_id
       LEFT JOIN users u ON u.tenant_id = m.tenant_id AND u.id = m.performed_by
       WHERE m.tenant_id = $1
       ORDER BY m.performed_at DESC`,
      [actor.tenant_id],
    );
    return { data: res.rows };
  }

  async createMutation(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        copy_id: uuid,
        to_shelf_id: uuid,
        reason: z.string().min(2),
      })
      .strict()
      .parse(body);

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const copy = (
        await sql.query(
          `SELECT * FROM book_copies WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [actor.tenant_id, x.copy_id],
        )
      ).rows[0];
      if (!copy) throw new NotFoundException("Eksemplar buku tidak ditemukan");

      const fromShelfId = copy.shelf_id;

      const toShelf = (
        await sql.query(
          `SELECT * FROM shelves WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, x.to_shelf_id],
        )
      ).rows[0];
      if (!toShelf) throw new NotFoundException("Rak tujuan tidak ditemukan");

      const mutation = (
        await sql.query(
          `INSERT INTO library_mutations (tenant_id, copy_id, from_shelf_id, to_shelf_id, reason, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [actor.tenant_id, x.copy_id, fromShelfId || null, x.to_shelf_id, x.reason, actor.id],
        )
      ).rows[0];

      await sql.query(
        `UPDATE book_copies SET shelf_id=$3 WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, x.copy_id, x.to_shelf_id],
      );

      return mutation;
    });
  }

  async getSettings(actor: Actor) {
    allow(actor, "library.read");
    let res = await this.db.query(
      `SELECT * FROM library_settings WHERE tenant_id = $1`,
      [actor.tenant_id]
    );
    if (res.rows.length === 0) {
      await this.db.query(
        `INSERT INTO library_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [actor.tenant_id]
      );
      res = await this.db.query(
        `SELECT * FROM library_settings WHERE tenant_id = $1`,
        [actor.tenant_id]
      );
    }
    return res.rows[0];
  }

  async updateSettings(actor: Actor, body: unknown) {
    allow(actor, "library.write");
    const x = z
      .object({
        max_books: z.coerce.number().int().min(1).optional(),
        loan_duration_days: z.coerce.number().int().min(1).optional(),
        max_renewals: z.coerce.number().int().min(0).optional(),
        renewal_duration_days: z.coerce.number().int().min(1).optional(),
        max_reservations: z.coerce.number().int().min(0).optional(),
        reservation_expiry_days: z.coerce.number().int().min(1).optional(),
        allow_overdue_borrowing: z.boolean().optional(),
        fine_rate_per_day: z.coerce.number().min(0).optional(),
        grace_period_days: z.coerce.number().int().min(0).optional(),
        max_fine: z.coerce.number().min(0).optional(),
        lost_book_fine: z.coerce.number().min(0).optional(),
        damaged_book_fine: z.coerce.number().min(0).optional(),
        library_name: z.string().optional(),
        library_code: z.string().optional(),
        address: z.string().optional(),
        contact: z.string().optional(),
        operating_hours: z.string().optional(),
      })
      .strict()
      .parse(body);

    await this.db.query(
      `INSERT INTO library_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [actor.tenant_id]
    );

    const updated = (
      await this.db.query(
        `UPDATE library_settings SET
           max_books = COALESCE($2, max_books),
           loan_duration_days = COALESCE($3, loan_duration_days),
           max_renewals = COALESCE($4, max_renewals),
           renewal_duration_days = COALESCE($5, renewal_duration_days),
           max_reservations = COALESCE($6, max_reservations),
           reservation_expiry_days = COALESCE($7, reservation_expiry_days),
           allow_overdue_borrowing = COALESCE($8, allow_overdue_borrowing),
           fine_rate_per_day = COALESCE($9, fine_rate_per_day),
           grace_period_days = COALESCE($10, grace_period_days),
           max_fine = COALESCE($11, max_fine),
           lost_book_fine = COALESCE($12, lost_book_fine),
           damaged_book_fine = COALESCE($13, damaged_book_fine),
           library_name = COALESCE($14, library_name),
           library_code = COALESCE($15, library_code),
           address = COALESCE($16, address),
           contact = COALESCE($17, contact),
           operating_hours = COALESCE($18, operating_hours),
           updated_at = NOW()
         WHERE tenant_id = $1 RETURNING *`,
        [
          actor.tenant_id,
          x.max_books ?? null,
          x.loan_duration_days ?? null,
          x.max_renewals ?? null,
          x.renewal_duration_days ?? null,
          x.max_reservations ?? null,
          x.reservation_expiry_days ?? null,
          x.allow_overdue_borrowing ?? null,
          x.fine_rate_per_day ?? null,
          x.grace_period_days ?? null,
          x.max_fine ?? null,
          x.lost_book_fine ?? null,
          x.damaged_book_fine ?? null,
          x.library_name ?? null,
          x.library_code ?? null,
          x.address ?? null,
          x.contact ?? null,
          x.operating_hours ?? null,
        ]
      )
    ).rows[0];

    return updated;
  }

  async getReportPeminjaman(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT r.*, s.name as student_name, s.nis, b.title as book_title, c.barcode
       FROM borrowings r
       JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
       JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.copy_id
       JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
       WHERE r.tenant_id = $1
       ORDER BY r.borrowed_at DESC LIMIT 500`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async getReportPengembalian(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT ret.*, s.name as student_name, s.nis, b.title as book_title, c.barcode
       FROM library_returns ret
       JOIN borrowings r ON r.tenant_id = ret.tenant_id AND r.id = ret.borrowing_id
       JOIN students s ON s.tenant_id = ret.tenant_id AND s.id = r.student_id
       JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.copy_id
       JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
       WHERE ret.tenant_id = $1
       ORDER BY ret.returned_at DESC LIMIT 500`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async getReportKeterlambatan(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT p.*, s.name as student_name, s.nis, b.title as book_title, c.barcode, r.due_date, r.returned_at,
              EXTRACT(DAY FROM (COALESCE(r.returned_at, now()) - r.due_date))::int as late_days
       FROM library_penalties p
       JOIN borrowings r ON r.tenant_id = p.tenant_id AND r.id = p.borrowing_id
       JOIN students s ON s.tenant_id = p.tenant_id AND s.id = p.student_id
       JOIN book_copies c ON c.tenant_id = r.tenant_id AND c.id = r.copy_id
       JOIN books b ON b.tenant_id = c.tenant_id AND b.id = c.book_id
       WHERE p.tenant_id = $1 AND p.type = 'OVERDUE'
       ORDER BY p.created_at DESC`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async getReportBukuTerpopuler(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT b.id, b.title, b.author, b.isbn, COUNT(r.id)::int as borrowing_count
       FROM books b
       JOIN book_copies c ON c.tenant_id = b.tenant_id AND c.book_id = b.id
       JOIN borrowings r ON r.tenant_id = c.tenant_id AND r.copy_id = c.id
       WHERE b.tenant_id = $1
       GROUP BY b.id, b.title, b.author, b.isbn
       ORDER BY borrowing_count DESC LIMIT 50`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async getReportInventaris(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT
         COUNT(*)::int as total_copies,
         COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int as available,
         COUNT(*) FILTER (WHERE status = 'BORROWED')::int as borrowed,
         COUNT(*) FILTER (WHERE status = 'RESERVED')::int as reserved,
         COUNT(*) FILTER (WHERE status = 'LOST')::int as lost,
         COUNT(*) FILTER (WHERE status = 'DAMAGED')::int as damaged,
         COUNT(*) FILTER (WHERE status = 'MAINTENANCE')::int as maintenance
       FROM book_copies
       WHERE tenant_id = $1`,
      [actor.tenant_id]
    );
    return res.rows[0];
  }

  async getReportDenda(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT
         COALESCE(SUM(amount), 0)::numeric as total_fine,
         COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0)::numeric as paid,
         COALESCE(SUM(amount) FILTER (WHERE status = 'UNPAID'), 0)::numeric as outstanding,
         COALESCE(SUM(amount) FILTER (WHERE status = 'WAIVED'), 0)::numeric as waived
       FROM library_penalties
       WHERE tenant_id = $1`,
      [actor.tenant_id]
    );
    return res.rows[0];
  }

  async listCategories(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT category as name, count(*)::int as book_count
       FROM books WHERE tenant_id = $1 AND category != ''
       GROUP BY category ORDER BY category`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async listAuthors(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT author as name, count(*)::int as book_count
       FROM books WHERE tenant_id = $1 AND author != ''
       GROUP BY author ORDER BY author`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }

  async listPublishers(actor: Actor) {
    allow(actor, "library.read");
    const res = await this.db.query(
      `SELECT publisher as name, count(*)::int as book_count
       FROM books WHERE tenant_id = $1 AND publisher != ''
       GROUP BY publisher ORDER BY publisher`,
      [actor.tenant_id]
    );
    return { data: res.rows };
  }
}

