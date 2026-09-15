import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Actor } from "../../../../../packages/shared-types/src";
import { fileInput, saveManagedFile } from "../../common/storage/file-storage";
import { Database } from "../../database/database.service";
import { createApplication } from "../admissions/admissions.service";
import { AuthService } from "../auth/auth.service";
import { AuthRequest } from "../auth/auth.types";
import { allow } from "../auth/permissions";

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const parentRegistration = z
  .object({
    tenant_slug: z.string().trim().min(1).max(80),
    name,
    email: z
      .string()
      .email()
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(3).max(40),
    password: z.string().min(12).max(100),
  })
  .strict();
const familyApplication = z
  .object({
    period_id: uuid,
    track_id: uuid.nullable().optional(),
    target_grade_level_id: uuid,
    name,
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    birth_date: date.nullable().optional(),
    gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  })
  .strict();
const familyDocument = fileInput.extend({
  document_type: z.string().trim().min(1).max(80),
});

function setRefreshCookie(res: Response, value: string) {
  res.cookie("langkahsiswa_refresh", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 86400000,
  });
}

@Injectable()
export class PublicFamilyService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}
  async register(req: Request, res: Response, body: unknown) {
    const input = parentRegistration.parse(body);
    const tenant = (
      await this.db.query(
        `SELECT t.id,o.id AS organization_id FROM organizations o
         JOIN organization_sites os ON os.organization_id=o.id
         JOIN tenants t ON t.id=os.tenant_id
         WHERE o.slug=$1 AND o.status='ACTIVE' AND t.status='ACTIVE'
         ORDER BY os.is_primary DESC,t.created_at LIMIT 1`,
        [input.tenant_slug.toLowerCase()],
      )
    ).rows[0];
    if (!tenant) throw new NotFoundException("Yayasan tidak ditemukan");
    const result = await this.db.transaction(tenant.id, async (sql) => {
      const account = (
        await sql.query(
          `INSERT INTO accounts(name,email,account_level)
           VALUES($1,$2,'FAMILY')
           ON CONFLICT(email) DO UPDATE SET name=excluded.name
           RETURNING id`,
          [input.name, input.email],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SELF_REGISTRATION') ON CONFLICT DO NOTHING",
        [account.id],
      );
      let user = (
        await sql.query(
          "SELECT id,password_hash FROM users WHERE tenant_id=$1 AND account_id=$2",
          [tenant.id, account.id],
        )
      ).rows[0];
      if (user && !(await compare(input.password, user.password_hash)))
        throw new ConflictException(
          "Email sudah terdaftar. Masuk dengan kata sandi akun yang ada.",
        );
      if (!user)
        user = (
          await sql.query(
            `INSERT INTO users(tenant_id,account_id,name,email,password_hash)
             VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [
              tenant.id,
              account.id,
              input.name,
              input.email,
              await hash(input.password, 12),
            ],
          )
        ).rows[0];
      await sql.query(
        "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'PARENT') ON CONFLICT DO NOTHING",
        [tenant.id, user.id],
      );
      await sql.query(
        `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
         VALUES($1,$2,$3,'PARENT') ON CONFLICT DO NOTHING`,
        [account.id, tenant.organization_id, tenant.id],
      );
      await sql.query(
        `INSERT INTO parents(tenant_id,user_id,name,email,phone)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(tenant_id,user_id) DO UPDATE
         SET name=excluded.name,email=excluded.email,phone=excluded.phone`,
        [tenant.id, user.id, input.name, input.email, input.phone],
      );
      return {
        ...(await this.auth.tokens(sql, user.id, tenant.id, req)),
        user_id: user.id,
      };
    });
    setRefreshCookie(res, result.refresh_token);
    res.setHeader("Cache-Control", "no-store");
    const { user_id: userId, ...tokens } = result;
    return {
      ...tokens,
      user: await this.auth.actor(userId, tenant.id),
      needs_ppdb: true,
    };
  }
}

@Injectable()
export class FamilyService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  private family(actor: AuthRequest["actor"]) {
    if (!actor.roles.some((role) => role === "PARENT" || role === "STUDENT"))
      throw new BadRequestException("Fitur ini khusus akun siswa dan wali");
  }
  async overview(actor: Actor) {
    this.family(actor);
    allow(actor, "family.read");
    const students = (
      await this.db.query(
        `SELECT DISTINCT s.*,s.user_id IS NOT NULL AS account_ready
         FROM students s
         LEFT JOIN student_guardians sg ON sg.tenant_id=s.tenant_id AND sg.student_id=s.id
         LEFT JOIN parents p ON p.tenant_id=sg.tenant_id AND p.id=sg.parent_id
         LEFT JOIN users parent_user ON parent_user.tenant_id=p.tenant_id AND parent_user.id=p.user_id
         WHERE s.tenant_id=$1 AND (s.user_id=$2 OR parent_user.account_id=$3)
         ORDER BY s.name`,
        [actor.tenant_id, actor.id, actor.account_id],
      )
    ).rows;
    const applications = (
      await this.db.query(
        `SELECT a.id,a.registration_number,a.status,a.submitted_at,a.student_id,
         i.name,p.name AS period_name,tr.name AS track_name,tr.cost AS track_cost,
         COALESCE((SELECT json_agg(json_build_object(
          'document_type',d.document_type,'status',d.verification_status,'notes',d.notes
         ) ORDER BY d.created_at) FROM application_documents d
          WHERE d.tenant_id=a.tenant_id AND d.application_id=a.id),'[]') AS documents
         FROM applications a JOIN applicants i
          ON i.tenant_id=a.tenant_id AND i.id=a.applicant_id
         JOIN admission_periods p ON p.tenant_id=a.tenant_id AND p.id=a.period_id
         LEFT JOIN admission_tracks tr ON tr.tenant_id=a.tenant_id AND tr.id=a.track_id
         WHERE a.tenant_id=$1 AND a.family_account_id=$2
         ORDER BY a.submitted_at DESC`,
        [actor.tenant_id, actor.account_id],
      )
    ).rows;
    const periods = (
      await this.db.query(
        `SELECT p.id,p.name,p.starts_on,p.ends_on,y.name AS academic_year,
         COALESCE((SELECT json_agg(json_build_object('id',g.id,'name',g.name) ORDER BY g.level)
          FROM grade_levels g WHERE g.tenant_id=p.tenant_id AND g.school_id=p.school_id),'[]') AS grade_levels,
         COALESCE((SELECT json_agg(json_build_object('id',tr.id,'name',tr.name,'code',tr.code,'cost',tr.cost,'capacity',tr.capacity) ORDER BY tr.name)
          FROM admission_tracks tr WHERE tr.tenant_id=p.tenant_id AND tr.period_id=p.id AND tr.active),'[]') AS tracks
         FROM admission_periods p JOIN academic_years y
          ON y.tenant_id=p.tenant_id AND y.id=p.academic_year_id
         WHERE p.tenant_id=$1 AND p.status='OPEN'
         AND (now() AT TIME ZONE 'Asia/Jakarta')::date BETWEEN p.starts_on AND p.ends_on
         ORDER BY p.starts_on,p.name`,
        [actor.tenant_id],
      )
    ).rows;
    return { students, applications, periods, needs_ppdb: !students.length };
  }
  async apply(actor: Actor, body: unknown) {
    this.family(actor);
    allow(actor, "family.write");
    if (!actor.roles.includes("PARENT"))
      throw new BadRequestException("Hanya wali yang dapat mendaftarkan siswa");
    const input = familyApplication.parse(body);
    const parent = (
      await this.db.query(
        `SELECT p.name,p.phone FROM parents p JOIN users u
         ON u.tenant_id=p.tenant_id AND u.id=p.user_id
         WHERE p.tenant_id=$1 AND u.account_id=$2 LIMIT 1`,
        [actor.tenant_id, actor.account_id],
      )
    ).rows[0];
    if (!parent) throw new NotFoundException("Data wali tidak ditemukan");
    return this.db.transaction(actor.tenant_id, (sql) =>
      createApplication(
        sql,
        actor.tenant_id,
        {
          ...input,
          guardian_name: parent.name,
          guardian_phone: parent.phone,
        },
        true,
        actor.account_id,
      ),
    );
  }
  async uploadDocument(actor: Actor, id: string, body: unknown) {
    this.family(actor);
    allow(actor, "family.write");
    const applicationId = uuid.parse(id);
    const input = familyDocument.parse(body);
    const application = (
      await this.db.query(
        `SELECT id FROM applications
         WHERE tenant_id=$1 AND id=$2 AND family_account_id=$3
         AND status NOT IN ('REJECTED','ENROLLED','WITHDRAWN')`,
        [actor.tenant_id, applicationId, actor.account_id],
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
            `SELECT file_id FROM application_documents
             WHERE tenant_id=$1 AND application_id=$2 AND document_type=$3`,
            [actor.tenant_id, applicationId, input.document_type],
          )
        ).rows[0];
        await sql.query(
          `INSERT INTO application_documents(tenant_id,application_id,file_id,document_type)
           VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,application_id,document_type)
           DO UPDATE SET file_id=EXCLUDED.file_id,verification_status='PENDING',notes=''`,
          [actor.tenant_id, applicationId, file.id, input.document_type],
        );
        await sql.query(
          `INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id)
           VALUES($1,$2,'APPLICATION',$3)`,
          [actor.tenant_id, file.id, applicationId],
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
  async createStudentAccount(actor: Actor, id: string, body: unknown) {
    this.family(actor);
    allow(actor, "family.student.manage");
    const studentId = uuid.parse(id);
    const input = z
      .object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
        password: z.string().min(12).max(100),
      })
      .strict()
      .parse(body);
    if (input.email === actor.email)
      throw new BadRequestException(
        "Email siswa harus berbeda dari email wali",
      );
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const student = (
        await sql.query(
          `SELECT s.* FROM students s JOIN student_guardians sg
           ON sg.tenant_id=s.tenant_id AND sg.student_id=s.id
           JOIN parents p ON p.tenant_id=sg.tenant_id AND p.id=sg.parent_id
           JOIN users u ON u.tenant_id=p.tenant_id AND u.id=p.user_id
           WHERE s.tenant_id=$1 AND s.id=$2 AND u.account_id=$3 FOR UPDATE OF s`,
          [actor.tenant_id, studentId, actor.account_id],
        )
      ).rows[0];
      if (!student) throw new NotFoundException("Siswa tidak ditemukan");
      if (student.user_id)
        throw new ConflictException("Siswa sudah memiliki akun");
      if (
        (
          await sql.query("SELECT 1 FROM accounts WHERE email=$1", [
            input.email,
          ])
        ).rowCount
      )
        throw new ConflictException("Email siswa sudah digunakan");
      const account = (
        await sql.query(
          "INSERT INTO accounts(name,email,account_level) VALUES($1,$2,'FAMILY') RETURNING id",
          [student.name, input.email],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SELF_REGISTRATION')",
        [account.id],
      );
      const user = (
        await sql.query(
          `INSERT INTO users(tenant_id,account_id,name,email,password_hash)
           VALUES($1,$2,$3,$4,$5) RETURNING id,name,email`,
          [
            actor.tenant_id,
            account.id,
            student.name,
            input.email,
            await hash(input.password, 12),
          ],
        )
      ).rows[0];
      await sql.query(
        "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'STUDENT')",
        [actor.tenant_id, user.id],
      );
      await sql.query(
        `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
         VALUES($1,$2,$3,'STUDENT') ON CONFLICT DO NOTHING`,
        [account.id, actor.organization_id, actor.tenant_id],
      );
      await sql.query(
        "UPDATE students SET user_id=$3,email=COALESCE(email,$4) WHERE tenant_id=$1 AND id=$2",
        [actor.tenant_id, studentId, user.id, input.email],
      );
      return user;
    });
  }
}
