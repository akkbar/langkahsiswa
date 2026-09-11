import { z } from "zod";
export const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(160);
const code = z.string().trim().min(1).max(40);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Tanggal tidak valid",
  );
const optionalText = z.string().trim().max(1000).nullable().optional();
const optionalId = uuid.nullable().optional();
const optionalRegistryId = z.string().trim().max(80).nullable().optional();
const person = {
  name,
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: optionalText,
  user_id: optionalId,
};
export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "email" | "checkbox" | "select";
  resource?: string;
  options?: string[];
  optional?: boolean;
  min?: number;
  max?: number;
};
export type Resource = {
  table: string;
  title: string;
  group: string;
  permission: string;
  schema: z.AnyZodObject;
  fields: Field[];
  immutable?: string[];
};
const f = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  ...extra,
});
const ref = (key: string, label: string, resource: string, optional = false) =>
  f(key, label, { type: "select", resource, optional });
const textFields = [
  f("name", "Nama"),
  f("email", "Email", { type: "email", optional: true }),
  f("phone", "Telepon", { optional: true }),
  f("address", "Alamat", { optional: true }),
  ref("user_id", "Akun pengguna", "users", true),
];
export const resources: Record<string, Resource> = {
  schools: {
    table: "schools",
    title: "Pengaturan Sekolah",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      name,
      address: optionalText,
      phone: optionalText,
      principal_name: optionalText,
    }),
    fields: [
      f("name", "Nama sekolah"),
      f("address", "Alamat", { optional: true }),
      f("phone", "Telepon", { optional: true }),
      f("principal_name", "Nama kepala sekolah", { optional: true }),
    ],
  },
  "academic-years": {
    table: "academic_years",
    title: "Tahun Ajaran",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      school_id: uuid,
      name,
      start_date: date,
      end_date: date,
      is_active: z.boolean().default(false),
    }),
    fields: [
      ref("school_id", "Sekolah", "schools"),
      f("name", "Tahun ajaran"),
      f("start_date", "Mulai", { type: "date" }),
      f("end_date", "Selesai", { type: "date" }),
      f("is_active", "Aktif", { type: "checkbox" }),
    ],
    immutable: ["school_id"],
  },
  semesters: {
    table: "semesters",
    title: "Semester",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      academic_year_id: uuid,
      name,
      start_date: date,
      end_date: date,
    }),
    fields: [
      ref("academic_year_id", "Tahun ajaran", "academic-years"),
      f("name", "Semester"),
      f("start_date", "Mulai", { type: "date" }),
      f("end_date", "Selesai", { type: "date" }),
    ],
    immutable: ["academic_year_id"],
  },
  "academic-calendar": {
    table: "academic_calendar_events",
    title: "Kalender Akademik",
    group: "Administrasi",
    permission: "academic",
    schema: z.object({
      academic_year_id: uuid,
      title: name,
      event_type: z.enum([
        "EFFECTIVE_DAY",
        "NATIONAL_HOLIDAY",
        "SCHOOL_HOLIDAY",
        "MPLS",
        "MIDTERM",
        "FINAL",
        "REPORT",
        "PROMOTION",
        "GRADUATION",
        "SCHOOL_EVENT",
        "ANNOUNCEMENT",
        "PARENT_MEETING",
        "TEACHER_MEETING",
        "STUDENT_ACTIVITY",
        "DEADLINE",
        "REMINDER",
      ]),
      start_date: date,
      end_date: date,
      notes: z.string().trim().max(500).nullable().optional(),
    }),
    fields: [
      ref("academic_year_id", "Tahun ajaran", "academic-years"),
      f("title", "Nama agenda"),
      f("event_type", "Jenis agenda", {
        type: "select",
        options: [
          "EFFECTIVE_DAY",
          "NATIONAL_HOLIDAY",
          "SCHOOL_HOLIDAY",
          "MPLS",
          "MIDTERM",
          "FINAL",
          "REPORT",
          "PROMOTION",
          "GRADUATION",
          "SCHOOL_EVENT",
          "ANNOUNCEMENT",
          "PARENT_MEETING",
          "TEACHER_MEETING",
          "STUDENT_ACTIVITY",
          "DEADLINE",
          "REMINDER",
        ],
      }),
      f("start_date", "Tanggal mulai", { type: "date" }),
      f("end_date", "Tanggal selesai", { type: "date" }),
      f("notes", "Catatan", { optional: true }),
    ],
    immutable: ["academic_year_id"],
  },
  "grade-levels": {
    table: "grade_levels",
    title: "Tingkat Kelas",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      school_id: uuid,
      name,
      level: z.number().int().min(1).max(20),
    }),
    fields: [
      ref("school_id", "Sekolah", "schools"),
      f("name", "Nama tingkat"),
      f("level", "Urutan", { type: "number", min: 1, max: 20 }),
    ],
    immutable: ["school_id"],
  },
  classrooms: {
    table: "classrooms",
    title: "Kelas",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      school_id: uuid,
      name,
      code,
      building: z.string().trim().max(120).nullable().optional(),
      floor: z.string().trim().max(40).nullable().optional(),
      location: z.string().trim().max(240).nullable().optional(),
      capacity: z.number().int().min(1).max(500),
      is_active: z.boolean().default(true),
    }),
    fields: [
      ref("school_id", "Sekolah", "schools"),
      f("name", "Nama ruang"),
      f("code", "Kode ruang"),
      f("building", "Gedung", { optional: true }),
      f("floor", "Lantai", { optional: true }),
      f("location", "Posisi ruang", { optional: true }),
      f("capacity", "Kapasitas", { type: "number", min: 1, max: 500 }),
      f("is_active", "Tersedia", { type: "checkbox" }),
    ],
    immutable: ["school_id"],
  },
  classes: {
    table: "classes",
    title: "Kelas",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({
      academic_year_id: uuid,
      grade_level_id: uuid,
      name,
      homeroom_teacher_id: optionalId,
    }),
    fields: [
      ref("academic_year_id", "Tahun ajaran", "academic-years"),
      ref("grade_level_id", "Tingkat", "grade-levels"),
      f("name", "Nama kelas"),
      ref("homeroom_teacher_id", "Wali kelas", "teachers", true),
    ],
    immutable: ["academic_year_id", "grade_level_id"],
  },
  subjects: {
    table: "subjects",
    title: "Mata Pelajaran",
    group: "Master Sekolah",
    permission: "school",
    schema: z.object({ school_id: uuid, name, code }),
    fields: [
      ref("school_id", "Sekolah", "schools"),
      f("code", "Kode"),
      f("name", "Mata pelajaran"),
    ],
    immutable: ["school_id"],
  },
  students: {
    table: "students",
    title: "Siswa",
    group: "Warga Sekolah",
    permission: "student",
    schema: z.object({
      ...person,
      nis: code,
      birth_date: date.nullable().optional(),
      gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED"]).default("ACTIVE"),
    }),
    fields: [
      f("nis", "NIS"),
      ...textFields,
      f("birth_date", "Tanggal lahir", { type: "date", optional: true }),
      f("gender", "Jenis kelamin", {
        type: "select",
        options: ["MALE", "FEMALE"],
        optional: true,
      }),
      f("status", "Status", {
        type: "select",
        options: ["ACTIVE", "INACTIVE", "GRADUATED"],
      }),
    ],
  },
  parents: {
    table: "parents",
    title: "Orang Tua",
    group: "Warga Sekolah",
    permission: "people",
    schema: z.object(person),
    fields: textFields,
  },
  teachers: {
    table: "teachers",
    title: "Guru",
    group: "Warga Sekolah",
    permission: "people",
    schema: z.object({ ...person, nip: code }),
    fields: [f("nip", "NIP"), ...textFields],
  },
  staff: {
    table: "staff",
    title: "Staf",
    group: "Warga Sekolah",
    permission: "people",
    schema: z.object({ ...person, employee_number: code, position: name }),
    fields: [
      f("employee_number", "Nomor pegawai"),
      ...textFields,
      f("position", "Jabatan"),
    ],
  },
  "student-guardians": {
    table: "student_guardians",
    title: "Wali Siswa",
    group: "Warga Sekolah",
    permission: "people",
    schema: z.object({
      student_id: uuid,
      parent_id: uuid,
      relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN"]),
      is_primary: z.boolean().default(false),
      can_pickup: z.boolean().default(true),
      receive_notification: z.boolean().default(true),
    }),
    fields: [
      ref("student_id", "Siswa", "students"),
      ref("parent_id", "Orang tua", "parents"),
      f("relationship", "Hubungan", {
        type: "select",
        options: ["FATHER", "MOTHER", "GUARDIAN"],
      }),
      f("is_primary", "Wali utama", { type: "checkbox" }),
      f("can_pickup", "Boleh menjemput", { type: "checkbox" }),
      f("receive_notification", "Terima pemberitahuan", { type: "checkbox" }),
    ],
    immutable: ["student_id", "parent_id"],
  },
  "teacher-subjects": {
    table: "teacher_subjects",
    title: "Kompetensi Guru",
    group: "Akademik",
    permission: "academic",
    schema: z.object({ teacher_id: uuid, subject_id: uuid }),
    fields: [
      ref("teacher_id", "Guru", "teachers"),
      ref("subject_id", "Pelajaran", "subjects"),
    ],
    immutable: ["teacher_id", "subject_id"],
  },
  "teacher-competencies": {
    table: "teacher_competencies",
    title: "Kompetensi Guru",
    group: "Warga Sekolah",
    permission: "people",
    schema: z.object({
      teacher_id: uuid,
      subject_id: uuid,
      grade_level_id: uuid,
    }),
    fields: [
      ref("teacher_id", "Guru", "teachers"),
      ref("subject_id", "Mata pelajaran", "subjects"),
      ref("grade_level_id", "Tingkat kelas", "grade-levels"),
    ],
    immutable: ["teacher_id", "subject_id", "grade_level_id"],
  },
  "class-subjects": {
    table: "class_subjects",
    title: "Pelajaran Kelas",
    group: "Akademik",
    permission: "academic",
    schema: z.object({
      class_id: uuid,
      subject_id: uuid,
      teacher_id: uuid,
      semester_id: uuid,
    }),
    fields: [
      ref("class_id", "Kelas", "classes"),
      ref("subject_id", "Pelajaran", "subjects"),
      ref("teacher_id", "Guru", "teachers"),
      ref("semester_id", "Semester", "semesters"),
    ],
    immutable: ["class_id", "subject_id", "teacher_id", "semester_id"],
  },
  "class-students": {
    table: "class_students",
    title: "Anggota Kelas",
    group: "Akademik",
    permission: "academic",
    schema: z.object({ class_id: uuid, student_id: uuid }),
    fields: [
      ref("class_id", "Kelas", "classes"),
      ref("student_id", "Siswa", "students"),
    ],
    immutable: ["class_id", "student_id"],
  },
  timetables: {
    table: "timetables",
    title: "Jadwal Pelajaran",
    group: "Akademik",
    permission: "academic",
    schema: z.object({
      class_subject_id: uuid,
      day_of_week: z.number().int().min(1).max(7),
      start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      room: optionalText,
    }),
    fields: [
      ref("class_subject_id", "Pelajaran kelas", "class-subjects"),
      f("day_of_week", "Hari (1 Senin – 7 Minggu)", {
        type: "number",
        min: 1,
        max: 7,
      }),
      f("start_time", "Mulai", { type: "time" }),
      f("end_time", "Selesai", { type: "time" }),
      f("room", "Ruangan", { optional: true }),
    ],
    immutable: ["class_subject_id"],
  },
  "assessment-categories": {
    table: "assessment_categories",
    title: "Bobot Penilaian",
    group: "Penilaian",
    permission: "grade",
    schema: z.object({
      class_subject_id: uuid,
      name,
      weight: z.number().positive().max(100),
    }),
    fields: [
      ref("class_subject_id", "Pelajaran kelas", "class-subjects"),
      f("name", "Kategori"),
      f("weight", "Bobot (%)", { type: "number", min: 0.01, max: 100 }),
    ],
    immutable: ["class_subject_id"],
  },
  assessments: {
    table: "assessments",
    title: "Penilaian",
    group: "Penilaian",
    permission: "grade",
    schema: z.object({
      category_id: uuid,
      name,
      max_score: z.number().positive().max(10000),
      due_date: date,
    }),
    fields: [
      ref("category_id", "Kategori", "assessment-categories"),
      f("name", "Nama penilaian"),
      f("max_score", "Nilai maksimum", {
        type: "number",
        min: 0.01,
        max: 10000,
      }),
      f("due_date", "Tanggal", { type: "date" }),
    ],
    immutable: ["category_id"],
  },
};
export const loginSchema = z
  .object({
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(200),
    tenant_slug: z.string().min(1).max(80).optional(),
    organization_code: z.string().trim().min(1).max(80).optional(),
    account_type: z
      .enum(["SCHOOL_ADMIN", "FAMILY", "SCHOOL_TENANT"])
      .optional(),
    remember: z.boolean().optional().default(false),
  })
  .strict();
export const tenantSchema = z
  .object({
    name,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    admin_email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    admin_name: name,
    admin_password: z.string().min(12).max(100),
  })
  .strict();
const optionalShortText = z.string().trim().max(255).nullable().optional();
const optionalDate = date.nullable().optional();
export const foundationProfileSchema = z
  .object({
    code: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80)
      .optional(),
    name: name.optional(),
    short_name: optionalShortText,
    legal_name: optionalShortText,
    legal_status: z.enum(["ACTIVE", "INACTIVE", "DISSOLVED"]).optional(),
    legal_entity_number: optionalShortText,
    legal_entity_date: optionalDate,
    ahu_registration_number: optionalShortText,
    deed_number: optionalShortText,
    deed_date: optionalDate,
    notary_name: optionalShortText,
    npwp: optionalRegistryId,
    nib: optionalRegistryId,
    npyp: optionalRegistryId,
    address: optionalText,
    province_id: optionalRegistryId,
    city_id: optionalRegistryId,
    district_id: optionalRegistryId,
    village_id: optionalRegistryId,
    postal_code: optionalRegistryId,
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().email().max(200).nullable().optional(),
    website: z.string().url().max(500).nullable().optional(),
    established_date: optionalDate,
    foundation_type: z
      .enum(["EDUCATION", "SOCIAL", "RELIGIOUS", "HUMANITARIAN", "OTHER"])
      .optional(),
  })
  .strict();
export const foundationOfficialSchema = z
  .object({
    person_name: name,
    organ_type: z.enum(["PEMBINA", "PENGURUS", "PENGAWAS"]),
    position: name,
    start_date: date,
    end_date: optionalDate,
    is_active: z.boolean().default(true),
    appointment_document_id: optionalId,
  })
  .strict();
export const foundationLicenseSchema = z
  .object({
    license_type: z.enum([
      "AHU_APPROVAL",
      "NIB",
      "TAX_REGISTRATION",
      "DOMICILE",
      "FOUNDATION_OPERATIONAL",
      "OTHER",
    ]),
    license_number: code,
    issued_by: optionalShortText,
    issue_date: optionalDate,
    valid_from: optionalDate,
    valid_until: optionalDate,
    document_id: optionalId,
    status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "REVOKED"]).default("ACTIVE"),
    notes: optionalText,
  })
  .strict();
export const foundationDocumentSchema = z
  .object({
    document_type: code,
    document_number: optionalShortText,
    document_date: optionalDate,
    file_url: z.string().url().max(1000).nullable().optional(),
    valid_from: optionalDate,
    valid_until: optionalDate,
    is_active: z.boolean().default(true),
    notes: optionalText,
  })
  .strict();
export const foundationTaxSchema = z
  .object({
    npwp: optionalRegistryId,
    tax_status: z.enum(["UNREGISTERED", "REGISTERED", "INACTIVE"]),
    pkp_status: z.enum(["NON_PKP", "PKP"]),
    tax_office_name: optionalShortText,
    tax_office_code: optionalRegistryId,
    bookkeeping_start_month: z.number().int().min(1).max(12),
    fiscal_year_start: optionalDate,
    tax_email: z.string().email().max(200).nullable().optional(),
    tax_phone: z.string().trim().max(30).nullable().optional(),
  })
  .strict();
const schoolLegalFields = {
  education_form: optionalRegistryId,
  ownership_status: z.enum(["PUBLIC", "PRIVATE"]).optional().default("PRIVATE"),
  province_id: optionalRegistryId,
  city_id: optionalRegistryId,
  district_id: optionalRegistryId,
  village_id: optionalRegistryId,
  postal_code: optionalRegistryId,
  establishment_decree_number: optionalRegistryId,
  establishment_decree_date: optionalDate,
  operational_license_number: optionalRegistryId,
  operational_license_start: optionalDate,
  operational_license_end: optionalDate,
  accreditation: optionalRegistryId,
  accreditation_number: optionalRegistryId,
  accreditation_valid_until: optionalDate,
};
export const siteSchema = z
  .object({
    name,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    school_name: name.optional(),
    address: optionalText,
    phone: optionalText,
    principal_name: optionalText,
    principal_teacher_id: optionalId,
    education_authority: z
      .enum(["KEMENDIKBUD", "KEMENAG"])
      .optional()
      .default("KEMENDIKBUD"),
    school_level: z
      .enum(["PAUD", "TK", "SD", "SMP", "SMA"])
      .optional()
      .default("SMP"),
    npsn: optionalRegistryId,
    nss: optionalRegistryId,
    dapodik_id: optionalRegistryId,
    nsm: optionalRegistryId,
    emis_id: optionalRegistryId,
    ...schoolLegalFields,
  })
  .strict();
export const siteUpdateSchema = z
  .object({
    name: name.optional(),
    school_name: name.optional(),
    address: optionalText,
    phone: optionalText,
    principal_teacher_id: optionalId,
    education_authority: z.enum(["KEMENDIKBUD", "KEMENAG"]).optional(),
    school_level: z.enum(["PAUD", "TK", "SD", "SMP", "SMA"]).optional(),
    npsn: optionalRegistryId,
    nss: optionalRegistryId,
    dapodik_id: optionalRegistryId,
    nsm: optionalRegistryId,
    emis_id: optionalRegistryId,
    education_form: optionalRegistryId,
    ownership_status: z.enum(["PUBLIC", "PRIVATE"]).optional(),
    province_id: optionalRegistryId,
    city_id: optionalRegistryId,
    district_id: optionalRegistryId,
    village_id: optionalRegistryId,
    postal_code: optionalRegistryId,
    establishment_decree_number: optionalRegistryId,
    establishment_decree_date: optionalDate,
    operational_license_number: optionalRegistryId,
    operational_license_start: optionalDate,
    operational_license_end: optionalDate,
    accreditation: optionalRegistryId,
    accreditation_number: optionalRegistryId,
    accreditation_valid_until: optionalDate,
  })
  .strict();
export const sitePhotoSchema = z
  .object({
    file_name: z.string().trim().min(1).max(180),
    mime_type: z.enum(["image/png", "image/jpeg"]),
    data_base64: z.string().min(4).max(6_990_508),
  })
  .strict();
export const userSchema = z
  .object({
    name,
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(100),
    account_type: z
      .enum(["SCHOOL_ADMIN", "FAMILY", "SCHOOL_TENANT"])
      .optional(),
    roles: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[A-Z][A-Z0-9_]*$/),
      )
      .min(1),
  })
  .strict();
export const attendanceSchema = z
  .object({
    class_id: uuid,
    semester_id: uuid,
    date,
    records: z
      .array(
        z
          .object({
            student_id: uuid,
            status: z.enum(["PRESENT", "LATE", "SICK", "PERMISSION", "ABSENT"]),
            notes: optionalText,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export const scoresSchema = z
  .object({
    assessment_id: uuid,
    scores: z
      .array(
        z
          .object({ student_id: uuid, score: z.number().min(0).max(10000) })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export const reportSchema = z
  .object({ student_id: uuid, class_id: uuid, semester_id: uuid })
  .strict();
