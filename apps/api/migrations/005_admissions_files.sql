CREATE TABLE admission_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 school_id uuid NOT NULL, academic_year_id uuid NOT NULL, name text NOT NULL,
 starts_on date NOT NULL, ends_on date NOT NULL, capacity integer CHECK(capacity IS NULL OR capacity>0),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,name), CHECK(starts_on<=ends_on),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
 FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE applicants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL, email text, phone text, address text, birth_date date,
 gender text CHECK(gender IN ('MALE','FEMALE')), guardian_name text NOT NULL,
 guardian_phone text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 period_id uuid NOT NULL, applicant_id uuid NOT NULL, target_grade_level_id uuid NOT NULL,
 registration_number text NOT NULL, status text NOT NULL DEFAULT 'SUBMITTED'
 CHECK(status IN ('SUBMITTED','DOCUMENT_REVIEW','TEST','INTERVIEW','ACCEPTED','REJECTED','ENROLLED','WITHDRAWN')),
 access_token_hash text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 student_id uuid, enrolled_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,registration_number),
 UNIQUE(tenant_id,period_id,applicant_id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES admission_periods(tenant_id,id),
 FOREIGN KEY(tenant_id,applicant_id) REFERENCES applicants(tenant_id,id),
 FOREIGN KEY(tenant_id,target_grade_level_id) REFERENCES grade_levels(tenant_id,id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id)
);
CREATE TABLE managed_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 category text NOT NULL CHECK(category IN ('STUDENT_PHOTO','FAMILY_CARD','BIRTH_CERTIFICATE','PPDB_DOCUMENT','PAYMENT_PROOF','WEBSITE_IMAGE','REPORT_CARD','OTHER')),
 file_name text NOT NULL, mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','application/pdf')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880), storage_key text NOT NULL UNIQUE,
 sha256 text NOT NULL, description text NOT NULL DEFAULT '', uploaded_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,uploaded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE file_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 file_id uuid NOT NULL, entity_type text NOT NULL CHECK(entity_type IN ('STUDENT','APPLICANT','APPLICATION','SCHOOL','WEBSITE','REPORT_CARD')),
 entity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,file_id,entity_type,entity_id),
 FOREIGN KEY(tenant_id,file_id) REFERENCES managed_files(tenant_id,id)
);
CREATE TABLE application_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 application_id uuid NOT NULL, file_id uuid NOT NULL, document_type text NOT NULL,
 verification_status text NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED')),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,application_id,document_type), UNIQUE(tenant_id,file_id),
 FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
 FOREIGN KEY(tenant_id,file_id) REFERENCES managed_files(tenant_id,id)
);
CREATE TABLE application_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 application_id uuid NOT NULL, stage text NOT NULL CHECK(stage IN ('DOCUMENT','TEST','INTERVIEW','FINAL')),
 decision text NOT NULL CHECK(decision IN ('PASSED','FAILED','NEEDS_REVISION')),
 score numeric(5,2) CHECK(score IS NULL OR (score>=0 AND score<=100)), notes text NOT NULL DEFAULT '',
 reviewed_by uuid NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX admission_period_status ON admission_periods(tenant_id,status,starts_on,ends_on);
CREATE INDEX application_queue ON applications(tenant_id,period_id,status,submitted_at);
CREATE INDEX managed_file_search ON managed_files(tenant_id,category,created_at DESC);
CREATE INDEX file_link_entity ON file_links(tenant_id,entity_type,entity_id);

INSERT INTO managed_files(id,tenant_id,category,file_name,mime_type,size_bytes,storage_key,sha256,uploaded_by,created_at)
 SELECT id,tenant_id,'PAYMENT_PROOF',file_name,mime_type,size_bytes,storage_key,sha256,uploaded_by,created_at FROM payment_proofs
 ON CONFLICT(storage_key) DO NOTHING;
INSERT INTO file_links(tenant_id,file_id,entity_type,entity_id)
 SELECT tenant_id,id,'STUDENT',student_id FROM payment_proofs ON CONFLICT DO NOTHING;

INSERT INTO permissions(id) VALUES ('admission.read'),('admission.write'),('file.read'),('file.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.id='PRINCIPAL' AND p.id IN ('admission.read','admission.write','file.read'))
 OR (r.id='FINANCE' AND p.id='file.read')
 ON CONFLICT DO NOTHING;
