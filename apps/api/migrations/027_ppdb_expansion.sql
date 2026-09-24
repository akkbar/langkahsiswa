-- PPDB Expansion: Custom Form Builder, Payment Schemes, Interview Scheduling

-- 1. Form sections (5 default + custom)
CREATE TABLE admission_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  period_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false, -- default 5 sections
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, period_id) REFERENCES admission_periods(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

-- 2. Form fields within sections
CREATE TABLE admission_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  section_id uuid NOT NULL,
  label text NOT NULL,
  field_key text NOT NULL, -- special keys: 'KK_NUMBER', 'KTP_NUMBER', 'FULL_NAME', etc.
  field_type text NOT NULL CHECK(field_type IN (
    'TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'DATE', 'SELECT', 'RADIO', 'CHECKBOX',
    'FILE_UPLOAD', 'NUMBER', 'RICH_TEXT'
  )),
  options jsonb DEFAULT '[]', -- for SELECT/RADIO/CHECKBOX: [{value, label}]
  placeholder text DEFAULT '',
  help_text text DEFAULT '',
  is_required boolean NOT NULL DEFAULT false,
  is_special_key boolean NOT NULL DEFAULT false, -- maps to core DB columns
  order_index integer NOT NULL DEFAULT 0,
  validation jsonb DEFAULT '{}', -- min/max length, regex, etc.
  conditional_logic jsonb DEFAULT '{}', -- show/hide based on other fields
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, section_id) REFERENCES admission_form_sections(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

-- 3. Form responses (parent submissions per section)
CREATE TABLE admission_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL,
  section_id uuid NOT NULL,
  field_id uuid NOT NULL,
  value_text text,
  value_json jsonb,
  file_id uuid, -- references managed_files
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, application_id) REFERENCES applications(tenant_id, id),
  FOREIGN KEY(tenant_id, section_id) REFERENCES admission_form_sections(tenant_id, id),
  FOREIGN KEY(tenant_id, field_id) REFERENCES admission_form_fields(tenant_id, id)
);

-- 4. Payment schemes per track (registration fee, entry fee, monthly SPP, etc.)
CREATE TABLE admission_payment_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  track_id uuid NOT NULL,
  name text NOT NULL, -- 'Uang Pendaftaran', 'Biaya Masuk', 'SPP Bulanan'
  code text NOT NULL CHECK(code = upper(code)), -- 'REGISTRATION_FEE', 'ENTRY_FEE', 'MONTHLY_TUITION'
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(amount >= 0),
  is_required boolean NOT NULL DEFAULT true,
  due_date_type text NOT NULL DEFAULT 'IMMEDIATE' CHECK(due_date_type IN (
    'IMMEDIATE', -- saat daftar
    'ON_ACCEPTANCE', -- saat diterima
    'MONTHLY_START', -- mulai bulan pertama sekolah
    'CUSTOM_DATE' -- tanggal custom
  )),
  due_date date, -- untuk CUSTOM_DATE
  installment_count integer DEFAULT 1 CHECK(installment_count >= 1), -- cicilan
  installment_interval_months integer DEFAULT 1, -- interval cicilan
  description text DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  UNIQUE(tenant_id, track_id, code),
  FOREIGN KEY(tenant_id, track_id) REFERENCES admission_tracks(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

-- 5. Application payment records (tracking pembayaran per scheme)
CREATE TABLE admission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL,
  payment_scheme_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PAID', 'PARTIAL', 'WAIVED', 'REFUNDED')),
  installment_number integer DEFAULT 1,
  due_date date,
  paid_at timestamptz,
  payment_proof_file_id uuid, -- references managed_files
  verified_by uuid,
  verified_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, application_id) REFERENCES applications(tenant_id, id),
  FOREIGN KEY(tenant_id, payment_scheme_id) REFERENCES admission_payment_schemes(tenant_id, id),
  FOREIGN KEY(tenant_id, payment_proof_file_id) REFERENCES managed_files(tenant_id, id),
  FOREIGN KEY(tenant_id, verified_by) REFERENCES users(tenant_id, id)
);

-- 6. Interview slots (admin defines schedule)
CREATE TABLE admission_interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  period_id uuid NOT NULL,
  track_id uuid, -- nullable = all tracks
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  quota integer NOT NULL DEFAULT 1 CHECK(quota > 0),
  location text DEFAULT '',
  notes text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, period_id) REFERENCES admission_periods(tenant_id, id),
  FOREIGN KEY(tenant_id, track_id) REFERENCES admission_tracks(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

-- 7. Interview bookings (parent picks slot)
CREATE TABLE admission_interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  booked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'BOOKED' CHECK(status IN ('BOOKED', 'ATTENDED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED')),
  attended_at timestamptz,
  notes text DEFAULT '',
  UNIQUE(tenant_id, id),
  UNIQUE(tenant_id, application_id), -- one active booking per application
  FOREIGN KEY(tenant_id, application_id) REFERENCES applications(tenant_id, id),
  FOREIGN KEY(tenant_id, slot_id) REFERENCES admission_interview_slots(tenant_id, id)
);

-- 8. Document template for "Formulir Kesanggupan" (PDF template)
CREATE TABLE admission_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  period_id uuid,
  name text NOT NULL,
  description text DEFAULT '',
  template_html text NOT NULL, -- HTML template with placeholders
  template_type text NOT NULL DEFAULT 'CONSENT_FORM' CHECK(template_type IN ('CONSENT_FORM', 'CUSTOM')),
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, period_id) REFERENCES admission_periods(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

-- Indexes
CREATE INDEX admission_form_sections_period ON admission_form_sections(tenant_id, period_id, order_index);
CREATE INDEX admission_form_fields_section ON admission_form_fields(tenant_id, section_id, order_index);
CREATE INDEX admission_form_responses_app_section ON admission_form_responses(tenant_id, application_id, section_id);
CREATE INDEX admission_payment_schemes_track ON admission_payment_schemes(tenant_id, track_id, order_index);
CREATE INDEX admission_payments_app_scheme ON admission_payments(tenant_id, application_id, payment_scheme_id);
CREATE INDEX admission_interview_slots_period ON admission_interview_slots(tenant_id, period_id, date, start_time);
CREATE INDEX admission_interview_bookings_app ON admission_interview_bookings(tenant_id, application_id);
CREATE INDEX admission_interview_bookings_slot ON admission_interview_bookings(tenant_id, slot_id, status);
CREATE INDEX admission_document_templates_period ON admission_document_templates(tenant_id, period_id);

-- Insert default form sections for existing periods
INSERT INTO admission_form_sections (tenant_id, period_id, name, description, order_index, is_required, is_default, created_by)
SELECT
  p.tenant_id,
  p.id,
  s.name,
  s.description,
  s.order_index,
  s.is_required,
  true,
  p.created_by
FROM admission_periods p
CROSS JOIN (
  VALUES
    (1, 'Data Siswa', 'Informasi dasar calon siswa', true),
    (2, 'Data Orang Tua/Wali', 'Informasi orang tua atau wali calon siswa', true),
    (3, 'Formulir Kesanggupan', 'Surat pernyataan kesanggupan orang tua', true),
    (4, 'Dokumen Upload', 'Unggah dokumen persyaratan (KK, Akta Lahir, dll)', true),
    (5, 'Bukti Pembayaran Pendaftaran', 'Bukti pembayaran biaya pendaftaran', true)
) AS s(order_index, name, description, is_required)
WHERE NOT EXISTS (
  SELECT 1 FROM admission_form_sections fs WHERE fs.tenant_id = p.tenant_id AND fs.period_id = p.id
);

-- Insert default special fields for "Data Siswa" section
INSERT INTO admission_form_fields (tenant_id, section_id, label, field_key, field_type, is_required, is_special_key, order_index, created_by)
SELECT
  fs.tenant_id,
  fs.id,
  f.label,
  f.field_key,
  f.field_type,
  f.is_required,
  f.is_special_key,
  f.order_index,
  fs.created_by
FROM admission_form_sections fs
JOIN (
  VALUES
    ('FULL_NAME', 'Nama Lengkap', 'TEXT', true, true, 1),
    ('GENDER', 'Jenis Kelamin', 'RADIO', true, true, 2),
    ('BIRTH_DATE', 'Tanggal Lahir', 'DATE', true, true, 3),
    ('BIRTH_PLACE', 'Tempat Lahir', 'TEXT', false, false, 4),
    ('NIK', 'NIK', 'TEXT', false, true, 5),
    ('NISN', 'NISN', 'TEXT', false, true, 6),
    ('RELIGION', 'Agama', 'SELECT', false, false, 7),
    ('ADDRESS', 'Alamat Lengkap', 'TEXTAREA', true, true, 8)
) AS f(field_key, label, field_type, is_required, is_special_key, order_index)
ON fs.name = 'Data Siswa'
WHERE fs.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM admission_form_fields fld WHERE fld.section_id = fs.id
);

-- Insert default special fields for "Data Orang Tua/Wali" section
INSERT INTO admission_form_fields (tenant_id, section_id, label, field_key, field_type, is_required, is_special_key, order_index, created_by)
SELECT
  fs.tenant_id,
  fs.id,
  f.label,
  f.field_key,
  f.field_type,
  f.is_required,
  f.is_special_key,
  f.order_index,
  fs.created_by
FROM admission_form_sections fs
JOIN (
  VALUES
    ('FATHER_NAME', 'Nama Ayah', 'TEXT', true, true, 1),
    ('FATHER_NIK', 'NIK Ayah', 'TEXT', false, true, 2),
    ('FATHER_PHONE', 'Telepon Ayah', 'PHONE', true, true, 3),
    ('FATHER_JOB', 'Pekerjaan Ayah', 'TEXT', false, false, 4),
    ('FATHER_INCOME', 'Penghasilan Ayah', 'SELECT', false, false, 5),
    ('MOTHER_NAME', 'Nama Ibu', 'TEXT', true, true, 6),
    ('MOTHER_NIK', 'NIK Ibu', 'TEXT', false, true, 7),
    ('MOTHER_PHONE', 'Telepon Ibu', 'PHONE', true, true, 8),
    ('MOTHER_JOB', 'Pekerjaan Ibu', 'TEXT', false, false, 9),
    ('MOTHER_INCOME', 'Penghasilan Ibu', 'SELECT', false, false, 10),
    ('GUARDIAN_NAME', 'Nama Wali (jika bukan orang tua)', 'TEXT', false, true, 11),
    ('GUARDIAN_NIK', 'NIK Wali', 'TEXT', false, true, 12),
    ('GUARDIAN_PHONE', 'Telepon Wali', 'PHONE', false, true, 13),
    ('GUARDIAN_RELATION', 'Hubungan dengan Calon Siswa', 'SELECT', false, false, 14),
    ('FAMILY_ADDRESS', 'Alamat Orang Tua/Wali', 'TEXTAREA', true, true, 15)
) AS f(field_key, label, field_type, is_required, is_special_key, order_index)
ON fs.name = 'Data Orang Tua/Wali'
WHERE fs.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM admission_form_fields fld WHERE fld.section_id = fs.id
);

-- Insert default special fields for "Dokumen Upload" section
INSERT INTO admission_form_fields (tenant_id, section_id, label, field_key, field_type, is_required, is_special_key, order_index, created_by)
SELECT
  fs.tenant_id,
  fs.id,
  f.label,
  f.field_key,
  f.field_type,
  f.is_required,
  f.is_special_key,
  f.order_index,
  fs.created_by
FROM admission_form_sections fs
JOIN (
  VALUES
    ('KK_FILE', 'Kartu Keluarga (KK)', 'FILE_UPLOAD', true, true, 1),
    ('BIRTH_CERT_FILE', 'Akta Kelahiran', 'FILE_UPLOAD', true, true, 2),
    ('PHOTO_FILE', 'Foto Calon Siswa', 'FILE_UPLOAD', true, true, 3),
    ('REPORT_CARD_FILE', 'Raport Terakhir (opsional)', 'FILE_UPLOAD', false, false, 4),
    ('OTHER_DOC_FILE', 'Dokumen Lainnya', 'FILE_UPLOAD', false, false, 5)
) AS f(field_key, label, field_type, is_required, is_special_key, order_index)
ON fs.name = 'Dokumen Upload'
WHERE fs.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM admission_form_fields fld WHERE fld.section_id = fs.id
);

-- Insert default special fields for "Bukti Pembayaran Pendaftaran" section
INSERT INTO admission_form_fields (tenant_id, section_id, label, field_key, field_type, is_required, is_special_key, order_index, created_by)
SELECT
  fs.tenant_id,
  fs.id,
  f.label,
  f.field_key,
  f.field_type,
  f.is_required,
  f.is_special_key,
  f.order_index,
  fs.created_by
FROM admission_form_sections fs
JOIN (
  VALUES
    ('PAYMENT_PROOF_FILE', 'Bukti Pembayaran', 'FILE_UPLOAD', true, true, 1),
    ('PAYMENT_DATE', 'Tanggal Pembayaran', 'DATE', true, false, 2),
    ('PAYMENT_METHOD', 'Metode Pembayaran', 'SELECT', true, false, 3),
    ('PAYMENT_NOTES', 'Catatan Pembayaran', 'TEXTAREA', false, false, 4)
) AS f(field_key, label, field_type, is_required, is_special_key, order_index)
ON fs.name = 'Bukti Pembayaran Pendaftaran'
WHERE fs.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM admission_form_fields fld WHERE fld.section_id = fs.id
);

-- Insert default payment schemes for existing tracks
INSERT INTO admission_payment_schemes (tenant_id, track_id, name, code, amount, is_required, due_date_type, order_index, created_by)
SELECT
  tr.tenant_id,
  tr.id,
  s.name,
  s.code,
  s.amount,
  s.is_required,
  s.due_date_type,
  s.order_index,
  tr.created_by
FROM admission_tracks tr
CROSS JOIN (
  VALUES
    (1, 'Uang Pendaftaran', 'REGISTRATION_FEE', 200000, true, 'IMMEDIATE'),
    (2, 'Biaya Masuk', 'ENTRY_FEE', 10000000, true, 'ON_ACCEPTANCE'),
    (3, 'SPP Bulanan', 'MONTHLY_TUITION', 300000, true, 'MONTHLY_START')
) AS s(order_index, name, code, amount, is_required, due_date_type)
WHERE NOT EXISTS (
  SELECT 1 FROM admission_payment_schemes ps WHERE ps.tenant_id = tr.tenant_id AND ps.track_id = tr.id
);

-- Permissions
INSERT INTO permissions(id) VALUES
  ('admission.form.read'), ('admission.form.write'),
  ('admission.payment.read'), ('admission.payment.write'),
  ('admission.interview.read'), ('admission.interview.write'),
  ('admission.document_template.read'), ('admission.document_template.write')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.id IN ('PRINCIPAL', 'STAFF', 'FOUNDATION_STAFF', 'FOUNDATION_HEAD')
AND p.id IN (
  'admission.form.read', 'admission.form.write',
  'admission.payment.read', 'admission.payment.write',
  'admission.interview.read', 'admission.interview.write',
  'admission.document_template.read', 'admission.document_template.write'
)
ON CONFLICT DO NOTHING;

-- Parent role gets form read + payment read + interview read
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.id = 'PARENT'
AND p.id IN (
  'admission.form.read',
  'admission.payment.read',
  'admission.interview.read',
  'admission.document_template.read'
)
ON CONFLICT DO NOTHING;