import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";
import { allow, allowOperational, AuthGuard, type AuthRequest } from "./auth";
import { Database, type Sql } from "./database";
import {
  fileCategories,
  fileInput,
  readManagedFile,
  saveManagedFile,
} from "./file-storage";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodInput = z
  .object({
    school_id: uuid,
    academic_year_id: uuid,
    name: text,
    starts_on: date,
    ends_on: date,
    capacity: z.number().int().positive().max(100000).nullable().default(null),
  })
  .strict();
const applicationInput = z
  .object({
    period_id: uuid,
    track_id: uuid.nullable().optional(),
    target_grade_level_id: uuid,
    name: text,
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    birth_date: date.nullable().optional(),
    gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
    guardian_name: text,
    guardian_phone: z.string().trim().min(3).max(40),
  })
  .strict();
const reviewInput = z
  .object({
    stage: z.enum(["DOCUMENT", "TEST", "INTERVIEW", "FINAL"]),
    decision: z.enum(["PASSED", "FAILED", "NEEDS_REVISION"]),
    score: z.number().min(0).max(100).nullable().default(null),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
const documentInput = fileInput.extend({
  document_type: z.string().trim().min(1).max(80),
  access_token: z.string().min(32).max(200).optional(),
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const pageInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.string().trim().max(30).optional(),
  search: z.string().trim().max(100).default(""),
});

function admissionManager(req: AuthRequest) {
  allow(req.actor, "admission.write");
}

export async function createApplication(
  sql: Sql,
  tenantId: string,
  input: z.infer<typeof applicationInput>,
  requireOpen: boolean,
  familyAccountId: string | null = null,
) {
  const period = (
    await sql.query(
      `SELECT p.*,g.school_id AS grade_school_id,
       ((now() AT TIME ZONE 'Asia/Jakarta')::date BETWEEN p.starts_on AND p.ends_on) AS active_date
       FROM admission_periods p
       JOIN grade_levels g ON g.tenant_id=p.tenant_id AND g.id=$3
       WHERE p.tenant_id=$1 AND p.id=$2 FOR UPDATE`,
      [tenantId, input.period_id, input.target_grade_level_id],
    )
  ).rows[0];
  if (!period || period.grade_school_id !== period.school_id)
    throw new BadRequestException("Periode atau tingkat tujuan tidak sesuai");
  if (requireOpen && (period.status !== "OPEN" || !period.active_date))
    throw new ConflictException("Periode pendaftaran tidak sedang dibuka");
  const tracks = (
    await sql.query(
      `SELECT tr.*,(SELECT count(*) FROM applications a
       WHERE a.tenant_id=tr.tenant_id AND a.track_id=tr.id
       AND a.status NOT IN ('REJECTED','WITHDRAWN')) AS applications
       FROM admission_tracks tr WHERE tr.tenant_id=$1 AND tr.period_id=$2
       AND tr.active ORDER BY tr.name FOR UPDATE`,
      [tenantId, period.id],
    )
  ).rows;
  const track = input.track_id
    ? tracks.find((row) => row.id === input.track_id)
    : null;
  if (input.track_id && !track)
    throw new BadRequestException("Jalur PPDB tidak sesuai periode");
  if (requireOpen && tracks.length && !track)
    throw new BadRequestException("Jalur PPDB wajib dipilih");
  if (
    track &&
    track.capacity !== null &&
    Number(track.applications) >= Number(track.capacity)
  )
    throw new ConflictException("Kuota jalur PPDB sudah penuh");
  const applicant = (
    await sql.query(
      `INSERT INTO applicants(tenant_id,name,email,phone,address,birth_date,gender,guardian_name,guardian_phone)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tenantId,
        input.name,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.birth_date || null,
        input.gender || null,
        input.guardian_name,
        input.guardian_phone,
      ],
    )
  ).rows[0];
  const accessToken = randomBytes(32).toString("base64url");
  const registration = `PPDB-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const application = (
    await sql.query(
      `INSERT INTO applications(tenant_id,period_id,track_id,applicant_id,target_grade_level_id,registration_number,access_token_hash,family_account_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        tenantId,
        period.id,
        track?.id || null,
        applicant.id,
        input.target_grade_level_id,
        registration,
        digest(accessToken),
        familyAccountId,
      ],
    )
  ).rows[0];
  return { ...application, applicant, access_token: accessToken };
}

@Controller("api/v1/public/admissions")
export class PublicAdmissionsController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get(":tenant/periods") async periods(@Param("tenant") slug: string) {
    const rows = (
      await this.db.query(
        `SELECT p.id,p.name,p.starts_on,p.ends_on,p.capacity,y.name AS academic_year,
         COALESCE((SELECT json_agg(json_build_object('id',tr.id,'name',tr.name,'code',tr.code,'cost',tr.cost,'capacity',tr.capacity) ORDER BY tr.name) FROM admission_tracks tr WHERE tr.tenant_id=p.tenant_id AND tr.period_id=p.id AND tr.active),'[]') AS tracks,
         json_agg(json_build_object('id',g.id,'name',g.name) ORDER BY g.level) AS grade_levels
         FROM admission_periods p JOIN tenants t ON t.id=p.tenant_id
         JOIN academic_years y ON y.tenant_id=p.tenant_id AND y.id=p.academic_year_id
         JOIN grade_levels g ON g.tenant_id=p.tenant_id AND g.school_id=p.school_id
         WHERE t.slug=$1 AND t.status='ACTIVE' AND p.status='OPEN'
         AND (now() AT TIME ZONE 'Asia/Jakarta')::date BETWEEN p.starts_on AND p.ends_on
         GROUP BY p.id,y.name ORDER BY p.starts_on,p.name`,
        [slug.toLowerCase()],
      )
    ).rows;
    return { data: rows };
  }

  @Post(":tenant/applications") async apply(
    @Param("tenant") slug: string,
    @Body() body: unknown,
  ) {
    const tenant = (
      await this.db.query(
        "SELECT id FROM tenants WHERE slug=$1 AND status='ACTIVE'",
        [slug.toLowerCase()],
      )
    ).rows[0];
    if (!tenant) throw new NotFoundException("Sekolah tidak ditemukan");
    return this.db.transaction(tenant.id, (sql) =>
      createApplication(sql, tenant.id, applicationInput.parse(body), true),
    );
  }

  @Post(":tenant/applications/:id/status") async status(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const token = z
      .object({ access_token: z.string().min(32).max(200) })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        `SELECT a.id,a.registration_number,a.status,a.updated_at,a.enrolled_at,
         COALESCE((SELECT json_agg(json_build_object('document_type',d.document_type,'status',d.verification_status,'notes',d.notes) ORDER BY d.created_at) FROM application_documents d WHERE d.tenant_id=a.tenant_id AND d.application_id=a.id),'[]') AS documents
         FROM applications a JOIN tenants t ON t.id=a.tenant_id
         WHERE t.slug=$1 AND (a.id::text=$2 OR a.registration_number=$2) AND a.access_token_hash=$3`,
        [slug.toLowerCase(), id, digest(token.access_token)],
      )
    ).rows[0];
    if (!row)
      throw new NotFoundException("Pendaftaran atau kode akses tidak valid");
    return row;
  }

  @Post(":tenant/applications/:id/documents") async document(
    @Param("tenant") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    uuid.parse(id);
    const input = documentInput.parse(body);
    if (!input.access_token)
      throw new ForbiddenException("Kode akses pendaftaran diperlukan");
    const application = (
      await this.db.query(
        `SELECT a.*,t.slug FROM applications a JOIN tenants t ON t.id=a.tenant_id
         WHERE t.slug=$1 AND a.id=$2 AND a.access_token_hash=$3 AND a.status NOT IN ('REJECTED','ENROLLED','WITHDRAWN')`,
        [slug.toLowerCase(), id, digest(input.access_token)],
      )
    ).rows[0];
    if (!application)
      throw new NotFoundException(
        "Pendaftaran tidak ditemukan atau sudah ditutup",
      );
    const file = await saveManagedFile(
      this.db,
      application.tenant_id,
      null,
      "PPDB_DOCUMENT",
      input.document_type,
      input,
    );
    try {
      await this.db.transaction(application.tenant_id, async (sql) => {
        const previous = (
          await sql.query(
            "SELECT file_id FROM application_documents WHERE tenant_id=$1 AND application_id=$2 AND document_type=$3",
            [application.tenant_id, id, input.document_type],
          )
        ).rows[0];
        await sql.query(
          `INSERT INTO application_documents(tenant_id,application_id,file_id,document_type)
           VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,application_id,document_type)
           DO UPDATE SET file_id=EXCLUDED.file_id,verification_status='PENDING',notes=''`,
          [application.tenant_id, id, file.id, input.document_type],
        );
        await sql.query(
          "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'APPLICATION',$3)",
          [application.tenant_id, file.id, id],
        );
        if (previous)
          await sql.query(
            "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
            [application.tenant_id, previous.file_id],
          );
      });
      return file;
    } catch (error) {
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [application.tenant_id, file.id],
      );
      throw error;
    }
  }
}

@Controller("api/v1")
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get("admission-periods") async periods(@Req() req: AuthRequest) {
    allow(req.actor, "admission.read");
    return {
      data: (
        await this.db.query(
          `SELECT p.*,s.name AS school_name,y.name AS academic_year,
           (SELECT count(*)::integer FROM applications a WHERE a.tenant_id=p.tenant_id AND a.period_id=p.id) AS applications,
           (SELECT count(*)::integer FROM applications a WHERE a.tenant_id=p.tenant_id AND a.period_id=p.id AND a.status IN ('ACCEPTED','ENROLLED')) AS accepted
           FROM admission_periods p JOIN schools s ON s.tenant_id=p.tenant_id AND s.id=p.school_id
           JOIN academic_years y ON y.tenant_id=p.tenant_id AND y.id=p.academic_year_id
           WHERE p.tenant_id=$1 ORDER BY p.starts_on DESC,p.name`,
          [req.actor.tenant_id],
        )
      ).rows,
    };
  }

  @Get("admission-tracks") async tracks(
    @Req() req: AuthRequest,
    @Query("period_id") periodId?: string,
  ) {
    allow(req.actor, "admission.read");
    const parsed = periodId ? uuid.parse(periodId) : null;
    return {
      data: (
        await this.db.query(
          `SELECT tr.*,p.name AS period_name,
           (SELECT count(*)::integer FROM applications a WHERE a.tenant_id=tr.tenant_id AND a.track_id=tr.id) AS applications
           FROM admission_tracks tr JOIN admission_periods p
           ON p.tenant_id=tr.tenant_id AND p.id=tr.period_id
           WHERE tr.tenant_id=$1 AND ($2::uuid IS NULL OR tr.period_id=$2)
           ORDER BY p.starts_on DESC,tr.name`,
          [req.actor.tenant_id, parsed],
        )
      ).rows,
    };
  }

  @Post("admission-tracks") async addTrack(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    const input = z
      .object({
        period_id: uuid,
        name: text,
        code: z
          .string()
          .trim()
          .min(1)
          .max(30)
          .transform((value) => value.toUpperCase()),
        cost: z.number().min(0).max(1_000_000_000),
        capacity: z
          .number()
          .int()
          .positive()
          .max(100000)
          .nullable()
          .default(null),
      })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        `INSERT INTO admission_tracks(tenant_id,period_id,name,code,cost,capacity,created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(
          SELECT 1 FROM admission_periods WHERE tenant_id=$1 AND id=$2)
         RETURNING *`,
        [
          req.actor.tenant_id,
          input.period_id,
          input.name,
          input.code,
          input.cost,
          input.capacity,
          req.actor.id,
        ],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Periode PPDB tidak ditemukan");
    return row;
  }

  @Post("admission-periods") async addPeriod(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    const x = periodInput.parse(body);
    if (x.starts_on > x.ends_on)
      throw new BadRequestException("Tanggal periode tidak valid");
    return (
      (
        await this.db.query(
          `INSERT INTO admission_periods(tenant_id,school_id,academic_year_id,name,starts_on,ends_on,capacity,created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE EXISTS(
          SELECT 1 FROM academic_years y WHERE y.tenant_id=$1 AND y.id=$3 AND y.school_id=$2)
         RETURNING *`,
          [
            req.actor.tenant_id,
            x.school_id,
            x.academic_year_id,
            x.name,
            x.starts_on,
            x.ends_on,
            x.capacity,
            req.actor.id,
          ],
        )
      ).rows[0] ||
      (() => {
        throw new BadRequestException("Sekolah dan tahun ajaran tidak sesuai");
      })()
    );
  }

  @Patch("admission-periods/:id/status") async periodStatus(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    uuid.parse(id);
    const x = z
      .object({ status: z.enum(["DRAFT", "OPEN", "CLOSED"]) })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE admission_periods SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [req.actor.tenant_id, id, x.status],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Periode tidak ditemukan");
    return row;
  }

  @Post("admissions/applications") async addApplication(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    return this.db.transaction(req.actor.tenant_id, (sql) =>
      createApplication(
        sql,
        req.actor.tenant_id,
        applicationInput.parse(body),
        false,
      ),
    );
  }

  @Get("admissions/applications") async applications(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    allow(req.actor, "admission.read");
    const x = pageInput.parse(query),
      offset = (x.page - 1) * x.limit;
    const rows = (
      await this.db.query(
        `SELECT a.*,i.name,i.email,i.phone,i.guardian_name,i.guardian_phone,p.name AS period_name,g.name AS grade_name,tr.name AS track_name,tr.cost AS track_cost,
         count(*) OVER() AS _total,
         COALESCE((SELECT json_agg(json_build_object('id',d.id,'file_id',d.file_id,'document_type',d.document_type,'status',d.verification_status,'notes',d.notes) ORDER BY d.created_at) FROM application_documents d WHERE d.tenant_id=a.tenant_id AND d.application_id=a.id),'[]') AS documents,
         COALESCE((SELECT json_agg(json_build_object('stage',r.stage,'decision',r.decision,'score',r.score,'notes',r.notes,'reviewed_at',r.reviewed_at) ORDER BY r.reviewed_at) FROM application_reviews r WHERE r.tenant_id=a.tenant_id AND r.application_id=a.id),'[]') AS reviews
         FROM applications a JOIN applicants i ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id
         JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id
         JOIN grade_levels g ON g.tenant_id=a.tenant_id AND g.id=a.target_grade_level_id
         LEFT JOIN admission_tracks tr ON tr.tenant_id=a.tenant_id AND tr.id=a.track_id
         WHERE a.tenant_id=$1 AND ($2='' OR a.status=$2) AND ($3='' OR i.name ILIKE '%'||$3||'%' OR a.registration_number ILIKE '%'||$3||'%')
         ORDER BY a.submitted_at DESC LIMIT $4 OFFSET $5`,
        [req.actor.tenant_id, x.status || "", x.search, x.limit, offset],
      )
    ).rows;
    return {
      data: rows,
      total: rows.length ? Number(rows[0]._total) : 0,
      page: x.page,
      limit: x.limit,
    };
  }

  @Post("admissions/applications/:id/reviews") async review(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    uuid.parse(id);
    const x = reviewInput.parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const app = (
        await sql.query(
          "SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!app || ["ENROLLED", "WITHDRAWN"].includes(app.status))
        throw new ConflictException("Pendaftaran tidak dapat direview");
      const expected: Record<string, string[]> = {
        DOCUMENT: ["SUBMITTED", "DOCUMENT_REVIEW"],
        TEST: ["TEST"],
        INTERVIEW: ["INTERVIEW"],
      };
      if (x.stage !== "FINAL" && !expected[x.stage].includes(app.status))
        throw new ConflictException(
          "Tahap review tidak sesuai status pendaftaran",
        );
      if (x.stage === "DOCUMENT" && x.decision === "PASSED") {
        const documents = (
          await sql.query(
            "SELECT verification_status FROM application_documents WHERE tenant_id=$1 AND application_id=$2",
            [req.actor.tenant_id, id],
          )
        ).rows;
        if (
          !documents.length ||
          documents.some(
            (document) => document.verification_status !== "VERIFIED",
          )
        )
          throw new ConflictException(
            "Semua dokumen harus tersedia dan terverifikasi",
          );
      }
      let status = x.decision === "FAILED" ? "REJECTED" : app.status;
      if (x.decision === "NEEDS_REVISION")
        status = x.stage === "DOCUMENT" ? "DOCUMENT_REVIEW" : x.stage;
      if (x.decision === "PASSED")
        status =
          x.stage === "DOCUMENT"
            ? "TEST"
            : x.stage === "TEST"
              ? "INTERVIEW"
              : "ACCEPTED";
      if (status === "ACCEPTED") {
        const capacity = (
          await sql.query(
            `SELECT p.capacity,(SELECT count(*) FROM applications a WHERE a.tenant_id=p.tenant_id AND a.period_id=p.id AND a.status IN ('ACCEPTED','ENROLLED')) accepted FROM admission_periods p WHERE p.tenant_id=$1 AND p.id=$2 FOR UPDATE`,
            [req.actor.tenant_id, app.period_id],
          )
        ).rows[0];
        if (
          capacity?.capacity !== null &&
          Number(capacity.accepted) >= Number(capacity.capacity)
        )
          throw new ConflictException("Kapasitas penerimaan sudah penuh");
        if (app.track_id) {
          const trackCapacity = (
            await sql.query(
              `SELECT tr.capacity,(SELECT count(*) FROM applications a
               WHERE a.tenant_id=tr.tenant_id AND a.track_id=tr.id
               AND a.status IN ('ACCEPTED','ENROLLED')) accepted
               FROM admission_tracks tr WHERE tr.tenant_id=$1 AND tr.id=$2 FOR UPDATE`,
              [req.actor.tenant_id, app.track_id],
            )
          ).rows[0];
          if (
            trackCapacity &&
            trackCapacity.capacity !== null &&
            Number(trackCapacity.accepted) >= Number(trackCapacity.capacity)
          )
            throw new ConflictException("Kuota penerimaan jalur sudah penuh");
        }
      }
      const review = (
        await sql.query(
          `INSERT INTO application_reviews(tenant_id,application_id,stage,decision,score,notes,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            req.actor.tenant_id,
            id,
            x.stage,
            x.decision,
            x.score,
            x.notes,
            req.actor.id,
          ],
        )
      ).rows[0];
      await sql.query(
        "UPDATE applications SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id, status],
      );
      return { ...review, application_status: status };
    });
  }

  @Post("admissions/applications/:id/documents") async addDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    uuid.parse(id);
    const input = documentInput.omit({ access_token: true }).parse(body);
    const application = (
      await this.db.query(
        "SELECT id FROM applications WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('ENROLLED','WITHDRAWN')",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!application)
      throw new NotFoundException(
        "Pendaftaran tidak ditemukan atau sudah ditutup",
      );
    const file = await saveManagedFile(
      this.db,
      req.actor.tenant_id,
      req.actor.id,
      "PPDB_DOCUMENT",
      input.document_type,
      input,
    );
    try {
      await this.db.transaction(req.actor.tenant_id, async (sql) => {
        const previous = (
          await sql.query(
            "SELECT file_id FROM application_documents WHERE tenant_id=$1 AND application_id=$2 AND document_type=$3",
            [req.actor.tenant_id, id, input.document_type],
          )
        ).rows[0];
        await sql.query(
          `INSERT INTO application_documents(tenant_id,application_id,file_id,document_type)
           VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,application_id,document_type)
           DO UPDATE SET file_id=EXCLUDED.file_id,verification_status='PENDING',notes=''`,
          [req.actor.tenant_id, id, file.id, input.document_type],
        );
        await sql.query(
          "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'APPLICATION',$3)",
          [req.actor.tenant_id, file.id, id],
        );
        if (previous)
          await sql.query(
            "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
            [req.actor.tenant_id, previous.file_id],
          );
      });
      return file;
    } catch (error) {
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, file.id],
      );
      throw error;
    }
  }

  @Patch("admissions/documents/:id") async verifyDocument(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    uuid.parse(id);
    const x = z
      .object({
        status: z.enum(["VERIFIED", "REJECTED"]),
        notes: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE application_documents SET verification_status=$3,notes=$4 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [req.actor.tenant_id, id, x.status, x.notes],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Dokumen tidak ditemukan");
    return row;
  }

  @Post("admissions/applications/:id/enroll") async enroll(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    admissionManager(req);
    uuid.parse(id);
    const x = z
      .object({
        nis: z.string().trim().min(1).max(50),
        class_id: uuid.nullable().default(null),
      })
      .strict()
      .parse(body);
    return this.db.transaction(req.actor.tenant_id, async (sql) => {
      const app = (
        await sql.query(
          `SELECT a.*,i.name,i.email,i.phone,i.address,i.birth_date,i.gender,p.academic_year_id FROM applications a JOIN applicants i ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`,
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!app || app.status !== "ACCEPTED" || app.student_id)
        throw new ConflictException(
          "Hanya pendaftar diterima yang dapat menjadi siswa",
        );
      if (x.class_id) {
        const valid = (
          await sql.query(
            "SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$2 AND academic_year_id=$3 AND grade_level_id=$4",
            [
              req.actor.tenant_id,
              x.class_id,
              app.academic_year_id,
              app.target_grade_level_id,
            ],
          )
        ).rows[0];
        if (!valid)
          throw new BadRequestException(
            "Kelas tidak sesuai tahun ajaran atau tingkat tujuan",
          );
      }
      const student = (
        await sql.query(
          `INSERT INTO students(tenant_id,nis,name,email,phone,address,birth_date,gender) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            req.actor.tenant_id,
            x.nis,
            app.name,
            app.email,
            app.phone,
            app.address,
            app.birth_date,
            app.gender,
          ],
        )
      ).rows[0];
      if (app.family_account_id) {
        const parent = (
          await sql.query(
            `SELECT p.id FROM parents p JOIN users u
             ON u.tenant_id=p.tenant_id AND u.id=p.user_id
             WHERE p.tenant_id=$1 AND u.account_id=$2 LIMIT 1`,
            [req.actor.tenant_id, app.family_account_id],
          )
        ).rows[0];
        if (parent)
          await sql.query(
            `INSERT INTO student_guardians(tenant_id,student_id,parent_id,relationship,is_primary)
             VALUES($1,$2,$3,'GUARDIAN',true) ON CONFLICT DO NOTHING`,
            [req.actor.tenant_id, student.id, parent.id],
          );
      }
      if (x.class_id)
        await sql.query(
          "INSERT INTO class_students(tenant_id,class_id,student_id,academic_year_id) VALUES($1,$2,$3,$4)",
          [req.actor.tenant_id, x.class_id, student.id, app.academic_year_id],
        );
      await sql.query(
        "UPDATE applications SET status='ENROLLED',student_id=$3,enrolled_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [req.actor.tenant_id, id, student.id],
      );
      return student;
    });
  }
}

@Controller("api/v1/files")
@UseGuards(AuthGuard)
export class FilesController {
  constructor(@Inject(Database) private readonly db: Database) {}

  @Get() async list(
    @Req() req: AuthRequest,
    @Query() query: Record<string, unknown>,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "file.read");
    const x = pageInput
      .extend({
        category: z.enum(fileCategories).optional(),
        deleted: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .default("false"),
      })
      .parse(query);
    const offset = (x.page - 1) * x.limit;
    const rows = (
      await this.db.query(
        `SELECT f.id,f.category,f.file_name,f.mime_type,f.size_bytes,f.description,f.created_at,f.deleted_at,f.uploaded_by,count(*) OVER() AS _total,
      COALESCE((SELECT json_agg(json_build_object('entity_type',l.entity_type,'entity_id',l.entity_id)) FROM file_links l WHERE l.tenant_id=f.tenant_id AND l.file_id=f.id),'[]') AS links
      FROM managed_files f WHERE f.tenant_id=$1 AND ($2='' OR f.category=$2) AND ($3='' OR f.file_name ILIKE '%'||$3||'%' OR f.description ILIKE '%'||$3||'%') AND (($4 AND f.deleted_at IS NOT NULL) OR (NOT $4 AND f.deleted_at IS NULL))
      ORDER BY f.created_at DESC LIMIT $5 OFFSET $6`,
        [
          req.actor.tenant_id,
          x.category || "",
          x.search,
          x.deleted,
          x.limit,
          offset,
        ],
      )
    ).rows;
    return {
      data: rows,
      total: rows.length ? Number(rows[0]._total) : 0,
      page: x.page,
      limit: x.limit,
    };
  }

  @Post() async upload(@Req() req: AuthRequest, @Body() body: unknown) {
    allowOperational(req.actor);
    allow(req.actor, "file.create");
    const x = fileInput
      .extend({
        category: z.enum(fileCategories),
        description: z.string().trim().max(1000).default(""),
        entity_type: z
          .enum([
            "STUDENT",
            "APPLICANT",
            "APPLICATION",
            "SCHOOL",
            "WEBSITE",
            "REPORT_CARD",
          ])
          .optional(),
        entity_id: uuid.optional(),
      })
      .refine(
        (v) => Boolean(v.entity_type) === Boolean(v.entity_id),
        "Jenis dan ID tautan harus diisi bersama",
      )
      .parse(body);
    if (x.entity_type && x.entity_id)
      await this.assertEntity(req.actor.tenant_id, x.entity_type, x.entity_id);
    const file = await saveManagedFile(
      this.db,
      req.actor.tenant_id,
      req.actor.id,
      x.category,
      x.description,
      x,
    );
    if (x.entity_type)
      await this.db.query(
        "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,$3,$4)",
        [req.actor.tenant_id, file.id, x.entity_type, x.entity_id],
      );
    return file;
  }

  @Get(":id/download") async download(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "file.read");
    uuid.parse(id);
    const row = (
      await this.db.query(
        "SELECT * FROM managed_files WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas tidak ditemukan");
    let bytes: Buffer;
    try {
      bytes = await readManagedFile(row.storage_key, row.storage_provider);
      if (
        bytes.length !== row.size_bytes ||
        createHash("sha256").update(bytes).digest("hex") !== row.sha256
      )
        throw new Error("Checksum berkas tidak sesuai");
    } catch {
      throw new NotFoundException("Isi berkas tidak ditemukan");
    }
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="file-${id}.${row.mime_type === "application/pdf" ? "pdf" : row.mime_type === "image/png" ? "png" : "jpg"}"`,
    );
    res.send(bytes);
  }

  @Patch(":id") async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "file.update");
    uuid.parse(id);
    const x = z
      .object({
        category: z.enum(fileCategories),
        description: z.string().trim().max(1000),
      })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE managed_files SET category=$3,description=$4 WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id,category,description",
        [req.actor.tenant_id, id, x.category, x.description],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas tidak ditemukan");
    return row;
  }

  @Delete(":id") async remove(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "file.delete");
    uuid.parse(id);
    const used = (
      await this.db.query(
        "SELECT 1 FROM application_documents WHERE tenant_id=$1 AND file_id=$2 UNION ALL SELECT 1 FROM payment_proofs WHERE tenant_id=$1 AND id=$2 LIMIT 1",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (used)
      throw new ConflictException(
        "Berkas transaksi atau PPDB tidak dapat dihapus",
      );
    const row = (
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas tidak ditemukan");
    return { id, deleted: true };
  }

  @Post(":id/restore") async restore(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    allowOperational(req.actor);
    allow(req.actor, "file.update");
    uuid.parse(id);
    const row = (
      await this.db.query(
        "UPDATE managed_files SET deleted_at=NULL WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NOT NULL RETURNING id",
        [req.actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas terhapus tidak ditemukan");
    return { id, restored: true };
  }

  private async assertEntity(tenantId: string, type: string, id: string) {
    const tables: Record<string, string> = {
      STUDENT: "students",
      APPLICANT: "applicants",
      APPLICATION: "applications",
      SCHOOL: "schools",
      REPORT_CARD: "report_cards",
    };
    if (type === "WEBSITE") return;
    const table = tables[type];
    if (
      !table ||
      !(
        await this.db.query(
          `SELECT 1 FROM ${table} WHERE tenant_id=$1 AND id=$2`,
          [tenantId, id],
        )
      ).rows[0]
    )
      throw new BadRequestException(
        "Entitas tautan tidak ditemukan pada sekolah ini",
      );
  }
}
