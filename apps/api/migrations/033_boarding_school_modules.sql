CREATE TABLE school_modules (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  school_id uuid NOT NULL,
  module_key text NOT NULL CHECK(module_key IN (
    'ACADEMIC','ATTENDANCE','FINANCE','TAHFIDZ','TAHSIN','MUTABAAH','DINIYAH',
    'DORMITORY','SANTRI_PERMISSION','SANTRI_WALLET','CANTEEN','LAUNDRY',
    'HEALTH','DISCIPLINE','PONDOK_ACTIVITIES'
  )),
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,school_id,module_key),
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION seed_school_modules() RETURNS trigger AS $$
BEGIN
  INSERT INTO school_modules(tenant_id,school_id,module_key,enabled)
  SELECT NEW.tenant_id,NEW.id,module_key,
    CASE
      WHEN module_key IN ('ACADEMIC','ATTENDANCE','FINANCE') THEN true
      WHEN NEW.education_authority='KEMENAG' AND module_key IN ('TAHFIDZ','TAHSIN','MUTABAAH','DINIYAH','DISCIPLINE','PONDOK_ACTIVITIES') THEN true
      ELSE false
    END
  FROM unnest(ARRAY[
    'ACADEMIC','ATTENDANCE','FINANCE','TAHFIDZ','TAHSIN','MUTABAAH','DINIYAH',
    'DORMITORY','SANTRI_PERMISSION','SANTRI_WALLET','CANTEEN','LAUNDRY',
    'HEALTH','DISCIPLINE','PONDOK_ACTIVITIES'
  ]) AS module_key
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schools_seed_modules
AFTER INSERT ON schools FOR EACH ROW EXECUTE FUNCTION seed_school_modules();

INSERT INTO school_modules(tenant_id,school_id,module_key,enabled)
SELECT s.tenant_id,s.id,module_key,
  CASE
    WHEN module_key IN ('ACADEMIC','ATTENDANCE','FINANCE') THEN true
    WHEN s.education_authority='KEMENAG' AND module_key IN ('TAHFIDZ','TAHSIN','MUTABAAH','DINIYAH','DISCIPLINE','PONDOK_ACTIVITIES') THEN true
    WHEN module_key IN ('DORMITORY','SANTRI_PERMISSION','SANTRI_WALLET','CANTEEN','LAUNDRY') AND
      (EXISTS(SELECT 1 FROM dormitories d WHERE d.tenant_id=s.tenant_id)
       OR EXISTS(SELECT 1 FROM tahfidz_records t WHERE t.tenant_id=s.tenant_id)) THEN true
    ELSE false
  END
FROM schools s
CROSS JOIN unnest(ARRAY[
  'ACADEMIC','ATTENDANCE','FINANCE','TAHFIDZ','TAHSIN','MUTABAAH','DINIYAH',
  'DORMITORY','SANTRI_PERMISSION','SANTRI_WALLET','CANTEEN','LAUNDRY',
  'HEALTH','DISCIPLINE','PONDOK_ACTIVITIES'
]) AS module_key
ON CONFLICT DO NOTHING;

ALTER TABLE tahfidz_records
  ADD COLUMN record_type text NOT NULL DEFAULT 'TAHFIDZ' CHECK(record_type IN ('TAHFIDZ','TAHSIN','MURAJAAH')),
  ADD COLUMN fluency_score numeric(5,2) CHECK(fluency_score BETWEEN 0 AND 100),
  ADD COLUMN tajwid_score numeric(5,2) CHECK(tajwid_score BETWEEN 0 AND 100),
  ADD COLUMN makhraj_score numeric(5,2) CHECK(makhraj_score BETWEEN 0 AND 100),
  ADD COLUMN adab_score numeric(5,2) CHECK(adab_score BETWEEN 0 AND 100),
  ADD COLUMN memorization_status text NOT NULL DEFAULT 'PROGRESS' CHECK(memorization_status IN ('FLUENT','PROGRESS','REPEAT')),
  ADD COLUMN needs_repeat boolean NOT NULL DEFAULT false;

CREATE TABLE tahfidz_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  student_id uuid NOT NULL, academic_year_id uuid NOT NULL, target_type text NOT NULL CHECK(target_type IN ('TAHFIDZ','TAHSIN')),
  target_name text NOT NULL, target_juz numeric(5,2) CHECK(target_juz IS NULL OR target_juz>=0),
  start_date date NOT NULL, end_date date NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ACHIEVED','CANCELLED')),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(start_date<=end_date),
  UNIQUE(tenant_id,student_id,academic_year_id,target_type,target_name),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE worship_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), school_id uuid NOT NULL,
  name text NOT NULL, category text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,name),
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id)
);

CREATE TABLE worship_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
  habit_id uuid NOT NULL, record_date date NOT NULL, status text NOT NULL CHECK(status IN ('DONE','MISSED','EXCUSED')),
  notes text NOT NULL DEFAULT '', recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_id,habit_id,record_date),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,habit_id) REFERENCES worship_habits(tenant_id,id),
  FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE character_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
  record_date date NOT NULL, dimension text NOT NULL, record_type text NOT NULL CHECK(record_type IN ('POSITIVE','DEVELOPMENT','VIOLATION')),
  severity text CHECK(severity IS NULL OR severity IN ('LIGHT','MEDIUM','HEAVY')),
  points integer NOT NULL DEFAULT 0 CHECK(points BETWEEN -1000 AND 1000), notes text NOT NULL,
  follow_up text NOT NULL DEFAULT '', approval_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE student_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
  visited_at timestamptz NOT NULL, complaint text NOT NULL, diagnosis text, treatment text, medicine text,
  referral text, allergy_notes text, activity_excuse_until date, guardian_notified boolean NOT NULL DEFAULT false,
  recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE diniyah_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), school_id uuid NOT NULL,
  name text NOT NULL, book_name text, teacher_id uuid, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,name),
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
  FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id)
);

CREATE TABLE diniyah_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
  diniyah_subject_id uuid NOT NULL, chapter text NOT NULL, status text NOT NULL CHECK(status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','REPEAT')),
  score numeric(5,2) CHECK(score BETWEEN 0 AND 100), notes text NOT NULL DEFAULT '', recorded_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_id,diniyah_subject_id,chapter),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,diniyah_subject_id) REFERENCES diniyah_subjects(tenant_id,id),
  FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);

ALTER TABLE dormitory_rooms
  ADD COLUMN supervisor_user_id uuid,
  ADD COLUMN facilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cleaning_schedule text,
  ADD CONSTRAINT dormitory_rooms_supervisor_fk FOREIGN KEY(tenant_id,supervisor_user_id) REFERENCES users(tenant_id,id);

CREATE TABLE dormitory_room_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), room_id uuid NOT NULL,
  inspected_at timestamptz NOT NULL, cleanliness_score integer NOT NULL CHECK(cleanliness_score BETWEEN 0 AND 100),
  facility_condition text NOT NULL, notes text NOT NULL DEFAULT '', inspected_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,room_id) REFERENCES dormitory_rooms(tenant_id,id),
  FOREIGN KEY(tenant_id,inspected_by) REFERENCES users(tenant_id,id)
);

ALTER TABLE leave_permissions
  ADD COLUMN leave_type text NOT NULL DEFAULT 'OUTING' CHECK(leave_type IN ('OUTING','HOME','SICK')),
  ADD COLUMN pickup_name text,
  ADD COLUMN actual_out_at timestamptz,
  ADD COLUMN gate_token text UNIQUE;

CREATE INDEX worship_records_student_date_idx ON worship_records(tenant_id,student_id,record_date DESC);
CREATE INDEX character_records_student_date_idx ON character_records(tenant_id,student_id,record_date DESC);
CREATE INDEX health_records_student_date_idx ON student_health_records(tenant_id,student_id,visited_at DESC);
CREATE INDEX diniyah_progress_student_idx ON diniyah_progress(tenant_id,student_id,updated_at DESC);
