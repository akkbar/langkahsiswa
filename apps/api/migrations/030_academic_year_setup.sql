ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','PREPARATION','ACTIVE','CLOSED')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE academic_years SET status='ACTIVE' WHERE is_active;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS capacity integer CHECK(capacity IS NULL OR capacity > 0);

CREATE TABLE academic_year_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  source_academic_year_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PREPARATION','ACTIVE','CLOSED')),
  current_step integer NOT NULL DEFAULT 1 CHECK(current_step BETWEEN 1 AND 12),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,academic_year_id),
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,source_academic_year_id) REFERENCES academic_years(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE academic_year_setup_steps (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  setup_id uuid NOT NULL,
  step_key text NOT NULL CHECK(step_key IN (
    'identity','calendar','structure','promotion','subjects','teacher_assignments',
    'schedule','assessment_grading','attendance','student_fees','activities_operations','review'
  )),
  step_order integer NOT NULL CHECK(step_order BETWEEN 1 AND 12),
  setup_level text NOT NULL CHECK(setup_level IN ('FOUNDATION','SCHOOL','OPERATIONAL')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETE')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,setup_id,step_key),
  UNIQUE(tenant_id,setup_id,step_order),
  FOREIGN KEY(tenant_id,setup_id) REFERENCES academic_year_setups(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE academic_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  academic_year_id uuid NOT NULL, title text NOT NULL, event_type text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(start_date<=end_date),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  student_id uuid NOT NULL, academic_year_id uuid NOT NULL, school_id uuid NOT NULL,
  grade_level_id uuid NOT NULL, classroom_id uuid,
  enrollment_status text NOT NULL DEFAULT 'ACTIVE' CHECK(enrollment_status IN ('ACTIVE','RETAINED','TRANSFERRED','GRADUATED','WITHDRAWN','NEW')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,academic_year_id,student_id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
  FOREIGN KEY(tenant_id,grade_level_id) REFERENCES grade_levels(tenant_id,id),
  FOREIGN KEY(tenant_id,classroom_id) REFERENCES classes(tenant_id,id)
);

CREATE TABLE year_subject_curricula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  academic_year_id uuid NOT NULL, subject_id uuid NOT NULL, grade_level_id uuid,
  weekly_hours integer NOT NULL DEFAULT 1 CHECK(weekly_hours > 0),
  period_minutes integer NOT NULL DEFAULT 40 CHECK(period_minutes > 0),
  subject_type text NOT NULL DEFAULT 'REQUIRED' CHECK(subject_type IN ('REQUIRED','ELECTIVE')),
  category text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,academic_year_id,subject_id,grade_level_id),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id),
  FOREIGN KEY(tenant_id,grade_level_id) REFERENCES grade_levels(tenant_id,id)
);

CREATE TABLE teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  academic_year_id uuid NOT NULL, teacher_id uuid NOT NULL, subject_id uuid NOT NULL,
  classroom_id uuid NOT NULL, weekly_hours integer NOT NULL DEFAULT 1 CHECK(weekly_hours > 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,academic_year_id,teacher_id,subject_id,classroom_id),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id),
  FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id),
  FOREIGN KEY(tenant_id,classroom_id) REFERENCES classes(tenant_id,id)
);

CREATE INDEX academic_year_setups_school_idx ON academic_year_setups(tenant_id,school_id,created_at DESC);
CREATE INDEX academic_calendar_year_idx ON academic_calendar_events(tenant_id,academic_year_id,start_date);
CREATE INDEX student_enrollments_year_idx ON student_enrollments(tenant_id,academic_year_id);
CREATE INDEX year_subject_curricula_year_idx ON year_subject_curricula(tenant_id,academic_year_id);
CREATE INDEX teacher_assignments_year_idx ON teacher_assignments(tenant_id,academic_year_id);

INSERT INTO permissions(id) VALUES
 ('academic_setup.create'),('academic_setup.read'),('academic_setup.update'),
 ('academic_setup.delete')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT grants.role_id, grants.permission_id
FROM (VALUES
 ('PRINCIPAL','academic_setup.create'),('PRINCIPAL','academic_setup.read'),
 ('PRINCIPAL','academic_setup.update'),('PRINCIPAL','academic_setup.delete'),
 ('FOUNDATION_HEAD','academic_setup.create'),('FOUNDATION_HEAD','academic_setup.read'),
 ('FOUNDATION_HEAD','academic_setup.update'),('FOUNDATION_HEAD','academic_setup.delete'),
 ('FOUNDATION_STAFF','academic_setup.read')
) AS grants(role_id,permission_id)
JOIN roles ON roles.id=grants.role_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE academic_year_setups IS 'Versioned 12-step setup workflow required before academic-year activation.';
COMMENT ON TABLE student_enrollments IS 'Yearly student placement history; student master records never store the current classroom.';
