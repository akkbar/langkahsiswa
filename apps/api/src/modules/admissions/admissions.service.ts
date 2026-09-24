import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import {
  fileCategories,
  fileInput,
  readManagedFile,
  saveManagedFile,
} from "../../common/storage/file-storage";
import { Database, type Sql } from "../../database/database.service";
import { allow, allowOperational } from "../auth/permissions";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isIsoCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
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
  period_id: uuid.optional(),
  track_id: uuid.optional(),
  search: z.string().trim().max(100).default(""),
});

function applicationSelect() {
  return `SELECT a.*,i.name AS applicant_name,i.email AS applicant_email,i.phone AS applicant_phone,
    i.address,i.birth_date,i.gender,i.guardian_name,i.guardian_phone,
    p.name AS period_name,g.name AS grade_name,tr.name AS track_name,tr.cost AS track_cost,
    count(*) OVER() AS _total,
    COALESCE((SELECT json_agg(json_build_object('id',d.id,'file_id',d.file_id,'document_type',d.document_type,'status',d.verification_status,'notes',d.notes) ORDER BY d.created_at) FROM application_documents d WHERE d.tenant_id=a.tenant_id AND d.application_id=a.id),'[]') AS documents,
    COALESCE((SELECT json_agg(json_build_object('stage',r.stage,'decision',r.decision,'score',r.score,'notes',r.notes,'reviewed_by',r.reviewed_by,'reviewed_at',r.reviewed_at) ORDER BY r.reviewed_at) FROM application_reviews r WHERE r.tenant_id=a.tenant_id AND r.application_id=a.id),'[]') AS reviews
    FROM applications a JOIN applicants i ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id
    JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id
    JOIN grade_levels g ON g.tenant_id=a.tenant_id AND g.id=a.target_grade_level_id
    LEFT JOIN admission_tracks tr ON tr.tenant_id=a.tenant_id AND tr.id=a.track_id`;
}

function admissionManager(actor: Actor) {
  allow(actor, "admission.write");
}

function admissionPermission(actor: Actor, permission: string) {
  allow(actor, permission);
}

async function requireApplicationAccess(
  db: Database,
  actor: Actor,
  applicationId: string,
  permission: string,
) {
  const application = (await db.query(
    `SELECT * FROM applications WHERE tenant_id=$1 AND id=$2`,
    [actor.tenant_id, applicationId],
  )).rows[0];
  if (!application) throw new NotFoundException("Pendaftaran tidak ditemukan");
  if (actor.account_level === "FAMILY") {
    if (application.family_account_id !== actor.account_id)
      throw new ForbiddenException("Pendaftaran bukan milik akun keluarga ini");
  } else {
    allowOperational(actor);
    allow(actor, permission);
  }
  return application;
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

@Injectable()
export class PublicAdmissionsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async periods(slug: string) {
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
  async apply(slug: string, body: unknown) {
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
  async status(slug: string, id: string, body: unknown) {
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
  async document(slug: string, id: string, body: unknown) {
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

  async getForm(slug: string, periodId: string) {
    const tenant = (
      await this.db.query(
        "SELECT id FROM tenants WHERE slug=$1 AND status='ACTIVE'",
        [slug.toLowerCase()],
      )
    ).rows[0];
    if (!tenant) throw new NotFoundException("Sekolah tidak ditemukan");
    const period = (
      await this.db.query(
        `SELECT * FROM admission_periods WHERE tenant_id=$1 AND id=$2 AND status='OPEN'`,
        [tenant.id, periodId],
      )
    ).rows[0];
    if (!period)
      throw new NotFoundException(
        "Periode PPDB tidak ditemukan atau sudah tutup",
      );
    const sections = (
      await this.db.query(
        `SELECT * FROM admission_form_sections WHERE tenant_id=$1 AND period_id=$2 ORDER BY order_index`,
        [tenant.id, periodId],
      )
    ).rows;
    const sectionIds = sections.map((s) => s.id);
    const fields = sectionIds.length
      ? (
          await this.db.query(
            `SELECT * FROM admission_form_fields WHERE tenant_id=$1 AND section_id = ANY($2) ORDER BY order_index`,
            [tenant.id, sectionIds],
          )
        ).rows
      : [];
    const fieldsBySection: Record<string, typeof fields> = {};
    for (const f of fields) {
      (fieldsBySection[f.section_id] ||= []).push(f);
    }
    const sectionsWithFields = sections.map((s) => ({
      ...s,
      fields: fieldsBySection[s.id] || [],
    }));
    return { period, sections: sectionsWithFields };
  }
}

@Injectable()
export class AdmissionsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async periods(actor: Actor) {
    allow(actor, "admission.read");
    return {
      data: (
        await this.db.query(
          `SELECT p.*,s.name AS school_name,y.name AS academic_year,
           (SELECT count(*)::integer FROM applications a WHERE a.tenant_id=p.tenant_id AND a.period_id=p.id) AS applications,
           (SELECT count(*)::integer FROM applications a WHERE a.tenant_id=p.tenant_id AND a.period_id=p.id AND a.status IN ('ACCEPTED','ENROLLED')) AS accepted
           FROM admission_periods p JOIN schools s ON s.tenant_id=p.tenant_id AND s.id=p.school_id
           JOIN academic_years y ON y.tenant_id=p.tenant_id AND y.id=p.academic_year_id
           WHERE p.tenant_id=$1 ORDER BY p.starts_on DESC,p.name`,
          [actor.tenant_id],
        )
      ).rows,
    };
  }
  async tracks(actor: Actor, periodId?: string) {
    allow(actor, "admission.read");
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
          [actor.tenant_id, parsed],
        )
      ).rows,
    };
  }
  async addTrack(actor: Actor, body: unknown) {
    admissionManager(actor);
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
        cost: z.number().min(0).max(1000000000),
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
          actor.tenant_id,
          input.period_id,
          input.name,
          input.code,
          input.cost,
          input.capacity,
          actor.id,
        ],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Periode PPDB tidak ditemukan");
    return row;
  }
  async addPeriod(actor: Actor, body: unknown) {
    admissionManager(actor);
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
            actor.tenant_id,
            x.school_id,
            x.academic_year_id,
            x.name,
            x.starts_on,
            x.ends_on,
            x.capacity,
            actor.id,
          ],
        )
      ).rows[0] ||
      (() => {
        throw new BadRequestException("Sekolah dan tahun ajaran tidak sesuai");
      })()
    );
  }
  async periodStatus(actor: Actor, id: string, body: unknown) {
    admissionManager(actor);
    uuid.parse(id);
    const x = z
      .object({ status: z.enum(["DRAFT", "OPEN", "CLOSED"]) })
      .strict()
      .parse(body);
    const row = (
      await this.db.query(
        "UPDATE admission_periods SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [actor.tenant_id, id, x.status],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Periode tidak ditemukan");
    return row;
  }
  async addApplication(actor: Actor, body: unknown) {
    admissionManager(actor);
    return this.db.transaction(actor.tenant_id, (sql) =>
      createApplication(
        sql,
        actor.tenant_id,
        applicationInput.parse(body),
        false,
      ),
    );
  }
  async applications(actor: Actor, query: Record<string, unknown>) {
    allow(actor, "admission.read");
    const x = pageInput.parse(query),
      offset = (x.page - 1) * x.limit;
    const rows = (
      await this.db.query(
        `${applicationSelect()}
         WHERE a.tenant_id=$1
           AND ($2='' OR a.status=$2)
           AND ($3::uuid IS NULL OR a.period_id=$3)
           AND ($4::uuid IS NULL OR a.track_id=$4)
           AND ($5='' OR i.name ILIKE '%'||$5||'%' OR a.registration_number ILIKE '%'||$5||'%')
         ORDER BY a.submitted_at DESC LIMIT $6 OFFSET $7`,
        [
          actor.tenant_id,
          x.status || "",
          x.period_id || null,
          x.track_id || null,
          x.search,
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
  async application(actor: Actor, id: string) {
    allow(actor, "admission.read");
    uuid.parse(id);
    const row = (
      await this.db.query(
        `${applicationSelect()} WHERE a.tenant_id=$1 AND a.id=$2`,
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Pendaftaran tidak ditemukan");
    return row;
  }
  async applicationDocuments(actor: Actor, id: string) {
    allow(actor, "admission.read");
    uuid.parse(id);
    return {
      data: (
        await this.db.query(
          `SELECT d.*,f.file_name AS name,f.mime_type,f.size_bytes
           FROM application_documents d
           JOIN managed_files f ON f.tenant_id=d.tenant_id AND f.id=d.file_id
           WHERE d.tenant_id=$1 AND d.application_id=$2 AND f.deleted_at IS NULL
           ORDER BY d.created_at`,
          [actor.tenant_id, id],
        )
      ).rows,
    };
  }
  async review(actor: Actor, id: string, body: unknown) {
    uuid.parse(id);
    const x = reviewInput.parse(body);
    admissionPermission(
      actor,
      x.decision === "FAILED" ? "admission.reject" : "admission.verify",
    );
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const app = (
        await sql.query(
          "SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, id],
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
            [actor.tenant_id, id],
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
            [actor.tenant_id, app.period_id],
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
              [actor.tenant_id, app.track_id],
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
            actor.tenant_id,
            id,
            x.stage,
            x.decision,
            x.score,
            x.notes,
            actor.id,
          ],
        )
      ).rows[0];
      await sql.query(
        "UPDATE applications SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, id, status],
      );
      return { ...review, application_status: status };
    });
  }
  async selectionCriteria(actor: Actor, periodId: string, trackId?: string) {
    allow(actor, "admission.read");
    uuid.parse(periodId);
    const parsedTrackId = trackId ? uuid.parse(trackId) : null;
    return {
      data: (
        await this.db.query(
          `SELECT * FROM admission_selection_criteria
           WHERE tenant_id=$1 AND period_id=$2 AND track_id IS NOT DISTINCT FROM $3
           ORDER BY source_stage`,
          [actor.tenant_id, periodId, parsedTrackId],
        )
      ).rows,
    };
  }
  async saveSelectionCriteria(actor: Actor, body: unknown) {
    admissionPermission(actor, "admission.selection.run");
    const input = z
      .object({
        period_id: uuid,
        track_id: uuid.nullable().optional(),
        criteria: z
          .array(
            z.object({
              source_stage: z.enum(["DOCUMENT", "TEST", "INTERVIEW"]),
              name: text,
              weight: z.number().positive().max(100),
              minimum_score: z.number().min(0).max(100).nullable().optional(),
            }),
          )
          .min(1)
          .max(3),
      })
      .strict()
      .parse(body);
    const stages = new Set(input.criteria.map((criterion) => criterion.source_stage));
    if (stages.size !== input.criteria.length)
      throw new BadRequestException("Setiap tahap hanya boleh memiliki satu kriteria");
    const track = input.track_id
      ? (
          await this.db.query(
            `SELECT id FROM admission_tracks WHERE tenant_id=$1 AND id=$2 AND period_id=$3`,
            [actor.tenant_id, input.track_id, input.period_id],
          )
        ).rows[0]
      : null;
    if (input.track_id && !track)
      throw new BadRequestException("Jalur PPDB tidak sesuai periode");
    return this.db.transaction(actor.tenant_id, async (sql) => {
      await sql.query(
        `DELETE FROM admission_selection_criteria
         WHERE tenant_id=$1 AND period_id=$2 AND track_id IS NOT DISTINCT FROM $3`,
        [actor.tenant_id, input.period_id, input.track_id || null],
      );
      const rows = [];
      for (const criterion of input.criteria) {
        rows.push(
          (
            await sql.query(
              `INSERT INTO admission_selection_criteria(tenant_id,period_id,track_id,name,source_stage,weight,minimum_score)
               VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
              [
                actor.tenant_id,
                input.period_id,
                input.track_id || null,
                criterion.name,
                criterion.source_stage,
                criterion.weight,
                criterion.minimum_score ?? null,
              ],
            )
          ).rows[0],
        );
      }
      return { data: rows };
    });
  }
  async runSelection(actor: Actor, body: unknown) {
    admissionPermission(actor, "admission.selection.run");
    const input = z
      .object({
        period_id: uuid,
        track_id: uuid.nullable().optional(),
        publish: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    if (input.publish) admissionPermission(actor, "admission.selection.publish");
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const period = (
        await sql.query(
          "SELECT capacity FROM admission_periods WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [actor.tenant_id, input.period_id],
        )
      ).rows[0];
      if (!period) throw new NotFoundException("Periode PPDB tidak ditemukan");
      const track = input.track_id
        ? (
            await sql.query(
              `SELECT capacity FROM admission_tracks
               WHERE tenant_id=$1 AND id=$2 AND period_id=$3 FOR UPDATE`,
              [actor.tenant_id, input.track_id, input.period_id],
            )
          ).rows[0]
        : null;
      if (input.track_id && !track)
        throw new BadRequestException("Jalur PPDB tidak sesuai periode");
      const criteria = (
        await sql.query(
          `SELECT source_stage,weight,minimum_score FROM admission_selection_criteria
           WHERE tenant_id=$1 AND period_id=$2 AND track_id IS NOT DISTINCT FROM $3
             AND is_active=true ORDER BY source_stage`,
          [actor.tenant_id, input.period_id, input.track_id || null],
        )
      ).rows;
      if (!criteria.length)
        throw new ConflictException("Kriteria seleksi aktif belum dikonfigurasi");
      if (!input.track_id) {
        const tracks = (
          await sql.query(
            `SELECT 1 FROM admission_tracks
             WHERE tenant_id=$1 AND period_id=$2 AND active=true LIMIT 1`,
            [actor.tenant_id, input.period_id],
          )
        ).rows;
        if (tracks.length)
          throw new BadRequestException(
            "Pilih jalur PPDB agar kuota seleksi diterapkan per jalur",
          );
      }
      const totalWeight = criteria.reduce(
        (total, criterion) => total + Number(criterion.weight),
        0,
      );
      const applications = (
        await sql.query(
          `SELECT id,submitted_at FROM applications
           WHERE tenant_id=$1 AND period_id=$2
             AND ($3::uuid IS NULL OR track_id=$3)
             AND status IN ('TEST','INTERVIEW') FOR UPDATE`,
          [actor.tenant_id, input.period_id, input.track_id || null],
        )
      ).rows;
      const periodOccupied = Number(
        (
          await sql.query(
            `SELECT count(*) AS total FROM applications
             WHERE tenant_id=$1 AND period_id=$2
               AND status IN ('ACCEPTED','ENROLLED')`,
            [actor.tenant_id, input.period_id],
          )
        ).rows[0].total,
      );
      const trackOccupied = input.track_id
        ? Number(
            (
              await sql.query(
                `SELECT count(*) AS total FROM applications
                 WHERE tenant_id=$1 AND period_id=$2 AND track_id=$3
                   AND status IN ('ACCEPTED','ENROLLED')`,
                [actor.tenant_id, input.period_id, input.track_id],
              )
            ).rows[0].total,
          )
        : 0;
      const eligible: Array<{ id: string; score: number; submitted_at: string }> = [];
      const rejected: Array<{ id: string; notes: string }> = [];
      for (const application of applications) {
        const reviews = (
          await sql.query(
            `SELECT DISTINCT ON (stage) stage,decision,score FROM application_reviews
             WHERE tenant_id=$1 AND application_id=$2
             ORDER BY stage,reviewed_at DESC,id DESC`,
            [actor.tenant_id, application.id],
          )
        ).rows;
        const scores = new Map(reviews.map((review) => [review.stage, review]));
        let weightedScore = 0;
        let reason = "";
        for (const criterion of criteria) {
          const latestReview = scores.get(criterion.source_stage);
          if (!latestReview || latestReview.decision !== "PASSED") {
            reason = `Review ${criterion.source_stage} belum lulus`;
            break;
          }
          const score = latestReview.score;
          if (score === null || score === undefined) {
            reason = `Nilai ${criterion.source_stage} belum tersedia`;
            break;
          }
          if (
            criterion.minimum_score !== null &&
            Number(score) < Number(criterion.minimum_score)
          ) {
            reason = `Nilai ${criterion.source_stage} di bawah batas minimum`;
            break;
          }
          weightedScore += Number(score) * Number(criterion.weight);
        }
        if (reason) rejected.push({ id: application.id, notes: reason });
        else
          eligible.push({
            id: application.id,
            score: weightedScore / totalWeight,
            submitted_at: application.submitted_at,
          });
      }
      eligible.sort(
        (left, right) =>
          right.score - left.score ||
          String(left.submitted_at).localeCompare(String(right.submitted_at)) ||
          left.id.localeCompare(right.id),
      );
      const trackAvailableCapacity =
        track?.capacity === null || track?.capacity === undefined
          ? null
          : Math.max(0, Number(track.capacity) - trackOccupied);
      const periodAvailableCapacity =
        period.capacity === null
          ? null
          : Math.max(0, Number(period.capacity) - periodOccupied);
      const availableCapacity =
        trackAvailableCapacity === null
          ? periodAvailableCapacity
          : periodAvailableCapacity === null
            ? trackAvailableCapacity
            : Math.min(trackAvailableCapacity, periodAvailableCapacity);
      for (const [index, application] of eligible.entries()) {
        const rank = index + 1;
        const selectionStatus =
          availableCapacity === null || index < availableCapacity
            ? "SELECTED"
            : "WAITING_LIST";
        await sql.query(
          `UPDATE applications SET selection_score=$3,selection_rank=$4,selection_status=$5,
             selection_notes='',selected_by=$6,selected_at=now(),updated_at=now()
           WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, application.id, application.score, rank, selectionStatus, actor.id],
        );
        if (input.publish)
          await sql.query(
            `UPDATE applications SET status=$3,updated_at=now()
             WHERE tenant_id=$1 AND id=$2 AND status <> 'ENROLLED'`,
            [actor.tenant_id, application.id, selectionStatus === "SELECTED" ? "ACCEPTED" : "INTERVIEW"],
          );
      }
      for (const application of rejected) {
        await sql.query(
          `UPDATE applications SET selection_score=NULL,selection_rank=NULL,selection_status='NOT_SELECTED',
             selection_notes=$3,selected_by=$4,selected_at=now(),updated_at=now()
           WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, application.id, application.notes, actor.id],
        );
        if (input.publish)
          await sql.query(
            "UPDATE applications SET status='REJECTED',updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [actor.tenant_id, application.id],
          );
      }
      return {
        processed: applications.length,
        selected: eligible.filter(
          (_, index) => availableCapacity === null || index < availableCapacity,
        ).length,
        waiting_list: eligible.filter(
          (_, index) => availableCapacity !== null && index >= availableCapacity,
        ).length,
        not_selected: rejected.length,
        published: input.publish,
      };
    });
  }
  async addDocument(actor: Actor, id: string, body: unknown) {
    admissionManager(actor);
    uuid.parse(id);
    const input = documentInput.omit({ access_token: true }).parse(body);
    const application = (
      await this.db.query(
        "SELECT id FROM applications WHERE tenant_id=$1 AND id=$2 AND status NOT IN ('ENROLLED','WITHDRAWN')",
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (!application)
      throw new NotFoundException(
        "Pendaftaran tidak ditemukan atau sudah ditutup",
      );
    const file = await saveManagedFile(
      this.db,
      actor.tenant_id,
      actor.id,
      "PPDB_DOCUMENT",
      input.document_type,
      input,
    );
    try {
      await this.db.transaction(actor.tenant_id, async (sql) => {
        const previous = (
          await sql.query(
            "SELECT file_id FROM application_documents WHERE tenant_id=$1 AND application_id=$2 AND document_type=$3",
            [actor.tenant_id, id, input.document_type],
          )
        ).rows[0];
        await sql.query(
          `INSERT INTO application_documents(tenant_id,application_id,file_id,document_type)
           VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,application_id,document_type)
           DO UPDATE SET file_id=EXCLUDED.file_id,verification_status='PENDING',notes=''`,
          [actor.tenant_id, id, file.id, input.document_type],
        );
        await sql.query(
          "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'APPLICATION',$3)",
          [actor.tenant_id, file.id, id],
        );
        if (previous)
          await sql.query(
            "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
            [actor.tenant_id, previous.file_id],
          );
      });
      return file;
    } catch (error) {
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, file.id],
      );
      throw error;
    }
  }
  async verifyDocument(actor: Actor, id: string, body: unknown) {
    admissionManager(actor);
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
        [actor.tenant_id, id, x.status, x.notes],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Dokumen tidak ditemukan");
    return row;
  }
  async reRegister(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.reregistration");
    uuid.parse(id);
    const input = z.object({
      nis: z.string().trim().min(1).max(50),
      class_id: uuid.nullable().default(null),
      final_program: z.string().trim().max(200).default(""),
      parent_confirmed: z.literal(true),
      documents: z.record(z.any()).default({}),
      notes: z.string().trim().max(2000).default(""),
    }).strict().parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const app = (await sql.query(
        `SELECT a.*,i.name,i.email,i.phone,i.address,i.birth_date,i.gender,p.academic_year_id
         FROM applications a JOIN applicants i ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id
         JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id
         WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`, [actor.tenant_id, id],
      )).rows[0];
      if (!app) throw new ConflictException("Hanya pendaftar diterima yang dapat daftar ulang");
      const existingRegistration = (await sql.query(
        `SELECT * FROM admission_re_registrations
         WHERE tenant_id=$1 AND application_id=$2`,
        [actor.tenant_id, id],
      )).rows[0];
      if (existingRegistration) {
        const student = (await sql.query(
          `SELECT * FROM students WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, existingRegistration.student_id],
        )).rows[0];
        if (!student)
          throw new ConflictException("Siswa daftar ulang tidak ditemukan");
        return { re_registration: existingRegistration, student };
      }
      if (app.status !== "ACCEPTED")
        throw new ConflictException("Hanya pendaftar diterima yang dapat daftar ulang");
      const missingRequiredDocument = (await sql.query(
        `SELECT 1
         FROM admission_form_fields f
         JOIN admission_form_sections s ON s.tenant_id=f.tenant_id AND s.id=f.section_id
         LEFT JOIN application_documents d ON d.tenant_id=f.tenant_id
          AND d.application_id=$2 AND d.document_type=f.field_key
         WHERE f.tenant_id=$1 AND s.period_id=$3 AND f.field_type='FILE_UPLOAD'
          AND f.is_required AND (d.id IS NULL OR d.verification_status <> 'VERIFIED')
         LIMIT 1`,
        [actor.tenant_id, id, app.period_id],
      )).rows[0];
      if (missingRequiredDocument)
        throw new ConflictException("Dokumen wajib belum diverifikasi lengkap");
      const unpaid = (await sql.query(
        `SELECT 1 FROM admission_payment_schemes ps WHERE ps.tenant_id=$1 AND ps.track_id=$2
         AND ps.is_required AND ps.is_active AND (
           SELECT count(DISTINCT ap.installment_number) FROM admission_payments ap
           WHERE ap.tenant_id=ps.tenant_id AND ap.application_id=$3
             AND ap.payment_scheme_id=ps.id AND ap.status='PAID'
             AND ap.installment_number BETWEEN 1 AND ps.installment_count
         ) < ps.installment_count LIMIT 1`,
        [actor.tenant_id, app.track_id, id],
      )).rows[0];
      if (unpaid) throw new ConflictException("Pembayaran wajib belum lunas");
      if (input.class_id && !(await sql.query(
        "SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$2 AND academic_year_id=$3 AND grade_level_id=$4",
        [actor.tenant_id, input.class_id, app.academic_year_id, app.target_grade_level_id],
      )).rows[0]) throw new BadRequestException("Kelas tidak sesuai tahun ajaran atau tingkat tujuan");
      const student = app.student_id ? (await sql.query(
        "SELECT * FROM students WHERE tenant_id=$1 AND id=$2", [actor.tenant_id, app.student_id],
      )).rows[0] : (await sql.query(
        `INSERT INTO students(tenant_id,nis,name,email,phone,address,birth_date,gender)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [actor.tenant_id,input.nis,app.name,app.email,app.phone,app.address,app.birth_date,app.gender],
      )).rows[0];
      if (!student) throw new ConflictException("Siswa pendaftaran tidak ditemukan");
      if (app.family_account_id) {
        const parent = (await sql.query(
          `SELECT p.id FROM parents p JOIN users u
           ON u.tenant_id=p.tenant_id AND u.id=p.user_id
           WHERE p.tenant_id=$1 AND u.account_id=$2 LIMIT 1`,
          [actor.tenant_id, app.family_account_id],
        )).rows[0];
        if (parent)
          await sql.query(
            `INSERT INTO student_guardians(tenant_id,student_id,parent_id,relationship,is_primary)
             VALUES($1,$2,$3,'GUARDIAN',true) ON CONFLICT DO NOTHING`,
            [actor.tenant_id, student.id, parent.id],
          );
      }
      if (input.class_id) await sql.query(
        `INSERT INTO class_students(tenant_id,class_id,student_id,academic_year_id) VALUES($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`, [actor.tenant_id,input.class_id,student.id,app.academic_year_id],
      );
      const registration = (await sql.query(
        `INSERT INTO admission_re_registrations(tenant_id,application_id,student_id,final_program,final_class_id,parent_confirmed,documents,notes,status,completed_by)
         VALUES($1,$2,$3,$4,$5,true,$6,$7,'COMPLETED',$8) RETURNING *`,
        [actor.tenant_id,id,student.id,input.final_program,input.class_id,JSON.stringify(input.documents),input.notes,actor.id],
      )).rows[0];
      await sql.query("UPDATE applications SET status='ENROLLED',student_id=$3,enrolled_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2", [actor.tenant_id,id,student.id]);
      return { re_registration: registration, student };
    });
  }
  async enroll(_actor: Actor, _id: string, _body: unknown): Promise<never> {
    throw new ConflictException(
      "Enrollment langsung telah dihentikan; gunakan daftar ulang",
    );
  }
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  async list(actor: Actor, query: Record<string, unknown>) {
    allowOperational(actor);
    allow(actor, "file.read");
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
          actor.tenant_id,
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
  async upload(actor: Actor, body: unknown) {
    allowOperational(actor);
    allow(actor, "file.create");
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
      await this.assertEntity(actor.tenant_id, x.entity_type, x.entity_id);
    const file = await saveManagedFile(
      this.db,
      actor.tenant_id,
      actor.id,
      x.category,
      x.description,
      x,
    );
    if (x.entity_type)
      await this.db.query(
        "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,$3,$4)",
        [actor.tenant_id, file.id, x.entity_type, x.entity_id],
      );
    return file;
  }
  async download(actor: Actor, id: string, res: Response) {
    allowOperational(actor);
    allow(actor, "file.read");
    uuid.parse(id);
    const row = (
      await this.db.query(
        "SELECT * FROM managed_files WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
        [actor.tenant_id, id],
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
  async update(actor: Actor, id: string, body: unknown) {
    allowOperational(actor);
    allow(actor, "file.update");
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
        [actor.tenant_id, id, x.category, x.description],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas tidak ditemukan");
    return row;
  }
  async remove(actor: Actor, id: string) {
    allowOperational(actor);
    allow(actor, "file.delete");
    uuid.parse(id);
    const used = (
      await this.db.query(
        "SELECT 1 FROM application_documents WHERE tenant_id=$1 AND file_id=$2 UNION ALL SELECT 1 FROM admission_payments WHERE tenant_id=$1 AND payment_proof_file_id=$2 LIMIT 1",
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (used)
      throw new ConflictException(
        "Berkas transaksi atau PPDB tidak dapat dihapus",
      );
    const row = (
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",
        [actor.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Berkas tidak ditemukan");
    return { id, deleted: true };
  }
  async restore(actor: Actor, id: string) {
    allowOperational(actor);
    allow(actor, "file.update");
    uuid.parse(id);
    const row = (
      await this.db.query(
        "UPDATE managed_files SET deleted_at=NULL WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NOT NULL RETURNING id",
        [actor.tenant_id, id],
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

@Injectable()
export class AdmissionFormService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}

  // Form Sections
  async listSections(actor: Actor, periodId: string) {
    allow(actor, "admission.form.read");
    return {
      data: (
        await this.db.query(
          `SELECT * FROM admission_form_sections WHERE tenant_id=$1 AND period_id=$2 ORDER BY order_index`,
          [actor.tenant_id, periodId],
        )
      ).rows,
    };
  }

  async createSection(actor: Actor, body: unknown) {
    allow(actor, "admission.form.write");
    const input = z
      .object({
        period_id: uuid,
        name: text,
        description: z.string().trim().max(1000).default(""),
        order_index: z.number().int().default(0),
        is_required: z.boolean().default(true),
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        `INSERT INTO admission_form_sections(tenant_id,period_id,name,description,order_index,is_required,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          actor.tenant_id,
          input.period_id,
          input.name,
          input.description,
          input.order_index,
          input.is_required,
          actor.id,
        ],
      )
    ).rows[0];
  }

  async updateSection(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.form.write");
    uuid.parse(id);
    const input = z
      .object({
        name: text.optional(),
        description: z.string().trim().max(1000).optional(),
        order_index: z.number().int().optional(),
        is_required: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    const sets: string[] = [];
    const vals: any[] = [actor.tenant_id, id];
    let idx = 3;
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        vals.push(v);
      }
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE admission_form_sections SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteSection(actor: Actor, id: string) {
    allow(actor, "admission.form.write");
    uuid.parse(id);
    await this.db.query(
      `DELETE FROM admission_form_sections WHERE tenant_id=$1 AND id=$2 AND is_default=false`,
      [actor.tenant_id, id],
    );
    return { success: true };
  }

  // Form Fields
  async listFields(actor: Actor, sectionId: string) {
    allow(actor, "admission.form.read");
    return {
      data: (
        await this.db.query(
          `SELECT * FROM admission_form_fields WHERE tenant_id=$1 AND section_id=$2 ORDER BY order_index`,
          [actor.tenant_id, sectionId],
        )
      ).rows,
    };
  }

  async createField(actor: Actor, body: unknown) {
    allow(actor, "admission.form.write");
    const input = z
      .object({
        section_id: uuid,
        label: text,
        field_key: z.string().trim().min(1).max(50),
        field_type: z.enum([
          "TEXT",
          "TEXTAREA",
          "EMAIL",
          "PHONE",
          "DATE",
          "SELECT",
          "RADIO",
          "CHECKBOX",
          "FILE_UPLOAD",
          "NUMBER",
          "RICH_TEXT",
        ]),
        options: z
          .array(z.object({ value: z.string(), label: z.string() }))
          .default([]),
        placeholder: z.string().trim().max(200).default(""),
        help_text: z.string().trim().max(500).default(""),
        is_required: z.boolean().default(false),
        is_special_key: z.boolean().default(false),
        order_index: z.number().int().default(0),
        validation: z.record(z.any()).default({}),
        conditional_logic: z.record(z.any()).default({}),
      })
      .strict()
      .parse(body);
    return (
      await this.db.query(
        `INSERT INTO admission_form_fields(tenant_id,section_id,label,field_key,field_type,options,placeholder,help_text,is_required,is_special_key,order_index,validation,conditional_logic,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          actor.tenant_id,
          input.section_id,
          input.label,
          input.field_key,
          input.field_type,
          JSON.stringify(input.options),
          input.placeholder,
          input.help_text,
          input.is_required,
          input.is_special_key,
          input.order_index,
          JSON.stringify(input.validation),
          JSON.stringify(input.conditional_logic),
          actor.id,
        ],
      )
    ).rows[0];
  }

  async updateField(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.form.write");
    uuid.parse(id);
    const input = z
      .object({
        label: text.optional(),
        field_type: z
          .enum([
            "TEXT",
            "TEXTAREA",
            "EMAIL",
            "PHONE",
            "DATE",
            "SELECT",
            "RADIO",
            "CHECKBOX",
            "FILE_UPLOAD",
            "NUMBER",
            "RICH_TEXT",
          ])
          .optional(),
        options: z
          .array(z.object({ value: z.string(), label: z.string() }))
          .optional(),
        placeholder: z.string().trim().max(200).optional(),
        help_text: z.string().trim().max(500).optional(),
        is_required: z.boolean().optional(),
        is_special_key: z.boolean().optional(),
        order_index: z.number().int().optional(),
        validation: z.record(z.any()).optional(),
        conditional_logic: z.record(z.any()).optional(),
      })
      .strict()
      .parse(body);
    const sets: string[] = [];
    const vals: any[] = [actor.tenant_id, id];
    let idx = 3;
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        if (
          k === "options" ||
          k === "validation" ||
          k === "conditional_logic"
        ) {
          vals.push(JSON.stringify(v));
        } else {
          vals.push(v);
        }
      }
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE admission_form_fields SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteField(actor: Actor, id: string) {
    allow(actor, "admission.form.write");
    uuid.parse(id);
    await this.db.query(
      `DELETE FROM admission_form_fields WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id, id],
    );
    return { success: true };
  }

  // Form Responses (parent submissions)
  async getResponses(actor: Actor, applicationId: string) {
    await requireApplicationAccess(
      this.db,
      actor,
      applicationId,
      "admission.form.read",
    );
    return {
      data: (
        await this.db.query(
          `SELECT fr.*, f.field_key, f.label, f.field_type, f.section_id, fs.name AS section_name
           FROM admission_form_responses fr
           JOIN admission_form_fields f ON f.tenant_id=fr.tenant_id AND f.id=fr.field_id
           JOIN admission_form_sections fs ON fs.tenant_id=fr.tenant_id AND fs.id=fr.section_id
           WHERE fr.tenant_id=$1 AND fr.application_id=$2
           ORDER BY fs.order_index, f.order_index`,
          [actor.tenant_id, applicationId],
        )
      ).rows,
    };
  }

  async submitResponses(actor: Actor, applicationId: string, body: unknown) {
    // Parent can submit their own application responses
    const input = z
      .object({
        application_id: uuid.optional(),
        section_id: uuid,
        responses: z.array(
          z.object({
            field_id: uuid,
            value_text: z.string().nullable().optional(),
            value_json: z.any().nullable().optional(),
            file_id: uuid.nullable().optional(),
          }),
        ),
      })
      .strict()
      .parse(body);

    // Verify application belongs to this family account
    const app = (
      await this.db.query(
        `SELECT family_account_id FROM applications WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, applicationId],
      )
    ).rows[0];
    if (!app) throw new NotFoundException("Pendaftaran tidak ditemukan");
    if (actor.account_level === "FAMILY") {
      if (!app.family_account_id || app.family_account_id !== actor.account_id)
        throw new ForbiddenException("Pendaftaran bukan milik akun keluarga ini");
    } else {
      allowOperational(actor);
      allow(actor, "admission.form.write");
    }

    return this.db.transaction(actor.tenant_id, async (sql) => {
      const section = (
        await sql.query(
          `SELECT s.id FROM admission_form_sections s
           JOIN applications a ON a.tenant_id=s.tenant_id AND a.id=$3
           WHERE s.tenant_id=$1 AND s.id=$2 AND s.period_id=a.period_id`,
          [actor.tenant_id, input.section_id, applicationId],
        )
      ).rows[0];
      if (!section) throw new BadRequestException("Bagian formulir tidak sesuai pendaftaran");
      for (const r of input.responses) {
        const field = (
          await sql.query(
            `SELECT f.id,f.field_key,f.field_type FROM admission_form_fields f
             WHERE f.tenant_id=$1 AND f.id=$2 AND f.section_id=$3`,
            [actor.tenant_id, r.field_id, input.section_id],
          )
        ).rows[0];
        if (!field)
          throw new BadRequestException("Kolom formulir tidak sesuai bagian formulir");
        if (field.field_type === "FILE_UPLOAD" && !r.file_id)
          throw new BadRequestException("Kolom unggahan file memerlukan file");
        if (r.file_id && !(await sql.query(
          `SELECT 1 FROM managed_files f
           JOIN file_links l ON l.tenant_id=f.tenant_id AND l.file_id=f.id
           WHERE f.tenant_id=$1 AND f.id=$2 AND f.deleted_at IS NULL
             AND l.entity_type='APPLICATION' AND l.entity_id=$3`,
          [actor.tenant_id, r.file_id, applicationId],
        )).rows[0])
          throw new BadRequestException("File formulir tidak sesuai pendaftaran");
        const values = [
          actor.tenant_id,
          applicationId,
          input.section_id,
          r.field_id,
          r.value_text || null,
          r.value_json ? JSON.stringify(r.value_json) : null,
          r.file_id || null,
        ];
        const updated = await sql.query(
          `UPDATE admission_form_responses SET section_id=$3,value_text=$5,value_json=$6,file_id=$7,submitted_at=now()
           WHERE tenant_id=$1 AND application_id=$2 AND field_id=$4`,
          values,
        );
        if (!updated.rowCount)
          await sql.query(
            `INSERT INTO admission_form_responses(tenant_id,application_id,section_id,field_id,value_text,value_json,file_id)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            values,
          );
        if (field.field_type === "FILE_UPLOAD")
          await sql.query(
            `INSERT INTO application_documents(tenant_id,application_id,file_id,document_type)
             VALUES($1,$2,$3,$4)
             ON CONFLICT(tenant_id,application_id,document_type) DO UPDATE
             SET file_id=EXCLUDED.file_id,verification_status='PENDING',notes=''`,
            [actor.tenant_id, applicationId, r.file_id, field.field_key],
          );
      }
      return { success: true };
    });
  }
}

@Injectable()
export class AdmissionPaymentService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}

  // Payment Schemes
  async listSchemes(actor: Actor, trackId: string) {
    allow(actor, "admission.payment.read");
    return {
      data: (
        await this.db.query(
          `SELECT * FROM admission_payment_schemes WHERE tenant_id=$1 AND track_id=$2 AND is_active=true ORDER BY order_index`,
          [actor.tenant_id, trackId],
        )
      ).rows,
    };
  }

  async createScheme(actor: Actor, body: unknown) {
    allow(actor, "admission.payment.write");
    const input = z
      .object({
        track_id: uuid,
        name: text,
        code: z
          .string()
          .trim()
          .min(1)
          .max(30)
          .transform((v) => v.toUpperCase()),
        amount: z.number().min(0).max(1000000000),
        is_required: z.boolean().default(true),
        due_date_type: z
          .enum(["IMMEDIATE", "ON_ACCEPTANCE", "MONTHLY_START", "CUSTOM_DATE"])
          .default("IMMEDIATE"),
        due_date: date.nullable().optional(),
        installment_count: z.number().int().min(1).default(1),
        installment_interval_months: z.number().int().min(1).default(1),
        description: z.string().trim().max(1000).default(""),
        order_index: z.number().int().default(0),
      })
      .strict()
      .parse(body);

    if (input.due_date_type === "CUSTOM_DATE" && !input.due_date) {
      throw new BadRequestException(
        "Tanggal jatuh tempo wajib diisi untuk CUSTOM_DATE",
      );
    }

    return (
      await this.db.query(
        `INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,due_date_type,due_date,installment_count,installment_interval_months,description,order_index,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          actor.tenant_id,
          input.track_id,
          input.name,
          input.code,
          input.amount,
          input.is_required,
          input.due_date_type,
          input.due_date || null,
          input.installment_count,
          input.installment_interval_months,
          input.description,
          input.order_index,
          actor.id,
        ],
      )
    ).rows[0];
  }

  async updateScheme(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.payment.write");
    uuid.parse(id);
    const input = z
      .object({
        name: text.optional(),
        amount: z.number().min(0).max(1000000000).optional(),
        is_required: z.boolean().optional(),
        due_date_type: z
          .enum(["IMMEDIATE", "ON_ACCEPTANCE", "MONTHLY_START", "CUSTOM_DATE"])
          .optional(),
        due_date: date.nullable().optional(),
        installment_count: z.number().int().min(1).optional(),
        installment_interval_months: z.number().int().min(1).optional(),
        description: z.string().trim().max(1000).optional(),
        order_index: z.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    const sets: string[] = [];
    const vals: any[] = [actor.tenant_id, id];
    let idx = 3;
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        vals.push(v);
      }
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE admission_payment_schemes SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteScheme(actor: Actor, id: string) {
    allow(actor, "admission.payment.write");
    uuid.parse(id);
    await this.db.query(
      `DELETE FROM admission_payment_schemes WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id, id],
    );
    return { success: true };
  }

  // Application Payments
  async getApplicationPayments(actor: Actor, applicationId: string) {
    await requireApplicationAccess(
      this.db,
      actor,
      applicationId,
      "admission.payment.read",
    );
    return {
      data: (
        await this.db.query(
          `SELECT ap.*, aps.name, aps.code, aps.due_date_type, aps.installment_count, aps.installment_interval_months
           FROM admission_payments ap
           JOIN admission_payment_schemes aps ON aps.tenant_id=ap.tenant_id AND aps.id=ap.payment_scheme_id
           WHERE ap.tenant_id=$1 AND ap.application_id=$2
           ORDER BY aps.order_index, ap.installment_number`,
          [actor.tenant_id, applicationId],
        )
      ).rows,
    };
  }

  async recordPayment(actor: Actor, body: unknown) {
    allow(actor, "admission.payment.write");
    const input = z
      .object({
        application_id: uuid,
        payment_scheme_id: uuid,
        amount: z.number().min(0),
        status: z.enum(["PENDING", "PAID", "PARTIAL", "WAIVED", "REFUNDED", "CANCELLED", "EXPIRED"]).default("PAID"),
        installment_number: z.number().int().min(1).default(1),
        due_date: date.nullable().optional(),
        paid_at: z.string().datetime().nullable().optional(),
        payment_number: z.string().trim().min(1).max(80).nullable().optional(),
        payment_reference: z.string().trim().max(120).nullable().optional(),
        payment_method: z.string().trim().max(50).nullable().optional(),
        payment_proof_file_id: uuid.nullable().optional(),
        notes: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(body);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const valid = (await sql.query(
        `SELECT s.is_active,s.installment_count FROM applications a JOIN admission_payment_schemes s
         ON s.tenant_id=a.tenant_id AND s.id=$3 AND s.track_id=a.track_id
         WHERE a.tenant_id=$1 AND a.id=$2`,
        [actor.tenant_id, input.application_id, input.payment_scheme_id],
      )).rows[0];
      if (!valid || !valid.is_active)
        throw new BadRequestException("Skema pembayaran tidak sesuai jalur pendaftaran");
      if (input.installment_number > Number(valid.installment_count))
        throw new BadRequestException("Nomor cicilan melebihi jumlah cicilan skema");
      if (input.payment_proof_file_id && !(await sql.query(
        `SELECT 1 FROM managed_files f JOIN file_links l
         ON l.tenant_id=f.tenant_id AND l.file_id=f.id
         WHERE f.tenant_id=$1 AND f.id=$2 AND f.category='PAYMENT_PROOF'
           AND f.deleted_at IS NULL AND l.entity_type='APPLICATION' AND l.entity_id=$3`,
        [actor.tenant_id, input.payment_proof_file_id, input.application_id],
      )).rows[0]) throw new BadRequestException("Bukti pembayaran tidak sesuai pendaftaran");
      if (input.payment_proof_file_id && (await sql.query(
        `SELECT 1 FROM admission_payments
         WHERE tenant_id=$1 AND payment_proof_file_id=$2
           AND (application_id,payment_scheme_id,installment_number) <> ($3,$4,$5)
         LIMIT 1`,
        [actor.tenant_id, input.payment_proof_file_id, input.application_id, input.payment_scheme_id, input.installment_number],
      )).rows[0]) throw new BadRequestException("Bukti pembayaran sudah digunakan untuk pembayaran lain");
      return (await sql.query(
        `INSERT INTO admission_payments(tenant_id,application_id,payment_scheme_id,amount,status,installment_number,due_date,paid_at,payment_number,payment_reference,payment_method,payment_proof_file_id,verified_by,verified_at,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CASE WHEN $5='PAID' THEN now() END),$9,$10,$11,$12,$13,CASE WHEN $5='PAID' THEN now() END,$14)
         ON CONFLICT(tenant_id,application_id,payment_scheme_id,installment_number) DO UPDATE SET
           amount=EXCLUDED.amount,status=EXCLUDED.status,due_date=EXCLUDED.due_date,paid_at=EXCLUDED.paid_at,
           payment_number=EXCLUDED.payment_number,payment_reference=EXCLUDED.payment_reference,payment_method=EXCLUDED.payment_method,
           payment_proof_file_id=EXCLUDED.payment_proof_file_id,verified_by=EXCLUDED.verified_by,
           verified_at=CASE WHEN EXCLUDED.status='PAID' THEN now() ELSE NULL END,notes=EXCLUDED.notes
         RETURNING *`,
        [actor.tenant_id,input.application_id,input.payment_scheme_id,input.amount,input.status,input.installment_number,input.due_date || null,input.paid_at || null,input.payment_number || null,input.payment_reference || null,input.payment_method || null,input.payment_proof_file_id || null,actor.id,input.notes],
      )).rows[0];
    });
  }

  async uploadPaymentProof(
    actor: Actor,
    applicationId: string,
    schemeId: string,
    installmentNumberInput: string | undefined,
    body: unknown,
  ) {
    uuid.parse(applicationId);
    uuid.parse(schemeId);
    const input = fileInput
      .extend({
        document_type: z.literal("PAYMENT_PROOF"),
      })
      .parse(body);
    if (actor.account_level === "FAMILY") {
      const application = (await this.db.query(
        `SELECT 1 FROM applications
         WHERE tenant_id=$1 AND id=$2 AND family_account_id=$3`,
        [actor.tenant_id, applicationId, actor.account_id],
      )).rows[0];
      if (!application)
        throw new ForbiddenException("Pendaftaran bukan milik akun keluarga ini");
    } else {
      allowOperational(actor);
      allow(actor, "admission.payment.write");
    }
    const scheme = (await this.db.query(
      `SELECT s.installment_count FROM applications a
       JOIN admission_payment_schemes s ON s.tenant_id=a.tenant_id
        AND s.id=$3 AND s.track_id=a.track_id AND s.is_active=true
       WHERE a.tenant_id=$1 AND a.id=$2`,
      [actor.tenant_id, applicationId, schemeId],
    )).rows[0];
    if (!scheme)
      throw new BadRequestException("Pembayaran tidak sesuai jalur pendaftaran");
    const installmentNumber = installmentNumberInput === undefined
      ? Number(scheme.installment_count) === 1 ? 1 : NaN
      : Number(installmentNumberInput);
    if (!Number.isInteger(installmentNumber) || installmentNumber < 1)
      throw new BadRequestException("Nomor cicilan wajib berupa bilangan bulat positif");
    if (installmentNumber > Number(scheme.installment_count))
      throw new BadRequestException("Nomor cicilan melebihi jumlah cicilan skema");
    const payment = (await this.db.query(
      `SELECT ap.id,ap.status FROM admission_payments ap
       WHERE ap.tenant_id=$1 AND ap.application_id=$2 AND ap.payment_scheme_id=$3
         AND ap.installment_number=$4`,
      [actor.tenant_id, applicationId, schemeId, installmentNumber],
    )).rows[0];
    if (!payment)
      throw new BadRequestException("Pembayaran tidak sesuai jalur pendaftaran");
    if (actor.account_level === "FAMILY" && payment.status === "PAID")
      throw new ConflictException("Pembayaran yang sudah lunas tidak dapat diubah oleh akun keluarga");

    const file = await saveManagedFile(
      this.db,
      actor.tenant_id,
      actor.id,
      "PAYMENT_PROOF",
      "PAYMENT_PROOF",
      input,
    );
    try {
      await this.db.transaction(actor.tenant_id, async (sql) => {
        const currentPayment = (await sql.query(
          `SELECT id,status FROM admission_payments
           WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [actor.tenant_id, payment.id],
        )).rows[0];
        if (!currentPayment)
          throw new BadRequestException("Pembayaran tidak ditemukan");
        if (actor.account_level === "FAMILY" && currentPayment.status === "PAID")
          throw new ConflictException("Pembayaran yang sudah lunas tidak dapat diubah oleh akun keluarga");
        const updated = (await sql.query(
          `UPDATE admission_payments SET payment_proof_file_id=$3, status='PENDING'
           WHERE tenant_id=$1 AND id=$2
             AND ($4 <> 'FAMILY' OR status <> 'PAID')
           RETURNING id`,
          [actor.tenant_id, payment.id, file.id, actor.account_level],
        )).rows[0];
        if (!updated)
          throw new ConflictException("Pembayaran yang sudah lunas tidak dapat diubah oleh akun keluarga");
        await sql.query(
          "INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id) VALUES($1,$2,'APPLICATION',$3)",
          [actor.tenant_id, file.id, applicationId],
        );
      });
      return file;
    } catch (error) {
      await this.db.query(
        "UPDATE managed_files SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, file.id],
      );
      throw error;
    }
  }
}

@Injectable()
export class AdmissionInterviewService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}

  // Interview Slots (Admin)
  async listSlots(actor: Actor, periodId: string) {
    allow(actor, "admission.interview.read");
    return {
      data: (
        await this.db.query(
          `SELECT ais.*, tr.name AS track_name,
                  (SELECT count(*) FROM admission_interview_bookings aib WHERE aib.tenant_id=ais.tenant_id AND aib.slot_id=ais.id AND aib.status IN ('BOOKED','ATTENDED')) AS booked_count
           FROM admission_interview_slots ais
           LEFT JOIN admission_tracks tr ON tr.tenant_id=ais.tenant_id AND tr.id=ais.track_id
           WHERE ais.tenant_id=$1 AND ais.period_id=$2
           ORDER BY ais.date, ais.start_time`,
          [actor.tenant_id, periodId],
        )
      ).rows,
    };
  }

  async createSlot(actor: Actor, body: unknown) {
    allow(actor, "admission.interview.write");
    const input = z
      .object({
        period_id: uuid,
        track_id: uuid.nullable().optional(),
        date: date,
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
        quota: z.number().int().min(1).default(1),
        location: z.string().trim().max(200).default(""),
        notes: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(body);

    if (input.start_time >= input.end_time) {
      throw new BadRequestException("Waktu mulai harus sebelum waktu selesai");
    }

    return (
      await this.db.query(
        `INSERT INTO admission_interview_slots(tenant_id,period_id,track_id,date,start_time,end_time,quota,location,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          actor.tenant_id,
          input.period_id,
          input.track_id || null,
          input.date,
          input.start_time,
          input.end_time,
          input.quota,
          input.location,
          input.notes,
          actor.id,
        ],
      )
    ).rows[0];
  }

  async updateSlot(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.interview.write");
    uuid.parse(id);
    const input = z
      .object({
        date: date.optional(),
        start_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        end_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        quota: z.number().int().min(1).optional(),
        location: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
        is_active: z.boolean().optional(),
      })
      .strict()
      .parse(body);
    const sets: string[] = [];
    const vals: any[] = [actor.tenant_id, id];
    let idx = 3;
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        vals.push(v);
      }
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    return (
      await this.db.query(
        `UPDATE admission_interview_slots SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteSlot(actor: Actor, id: string) {
    allow(actor, "admission.interview.write");
    uuid.parse(id);
    await this.db.query(
      `DELETE FROM admission_interview_slots WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id, id],
    );
    return { success: true };
  }

  // Interview Bookings (Parent)
  async getAvailableSlots(actor: Actor, applicationId: string) {
    const app = await requireApplicationAccess(
      this.db,
      actor,
      applicationId,
      "admission.interview.read",
    );

    return {
      data: (
        await this.db.query(
          `SELECT ais.*, tr.name AS track_name,
                  (ais.quota - COALESCE((SELECT count(*) FROM admission_interview_bookings aib WHERE aib.tenant_id=ais.tenant_id AND aib.slot_id=ais.id AND aib.status IN ('BOOKED','ATTENDED')),0)) AS available
           FROM admission_interview_slots ais
           LEFT JOIN admission_tracks tr ON tr.tenant_id=ais.tenant_id AND tr.id=ais.track_id
           WHERE ais.tenant_id=$1 AND ais.period_id=$2 AND ais.is_active=true
           AND (ais.track_id IS NULL OR ais.track_id=$3)
           AND ais.date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
           ORDER BY ais.date, ais.start_time`,
          [
            actor.tenant_id,
            app.period_id,
            app.track_id || "00000000-0000-0000-0000-000000000000",
          ],
        )
      ).rows,
    };
  }

  async bookSlot(actor: Actor, body: unknown) {
    const input = z
      .object({
        application_id: uuid,
        slot_id: uuid,
      })
      .strict()
      .parse(body);

    await requireApplicationAccess(
      this.db,
      actor,
      input.application_id,
      "admission.interview.write",
    );

    return this.db.transaction(actor.tenant_id, async (sql) => {
      // Check slot availability with row lock
      const slot = (
        await sql.query(
          `SELECT ais.*, (SELECT count(*) FROM admission_interview_bookings aib WHERE aib.tenant_id=ais.tenant_id AND aib.slot_id=ais.id AND aib.status IN ('BOOKED','ATTENDED')) AS booked
           FROM admission_interview_slots ais WHERE ais.tenant_id=$1 AND ais.id=$2 FOR UPDATE`,
          [actor.tenant_id, input.slot_id],
        )
      ).rows[0];
      if (!slot || !slot.is_active)
        throw new NotFoundException("Slot wawancara tidak ditemukan");
      if (Number(slot.booked) >= Number(slot.quota))
        throw new ConflictException("Slot wawancara sudah penuh");

      // Cancel any existing booking for this application
      await sql.query(
        `UPDATE admission_interview_bookings SET status='CANCELLED' WHERE tenant_id=$1 AND application_id=$2 AND status IN ('BOOKED')`,
        [actor.tenant_id, input.application_id],
      );

      // Create new booking
      const booking = (
        await sql.query(
          `INSERT INTO admission_interview_bookings(tenant_id,application_id,slot_id)
           VALUES($1,$2,$3) RETURNING *`,
          [actor.tenant_id, input.application_id, input.slot_id],
        )
      ).rows[0];

      // Update application status to INTERVIEW if not already
      await sql.query(
        `UPDATE applications SET status=CASE WHEN status IN ('SUBMITTED','DOCUMENT_REVIEW','TEST') THEN 'INTERVIEW' ELSE status END, updated_at=now() WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, input.application_id],
      );

      return booking;
    });
  }

  async cancelBooking(actor: Actor, applicationId: string) {
    await requireApplicationAccess(
      this.db,
      actor,
      applicationId,
      "admission.interview.write",
    );

    await this.db.query(
      `UPDATE admission_interview_bookings SET status='CANCELLED' WHERE tenant_id=$1 AND application_id=$2 AND status IN ('BOOKED')`,
      [actor.tenant_id, applicationId],
    );
    return { success: true };
  }

  // Admin: Get all bookings
  async listBookings(actor: Actor, periodId: string) {
    allow(actor, "admission.interview.read");
    return {
      data: (
        await this.db.query(
          `SELECT aib.*, a.registration_number, a.name AS applicant_name, a.status AS app_status,
                  ais.date, ais.start_time, ais.end_time, ais.location, tr.name AS track_name
           FROM admission_interview_bookings aib
           JOIN applications a ON a.tenant_id=aib.tenant_id AND a.id=aib.application_id
           JOIN admission_interview_slots ais ON ais.tenant_id=aib.tenant_id AND ais.id=aib.slot_id
           LEFT JOIN admission_tracks tr ON tr.tenant_id=a.tenant_id AND tr.id=a.track_id
           WHERE aib.tenant_id=$1 AND ais.period_id=$2
           ORDER BY ais.date, ais.start_time, a.registration_number`,
          [actor.tenant_id, periodId],
        )
      ).rows,
    };
  }

  async markAttendance(
    actor: Actor,
    bookingId: string,
    status: "ATTENDED" | "NO_SHOW",
  ) {
    allow(actor, "admission.interview.write");
    uuid.parse(bookingId);
    return (
      await this.db.query(
        `UPDATE admission_interview_bookings SET status=$3, attended_at=CASE WHEN $3='ATTENDED' THEN now() END WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [actor.tenant_id, bookingId, status],
      )
    ).rows[0];
  }
}

@Injectable()
export class AdmissionDocumentTemplateService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}

  async listTemplates(actor: Actor, periodId?: string) {
    allow(actor, "admission.document_template.read");
    const parsed = periodId ? uuid.parse(periodId) : null;
    return {
      data: (
        await this.db.query(
          `SELECT * FROM admission_document_templates WHERE tenant_id=$1 AND ($2::uuid IS NULL OR period_id=$2) ORDER BY is_default DESC, created_at DESC`,
          [actor.tenant_id, parsed],
        )
      ).rows,
    };
  }

  async createTemplate(actor: Actor, body: unknown) {
    allow(actor, "admission.document_template.write");
    const input = z
      .object({
        period_id: uuid.nullable().optional(),
        name: text,
        description: z.string().trim().max(1000).default(""),
        template_html: z.string().min(1),
        template_type: z
          .enum(["CONSENT_FORM", "CUSTOM"])
          .default("CONSENT_FORM"),
        is_default: z.boolean().default(false),
      })
      .strict()
      .parse(body);

    if (input.is_default) {
      await this.db.query(
        `UPDATE admission_document_templates SET is_default=false WHERE tenant_id=$1 AND period_id=$2`,
        [actor.tenant_id, input.period_id || null],
      );
    }

    return (
      await this.db.query(
        `INSERT INTO admission_document_templates(tenant_id,period_id,name,description,template_html,template_type,is_default,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          actor.tenant_id,
          input.period_id || null,
          input.name,
          input.description,
          input.template_html,
          input.template_type,
          input.is_default,
          actor.id,
        ],
      )
    ).rows[0];
  }

  async updateTemplate(actor: Actor, id: string, body: unknown) {
    allow(actor, "admission.document_template.write");
    uuid.parse(id);
    const input = z
      .object({
        name: text.optional(),
        description: z.string().trim().max(1000).optional(),
        template_html: z.string().min(1).optional(),
        template_type: z.enum(["CONSENT_FORM", "CUSTOM"]).optional(),
        is_default: z.boolean().optional(),
      })
      .strict()
      .parse(body);

    if (input.is_default) {
      const tpl = (
        await this.db.query(
          `SELECT period_id FROM admission_document_templates WHERE tenant_id=$1 AND id=$2`,
          [actor.tenant_id, id],
        )
      ).rows[0];
      if (tpl) {
        await this.db.query(
          `UPDATE admission_document_templates SET is_default=false WHERE tenant_id=$1 AND period_id=$2`,
          [actor.tenant_id, tpl.period_id],
        );
      }
    }

    const sets: string[] = [];
    const vals: any[] = [actor.tenant_id, id];
    let idx = 3;
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        vals.push(v);
      }
    }
    if (!sets.length)
      throw new BadRequestException("Tidak ada data untuk diupdate");
    sets.push("updated_at = now()");
    return (
      await this.db.query(
        `UPDATE admission_document_templates SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        vals,
      )
    ).rows[0];
  }

  async deleteTemplate(actor: Actor, id: string) {
    allow(actor, "admission.document_template.write");
    uuid.parse(id);
    await this.db.query(
      `DELETE FROM admission_document_templates WHERE tenant_id=$1 AND id=$2`,
      [actor.tenant_id, id],
    );
    return { success: true };
  }

  async renderTemplate(
    actor: Actor,
    templateId: string,
    applicationId: string,
  ) {
    allow(actor, "admission.document_template.read");
    uuid.parse(templateId);
    uuid.parse(applicationId);

    const [tpl, app] = await Promise.all([
      this.db.query(
        `SELECT * FROM admission_document_templates WHERE tenant_id=$1 AND id=$2`,
        [actor.tenant_id, templateId],
      ),
      this.db.query(
        `SELECT a.*, i.name, i.email, i.phone, i.address, i.birth_date, i.gender, i.guardian_name, i.guardian_phone, p.name AS period_name, tr.name AS track_name, tr.cost AS track_cost
         FROM applications a
         JOIN applicants i ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id
         JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id
         LEFT JOIN admission_tracks tr ON tr.tenant_id=a.tenant_id AND tr.id=a.track_id
         WHERE a.tenant_id=$1 AND a.id=$2`,
        [actor.tenant_id, applicationId],
      ),
    ]);

    if (!tpl.rows[0]) throw new NotFoundException("Template tidak ditemukan");
    if (!app.rows[0])
      throw new NotFoundException("Pendaftaran tidak ditemukan");

    const data = app.rows[0];
    let html = tpl.rows[0].template_html;

    // Replace placeholders
    const replacements: Record<string, string> = {
      "{{registration_number}}": data.registration_number,
      "{{applicant_name}}": data.name,
      "{{applicant_email}}": data.email || "",
      "{{applicant_phone}}": data.phone || "",
      "{{applicant_address}}": data.address || "",
      "{{applicant_birth_date}}": data.birth_date || "",
      "{{applicant_gender}}":
        data.gender === "MALE"
          ? "Laki-laki"
          : data.gender === "FEMALE"
            ? "Perempuan"
            : "",
      "{{guardian_name}}": data.guardian_name,
      "{{guardian_phone}}": data.guardian_phone,
      "{{period_name}}": data.period_name,
      "{{track_name}}": data.track_name || "",
      "{{track_cost}}": data.track_cost
        ? Number(data.track_cost).toLocaleString("id-ID")
        : "0",
      "{{date_today}}": new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    };

    for (const [key, val] of Object.entries(replacements)) {
      html = html.replace(
        new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        val,
      );
    }

    return { html, template_name: tpl.rows[0].name };
  }
}

@Injectable()
export class AdmissionReportsService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async dashboard(actor: Actor) {
    allow(actor, "admission.read");

    // KPI counts
    const kpis = await this.db.query(
      `SELECT
        COUNT(*)::int AS total_applications,
        COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
        COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
        COUNT(*) FILTER (WHERE status IN ('DOCUMENT_REVIEW','TEST','INTERVIEW'))::int AS under_review,
        COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'ENROLLED')::int AS registered,
        COUNT(*) FILTER (WHERE status = 'WITHDRAWN')::int AS withdrawn,
        COUNT(*) FILTER (WHERE selection_status = 'WAITING_LIST')::int AS waiting_list
       FROM applications
       WHERE tenant_id = $1`,
      [actor.tenant_id],
    );

    // Verified documents count
    const verifiedDocs = await this.db.query(
      `SELECT COUNT(*)::int AS verified_documents
       FROM application_documents d
       JOIN applications a ON a.tenant_id = d.tenant_id AND a.id = d.application_id
       WHERE d.tenant_id = $1 AND d.verification_status = 'VERIFIED'`,
      [actor.tenant_id],
    );

    // Period capacity must be aggregated before joining applications so it is
    // counted once per period rather than once per application.
    const quota = await this.db.query(
      `SELECT
         COALESCE((SELECT SUM(p.capacity)::int FROM admission_periods p WHERE p.tenant_id=$1), 0) AS total_capacity,
         COUNT(*) FILTER (WHERE a.status IN ('ACCEPTED', 'ENROLLED'))::int AS filled_capacity
       FROM applications a
       WHERE a.tenant_id=$1`,
      [actor.tenant_id],
    );

    // Series by period
    const byPeriod = await this.db.query(
      `SELECT p.name AS period, COUNT(a.*)::int AS count
       FROM admission_periods p
       LEFT JOIN applications a ON a.tenant_id = p.tenant_id AND a.period_id = p.id
       WHERE p.tenant_id = $1
       GROUP BY p.id, p.name
       ORDER BY p.starts_on`,
      [actor.tenant_id],
    );

    // Series by track
    const byTrack = await this.db.query(
      `SELECT tr.name AS track, COUNT(a.*)::int AS count
       FROM admission_tracks tr
       LEFT JOIN applications a ON a.tenant_id = tr.tenant_id AND a.track_id = tr.id
       WHERE tr.tenant_id = $1
       GROUP BY tr.id, tr.name
       ORDER BY tr.name`,
      [actor.tenant_id],
    );

    // Series by status
    const byStatus = await this.db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM applications
       WHERE tenant_id = $1
       GROUP BY status
       ORDER BY count DESC`,
      [actor.tenant_id],
    );

    const kpi = kpis.rows[0];
    const q = quota.rows[0] || { total_capacity: 0, filled_capacity: 0 };

    return {
      total_applications: kpi.total_applications,
      draft: kpi.draft,
      submitted: kpi.submitted,
      under_review: kpi.under_review,
      verified_documents: verifiedDocs.rows[0].verified_documents,
      rejected: kpi.rejected,
      accepted: kpi.accepted,
      waiting_list: kpi.waiting_list,
      registered: kpi.registered,
      quota: {
        total_capacity: q.total_capacity,
        filled_capacity: q.filled_capacity,
        remaining_capacity: Math.max(0, q.total_capacity - q.filled_capacity),
      },
      series: {
        by_period: byPeriod.rows,
        by_track: byTrack.rows,
        by_status: byStatus.rows,
      },
    };
  }

  async export(actor: Actor, params: {
    academicYearId?: string;
    periodId?: string;
    trackId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    type?: string;
    page: number;
    limit: number;
  }) {
    allow(actor, "admission.read");

    const validTypes = ['APPLICANTS', 'VERIFICATION', 'SELECTION', 'ACCEPTED', 'REREGISTRATION', 'PAYMENTS'];
    const validStatuses = ['DRAFT', 'SUBMITTED', 'DOCUMENT_REVIEW', 'TEST', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'ENROLLED', 'WITHDRAWN'];
    const type = (params.type || 'APPLICANTS').toUpperCase();
    if (!validTypes.includes(type)) throw new BadRequestException('Invalid report type');
    if (!Number.isInteger(params.page) || params.page < 1) throw new BadRequestException('Page must be a positive integer');
    if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100) throw new BadRequestException('Limit must be an integer between 1 and 100');
    if (params.status && !validStatuses.includes(params.status)) throw new BadRequestException('Invalid application status');
    if (params.dateFrom && !isIsoCalendarDate(params.dateFrom)) throw new BadRequestException('Invalid date_from');
    if (params.dateTo && !isIsoCalendarDate(params.dateTo)) throw new BadRequestException('Invalid date_to');
    if (params.dateFrom && params.dateTo && params.dateFrom > params.dateTo) throw new BadRequestException('date_from must be before date_to');

    const ownedFilters: Array<[string | undefined, string]> = [
      [params.academicYearId, 'academic_years'],
      [params.periodId, 'admission_periods'],
      [params.trackId, 'admission_tracks'],
    ];
    for (const [id, table] of ownedFilters) {
      if (!id) continue;
      uuid.parse(id);
      const owned = await this.db.query(`SELECT 1 FROM ${table} WHERE tenant_id=$1 AND id=$2`, [actor.tenant_id, id]);
      if (!owned.rows[0]) throw new NotFoundException('Filter tidak ditemukan');
    }

    let baseQuery = '';
    let countQuery = '';
    const where: string[] = ['a.tenant_id = $1'];
    const vals: any[] = [actor.tenant_id];
    let paramIdx = 2;

    if (params.academicYearId) {
      where.push(`EXISTS (SELECT 1 FROM admission_periods period_filter WHERE period_filter.tenant_id=a.tenant_id AND period_filter.id=a.period_id AND period_filter.academic_year_id=$${paramIdx++})`);
      vals.push(params.academicYearId);
    }
    if (params.periodId) {
      where.push(`a.period_id = $${paramIdx++}`);
      vals.push(params.periodId);
    }
    if (params.trackId) {
      where.push(`a.track_id = $${paramIdx++}`);
      vals.push(params.trackId);
    }
    if (params.status) {
      where.push(`a.status = $${paramIdx++}`);
      vals.push(params.status);
    }
    if (params.dateFrom) {
      where.push(`a.submitted_at >= $${paramIdx++}`);
      vals.push(params.dateFrom);
    }
    if (params.dateTo) {
      where.push(`a.submitted_at <= $${paramIdx++}`);
      vals.push(params.dateTo + ' 23:59:59');
    }

    const whereClause = where.join(' AND ');

    switch (type) {
      case 'APPLICANTS':
        baseQuery = `SELECT a.registration_number, a.status, a.submitted_at,
          i.name AS applicant_name, i.email AS applicant_email, i.phone AS applicant_phone,
          p.name AS period_name, tr.name AS track_name
          FROM applications a
          JOIN applicants i ON i.tenant_id = a.tenant_id AND i.id = a.applicant_id
          JOIN admission_periods p ON p.tenant_id = a.tenant_id AND p.id = a.period_id
          LEFT JOIN admission_tracks tr ON tr.tenant_id = a.tenant_id AND tr.id = a.track_id
          WHERE ${whereClause}
          ORDER BY a.submitted_at DESC`;
        countQuery = `SELECT COUNT(*)::int FROM applications a
          JOIN admission_periods p ON p.tenant_id = a.tenant_id AND p.id = a.period_id
          WHERE ${whereClause}`;
        break;
      case 'VERIFICATION':
        baseQuery = `SELECT a.registration_number, a.status AS application_status, a.submitted_at,
          i.name AS applicant_name,
          COALESCE(json_agg(json_build_object('document_type', d.document_type, 'verification_status', d.verification_status, 'created_at', d.created_at) ORDER BY d.created_at) FILTER (WHERE d.id IS NOT NULL), '[]') AS documents
          FROM applications a
          JOIN applicants i ON i.tenant_id = a.tenant_id AND i.id = a.applicant_id
          LEFT JOIN application_documents d ON d.tenant_id = a.tenant_id AND d.application_id = a.id
          WHERE ${whereClause}
          GROUP BY a.id, i.id
          ORDER BY a.submitted_at DESC`;
        countQuery = `SELECT COUNT(DISTINCT a.id)::int FROM applications a WHERE ${whereClause}`;
        break;
      case 'SELECTION':
        baseQuery = `SELECT a.registration_number, a.status AS application_status, i.name AS applicant_name,
          a.selection_score, a.selection_rank, a.selection_status
          FROM applications a
          JOIN applicants i ON i.tenant_id = a.tenant_id AND i.id = a.applicant_id
          WHERE ${whereClause} AND a.selection_status IS NOT NULL
          ORDER BY a.selection_rank NULLS LAST`;
        countQuery = `SELECT COUNT(*)::int FROM applications a WHERE ${whereClause} AND a.selection_status IS NOT NULL`;
        break;
      case 'ACCEPTED':
        baseQuery = `SELECT a.registration_number, a.status, p.name AS period_name, tr.name AS track_name
          FROM applications a
          JOIN admission_periods p ON p.tenant_id = a.tenant_id AND p.id = a.period_id
          LEFT JOIN admission_tracks tr ON tr.tenant_id = a.tenant_id AND tr.id = a.track_id
          WHERE ${whereClause} AND a.status IN ('ACCEPTED','ENROLLED')
          ORDER BY a.updated_at DESC`;
        countQuery = `SELECT COUNT(*)::int FROM applications a WHERE ${whereClause} AND a.status IN ('ACCEPTED','ENROLLED')`;
        break;
      case 'REREGISTRATION':
        baseQuery = `SELECT a.registration_number, r.registration_date, r.status AS reregistration_status,
          s.name AS student_name, c.name AS class_name, r.final_program
          FROM admission_re_registrations r
          JOIN applications a ON a.tenant_id = r.tenant_id AND a.id = r.application_id
          JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
          LEFT JOIN classes c ON c.tenant_id = r.tenant_id AND c.id = r.final_class_id
          WHERE ${whereClause.replace('a.tenant_id', 'r.tenant_id')}
          ORDER BY r.created_at DESC`;
        countQuery = `SELECT COUNT(*)::int FROM admission_re_registrations r
          JOIN applications a ON a.tenant_id = r.tenant_id AND a.id = r.application_id
          WHERE ${whereClause.replace('a.tenant_id', 'r.tenant_id')}`;
        break;
      case 'PAYMENTS':
        baseQuery = `SELECT a.registration_number, ps.name AS payment_scheme, ps.code AS payment_scheme_code,
          ap.status AS payment_status, ap.amount, COALESCE(ap.paid_at, ap.created_at) AS payment_date,
          ap.payment_proof_file_id AS payment_reference, ap.installment_number
          FROM admission_payments ap
          JOIN applications a ON a.tenant_id = ap.tenant_id AND a.id = ap.application_id
          JOIN admission_payment_schemes ps ON ps.tenant_id = ap.tenant_id AND ps.id = ap.payment_scheme_id
          WHERE ${whereClause.replace('a.tenant_id', 'ap.tenant_id')}
          ORDER BY ap.created_at DESC`;
        countQuery = `SELECT COUNT(*)::int FROM admission_payments ap
          JOIN applications a ON a.tenant_id = ap.tenant_id AND a.id = ap.application_id
          WHERE ${whereClause.replace('a.tenant_id', 'ap.tenant_id')}`;
        break;
    }

    const totalResult = await this.db.query(countQuery, vals);
    const total = totalResult.rows[0]?.count || 0;

    const offset = (params.page - 1) * params.limit;
    const dataResult = await this.db.query(`${baseQuery} LIMIT $${paramIdx++} OFFSET $${paramIdx}`, [...vals, params.limit, offset]);

    return {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
      data: dataResult.rows,
    };
  }
}
