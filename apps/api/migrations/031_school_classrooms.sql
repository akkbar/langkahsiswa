CREATE TABLE classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  school_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  building text,
  floor text,
  location text,
  capacity integer NOT NULL CHECK(capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,school_id,code),
  FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id)
);

ALTER TABLE classes
  ADD COLUMN classroom_id uuid,
  ADD CONSTRAINT classes_classroom_fk
    FOREIGN KEY(tenant_id,classroom_id) REFERENCES classrooms(tenant_id,id);

CREATE INDEX classrooms_school_idx ON classrooms(tenant_id,school_id,is_active);
CREATE INDEX classes_classroom_idx ON classes(tenant_id,classroom_id,academic_year_id);
CREATE UNIQUE INDEX one_class_per_room_year
  ON classes(tenant_id,academic_year_id,classroom_id) WHERE classroom_id IS NOT NULL;

COMMENT ON TABLE classrooms IS
  'Master ruang fisik milik sekolah, mencakup ketersediaan, kapasitas, gedung, lantai, dan posisi.';
COMMENT ON COLUMN classes.classroom_id IS
  'Ruang fisik yang dipakai rombongan belajar pada tahun ajaran tertentu.';
