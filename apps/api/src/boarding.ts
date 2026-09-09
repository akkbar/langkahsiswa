import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { allow, AuthGuard, isAdmin, type AuthRequest } from "./auth";
import { Database, type Sql } from "./database";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(500);
const note = z.string().trim().max(2000).default("");
const date = z.string().date();
const timestamp = z.string().datetime({ offset: true });
async function exists(sql: Sql, table: string, tenant: string, id: string) {
  const row = (
    await sql.query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2`, [
      tenant,
      id,
    ])
  ).rows[0];
  if (!row) throw new NotFoundException("Data terkait tidak ditemukan");
  return row;
}
async function mayAccessStudent(sql: Sql, req: AuthRequest, studentId: string) {
  if (isAdmin(req.actor) || req.actor.permissions.includes("boarding.write"))
    return;
  const ok = (
    await sql.query(
      `SELECT 1 FROM students s WHERE s.tenant_id=$1 AND s.id=$2 AND
       (s.user_id=$3 OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id
       WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$3))`,
      [req.actor.tenant_id, studentId, req.actor.id],
    )
  ).rowCount;
  if (!ok) throw new NotFoundException("Siswa tidak ditemukan");
}

@Controller("api/v1/boarding")
@UseGuards(AuthGuard)
export class BoardingController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get("overview") async overview(@Req() req: AuthRequest) {
    allow(req.actor, "boarding.read");
    const tenant = req.actor.tenant_id;
    const queries = [
      `SELECT d.*,count(DISTINCT r.id)::int AS rooms,count(DISTINCT b.id)::int AS beds,count(DISTINCT a.id)::int AS occupied FROM dormitories d LEFT JOIN dormitory_rooms r ON r.tenant_id=d.tenant_id AND r.dormitory_id=d.id LEFT JOIN dormitory_beds b ON b.tenant_id=r.tenant_id AND b.room_id=r.id LEFT JOIN student_room_assignments a ON a.tenant_id=b.tenant_id AND a.bed_id=b.id AND a.end_date IS NULL WHERE d.tenant_id=$1 GROUP BY d.id ORDER BY d.name`,
      `SELECT r.*,d.name AS dormitory_name,(SELECT count(*)::int FROM student_room_assignments a JOIN dormitory_beds b ON b.tenant_id=a.tenant_id AND b.id=a.bed_id WHERE b.room_id=r.id AND a.end_date IS NULL) AS occupied FROM dormitory_rooms r JOIN dormitories d ON d.tenant_id=r.tenant_id AND d.id=r.dormitory_id WHERE r.tenant_id=$1 ORDER BY d.name,r.name`,
      `SELECT b.*,r.name AS room_name,d.name AS dormitory_name FROM dormitory_beds b JOIN dormitory_rooms r ON r.tenant_id=b.tenant_id AND r.id=b.room_id JOIN dormitories d ON d.tenant_id=r.tenant_id AND d.id=r.dormitory_id WHERE b.tenant_id=$1 ORDER BY d.name,r.name,b.code`,
      `SELECT a.*,s.name AS student_name,s.nis,b.code AS bed_code,r.name AS room_name,d.name AS dormitory_name FROM student_room_assignments a JOIN students s ON s.tenant_id=a.tenant_id AND s.id=a.student_id JOIN dormitory_beds b ON b.tenant_id=a.tenant_id AND b.id=a.bed_id JOIN dormitory_rooms r ON r.tenant_id=b.tenant_id AND r.id=b.room_id JOIN dormitories d ON d.tenant_id=r.tenant_id AND d.id=r.dormitory_id WHERE a.tenant_id=$1 ORDER BY a.end_date NULLS FIRST,a.start_date DESC`,
      `SELECT l.*,s.name AS student_name,s.nis FROM leave_permissions l JOIN students s ON s.tenant_id=l.tenant_id AND s.id=l.student_id WHERE l.tenant_id=$1 ORDER BY l.created_at DESC LIMIT 100`,
      `SELECT v.*,s.name AS student_name FROM parent_visits v JOIN students s ON s.tenant_id=v.tenant_id AND s.id=v.student_id WHERE v.tenant_id=$1 ORDER BY v.visit_at DESC LIMIT 100`,
      `SELECT d.*,s.name AS student_name FROM discipline_records d JOIN students s ON s.tenant_id=d.tenant_id AND s.id=d.student_id WHERE d.tenant_id=$1 ORDER BY d.incident_date DESC LIMIT 100`,
      `SELECT t.*,s.name AS student_name FROM tahfidz_records t JOIN students s ON s.tenant_id=t.tenant_id AND s.id=t.student_id WHERE t.tenant_id=$1 ORDER BY t.record_date DESC LIMIT 100`,
      `SELECT a.*,d.name AS dormitory_name FROM daily_activities a LEFT JOIN dormitories d ON d.tenant_id=a.tenant_id AND d.id=a.dormitory_id WHERE a.tenant_id=$1 ORDER BY a.activity_date DESC,a.start_time LIMIT 100`,
      `SELECT l.*,s.name AS student_name,s.nis FROM laundry_orders l JOIN students s ON s.tenant_id=l.tenant_id AND s.id=l.student_id WHERE l.tenant_id=$1 ORDER BY l.received_at DESC LIMIT 100`,
    ];
    const rows = await Promise.all(
      queries.map((query) => this.db.query(query, [tenant])),
    );
    return Object.fromEntries(
      [
        "dormitories",
        "rooms",
        "beds",
        "assignments",
        "leaves",
        "visits",
        "discipline",
        "tahfidz",
        "activities",
        "laundry",
      ].map((key, index) => [key, rows[index].rows]),
    );
  }

  @Get("portal") async portal(@Req() req: AuthRequest) {
    allow(req.actor, "boarding.own");
    const rows = (
      await this.db.query(
        `SELECT s.id,s.name,s.nis,json_build_object('dormitory',d.name,'room',r.name,'bed',b.code) AS residence,
         (SELECT COALESCE(json_agg(l ORDER BY l.created_at DESC),'[]') FROM leave_permissions l WHERE l.tenant_id=s.tenant_id AND l.student_id=s.id) AS leaves,
         (SELECT COALESCE(json_agg(t ORDER BY t.record_date DESC),'[]') FROM tahfidz_records t WHERE t.tenant_id=s.tenant_id AND t.student_id=s.id) AS tahfidz
         FROM students s LEFT JOIN student_room_assignments a ON a.tenant_id=s.tenant_id AND a.student_id=s.id AND a.end_date IS NULL
         LEFT JOIN dormitory_beds b ON b.tenant_id=a.tenant_id AND b.id=a.bed_id LEFT JOIN dormitory_rooms r ON r.tenant_id=b.tenant_id AND r.id=b.room_id
         LEFT JOIN dormitories d ON d.tenant_id=r.tenant_id AND d.id=r.dormitory_id
         WHERE s.tenant_id=$1 AND (s.user_id=$2 OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$2))`,
        [req.actor.tenant_id, req.actor.id],
      )
    ).rows;
    return { data: rows, total: rows.length };
  }

  @Post("dormitories") async dormitory(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        name: text,
        gender: z.enum(["MALE", "FEMALE", "MIXED"]),
        description: note,
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO dormitories(tenant_id,name,gender,description) VALUES($1,$2,$3,$4) RETURNING *",
        [req.actor.tenant_id, x.name, x.gender, x.description],
      )
    ).rows[0];
  }
  @Post("rooms") async room(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        dormitory_id: uuid,
        name: text,
        floor: z.number().int().min(0).max(100),
        capacity: z.number().int().min(1).max(100),
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO dormitory_rooms(tenant_id,dormitory_id,name,floor,capacity) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.actor.tenant_id, x.dormitory_id, x.name, x.floor, x.capacity],
      )
    ).rows[0];
  }
  @Post("beds") async bed(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "boarding.write");
    const x = z.object({ room_id: uuid, code: text }).strict().parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const room = await exists(
        sql,
        "dormitory_rooms",
        req.actor.tenant_id,
        x.room_id,
      );
      const count = Number(
        (
          await sql.query(
            "SELECT count(*) FROM dormitory_beds WHERE tenant_id=$1 AND room_id=$2",
            [req.actor.tenant_id, x.room_id],
          )
        ).rows[0].count,
      );
      if (count >= room.capacity)
        throw new ConflictException(
          "Jumlah tempat tidur melebihi kapasitas kamar",
        );
      return (
        await sql.query(
          "INSERT INTO dormitory_beds(tenant_id,room_id,code) VALUES($1,$2,$3) RETURNING *",
          [req.actor.tenant_id, x.room_id, x.code],
        )
      ).rows[0];
    });
  }
  @Post("assignments") async assign(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({ student_id: uuid, bed_id: uuid, start_date: date })
      .strict()
      .parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const student = await exists(
        sql,
        "students",
        req.actor.tenant_id,
        x.student_id,
      );
      const bed = (
        await sql.query(
          `SELECT b.*,d.gender FROM dormitory_beds b JOIN dormitory_rooms r ON r.tenant_id=b.tenant_id AND r.id=b.room_id JOIN dormitories d ON d.tenant_id=r.tenant_id AND d.id=r.dormitory_id WHERE b.tenant_id=$1 AND b.id=$2 FOR UPDATE OF b`,
          [req.actor.tenant_id, x.bed_id],
        )
      ).rows[0];
      if (!bed || bed.status !== "AVAILABLE")
        throw new ConflictException("Tempat tidur tidak tersedia");
      if (
        bed.gender !== "MIXED" &&
        student.gender &&
        bed.gender !== student.gender
      )
        throw new BadRequestException("Asrama tidak sesuai gender siswa");
      const assignment = (
        await sql.query(
          "INSERT INTO student_room_assignments(tenant_id,student_id,bed_id,start_date,assigned_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            req.actor.tenant_id,
            x.student_id,
            x.bed_id,
            x.start_date,
            req.actor.id,
          ],
        )
      ).rows[0];
      await sql.query(
        "UPDATE dormitory_beds SET status='OCCUPIED' WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, x.bed_id],
      );
      return assignment;
    });
  }
  @Post("assignments/:id/end") async endAssignment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    const x = z.object({ end_date: date }).strict().parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const a = (
        await sql.query(
          "UPDATE student_room_assignments SET end_date=$3 WHERE tenant_id=$1 AND id=$2 AND end_date IS NULL AND start_date<=$3 RETURNING *",
          [req.actor.tenant_id, id, x.end_date],
        )
      ).rows[0];
      if (!a) throw new ConflictException("Penempatan aktif tidak ditemukan");
      await sql.query(
        "UPDATE dormitory_beds SET status='AVAILABLE' WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, a.bed_id],
      );
      return a;
    });
  }
  @Post("leaves") async leave(@Req() req: AuthRequest, @Body() body: unknown) {
    const x = z
      .object({
        student_id: uuid,
        start_at: timestamp,
        end_at: timestamp,
        reason: text,
      })
      .strict()
      .parse(body);
    if (new Date(x.start_at) >= new Date(x.end_at))
      throw new BadRequestException("Waktu kembali harus setelah waktu keluar");
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      await mayAccessStudent(sql, req, x.student_id);
      return (
        await sql.query(
          "INSERT INTO leave_permissions(tenant_id,student_id,start_at,end_at,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            req.actor.tenant_id,
            x.student_id,
            x.start_at,
            x.end_at,
            x.reason,
            req.actor.id,
          ],
        )
      ).rows[0];
    });
  }
  @Post("leaves/:id/review") async reviewLeave(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    const x = z
      .object({ decision: z.enum(["APPROVED", "REJECTED"]), notes: note })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE leave_permissions SET status=$3,reviewed_by=$4,review_notes=$5 WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING *",
        [req.actor.tenant_id, id, x.decision, req.actor.id, x.notes],
      )
    ).rows[0];
    if (!row) throw new ConflictException("Izin tidak lagi menunggu review");
    return row;
  }
  @Post("leaves/:id/status") async leaveStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    const status = z
      .enum(["RETURNED", "CANCELLED"])
      .parse((body as any)?.status);
    const row = (
      await this.db.query(
        `UPDATE leave_permissions SET status=$3,returned_at=CASE WHEN $3='RETURNED' THEN now() ELSE returned_at END
         WHERE tenant_id=$1 AND id=$2 AND (($3='RETURNED' AND status='APPROVED') OR ($3='CANCELLED' AND status IN ('PENDING','APPROVED'))) RETURNING *`,
        [req.actor.tenant_id, id, status],
      )
    ).rows[0];
    if (!row) throw new ConflictException("Status izin tidak dapat diubah");
    return row;
  }
  @Post("visits") async visit(@Req() req: AuthRequest, @Body() body: unknown) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        student_id: uuid,
        parent_id: uuid.nullable().default(null),
        visitor_name: text,
        visit_at: timestamp,
        purpose: note,
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO parent_visits(tenant_id,student_id,parent_id,visitor_name,visit_at,purpose,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          req.actor.tenant_id,
          x.student_id,
          x.parent_id,
          x.visitor_name,
          x.visit_at,
          x.purpose,
          req.actor.id,
        ],
      )
    ).rows[0];
  }
  @Post("visits/:id/status") async visitStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    const status = z
      .enum(["COMPLETED", "CANCELLED"])
      .parse((body as any)?.status);
    const row = (
      await this.db.query(
        "UPDATE parent_visits SET status=$3 WHERE tenant_id=$1 AND id=$2 AND status='SCHEDULED' RETURNING *",
        [req.actor.tenant_id, id, status],
      )
    ).rows[0];
    if (!row) throw new ConflictException("Kunjungan tidak lagi terjadwal");
    return row;
  }
  @Post("discipline") async discipline(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        student_id: uuid,
        incident_date: date,
        category: text,
        points: z.number().int().min(0).max(1000),
        description: text,
        follow_up: note,
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO discipline_records(tenant_id,student_id,incident_date,category,points,description,follow_up,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          req.actor.tenant_id,
          x.student_id,
          x.incident_date,
          x.category,
          x.points,
          x.description,
          x.follow_up,
          req.actor.id,
        ],
      )
    ).rows[0];
  }
  @Post("tahfidz") async tahfidz(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        student_id: uuid,
        record_date: date,
        surah: text,
        from_verse: z.number().int().positive(),
        to_verse: z.number().int().positive(),
        score: z.number().min(0).max(100).nullable().default(null),
        notes: note,
      })
      .strict()
      .refine((v) => v.to_verse >= v.from_verse, {
        path: ["to_verse"],
        message: "Ayat akhir harus setelah ayat awal",
      })
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO tahfidz_records(tenant_id,student_id,record_date,surah,from_verse,to_verse,score,notes,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          req.actor.tenant_id,
          x.student_id,
          x.record_date,
          x.surah,
          x.from_verse,
          x.to_verse,
          x.score,
          x.notes,
          req.actor.id,
        ],
      )
    ).rows[0];
  }
  @Post("activities") async activity(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        dormitory_id: uuid.nullable().default(null),
        activity_date: date,
        name: text,
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
        description: note,
      })
      .strict()
      .refine((v) => v.start_time < v.end_time, {
        path: ["end_time"],
        message: "Jam selesai harus setelah mulai",
      })
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO daily_activities(tenant_id,dormitory_id,activity_date,name,start_time,end_time,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          req.actor.tenant_id,
          x.dormitory_id,
          x.activity_date,
          x.name,
          x.start_time,
          x.end_time,
          x.description,
          req.actor.id,
        ],
      )
    ).rows[0];
  }
  @Post("laundry") async laundry(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    const x = z
      .object({
        student_id: uuid,
        bag_code: text,
        weight_kg: z.number().positive().max(100),
        amount: z.number().int().min(0),
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        "INSERT INTO laundry_orders(tenant_id,student_id,bag_code,weight_kg,amount,recorded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          req.actor.tenant_id,
          x.student_id,
          x.bag_code,
          x.weight_kg,
          x.amount,
          req.actor.id,
        ],
      )
    ).rows[0];
  }
  @Post("laundry/:id/status") async laundryStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    const x = z
      .object({
        status: z.enum(["WASHING", "READY", "COLLECTED", "CANCELLED"]),
      })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE laundry_orders SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status<>'CANCELLED' RETURNING *",
        [req.actor.tenant_id, id, x.status],
      )
    ).rows[0];
    if (!row) throw new ConflictException("Pesanan laundry tidak dapat diubah");
    return row;
  }
  @Post("laundry/:id/charge") async chargeLaundry(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allow(req.actor, "boarding.write");
    uuid.parse(id);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const order = (
        await sql.query(
          "SELECT * FROM laundry_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!order) throw new NotFoundException("Laundry tidak ditemukan");
      if (order.wallet_transaction_id) return order;
      if (Number(order.amount) <= 0)
        throw new BadRequestException("Nominal laundry harus lebih dari nol");
      await sql.query(
        "INSERT INTO wallet_accounts(tenant_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [req.actor.tenant_id, order.student_id],
      );
      const account = (
        await sql.query(
          "SELECT * FROM wallet_accounts WHERE tenant_id=$1 AND student_id=$2 FOR UPDATE",
          [req.actor.tenant_id, order.student_id],
        )
      ).rows[0];
      if (Number(account.balance) < Number(order.amount))
        throw new ConflictException("Saldo siswa tidak mencukupi");
      const merchant = (
        await sql.query(
          "INSERT INTO wallet_merchants(tenant_id,name,category) VALUES($1,'Laundry Pondok','Laundry') ON CONFLICT(tenant_id,name) DO UPDATE SET active=true RETURNING *",
          [req.actor.tenant_id],
        )
      ).rows[0];
      const balance = Number(account.balance) - Number(order.amount);
      const requestHash = createHash("sha256")
        .update(`${order.id}:${order.amount}`)
        .digest("hex");
      const transaction = (
        await sql.query(
          `INSERT INTO wallet_transactions(tenant_id,account_id,student_id,type,amount,balance_after,merchant_id,merchant_name,category,description,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,'PURCHASE',$4,$5,$6,$7,'Laundry',$8,$9,$10,$11) RETURNING *`,
          [
            req.actor.tenant_id,
            account.id,
            order.student_id,
            -Number(order.amount),
            balance,
            merchant.id,
            merchant.name,
            `Laundry ${order.bag_code}`,
            req.actor.id,
            `laundry:${order.id}`,
            requestHash,
          ],
        )
      ).rows[0];
      await sql.query(
        "UPDATE wallet_accounts SET balance=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, account.id, balance],
      );
      return (
        await sql.query(
          "UPDATE laundry_orders SET wallet_transaction_id=$3,status='WASHING',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [req.actor.tenant_id, id, transaction.id],
        )
      ).rows[0];
    });
  }
}
