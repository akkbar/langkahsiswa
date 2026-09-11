CREATE TABLE teacher_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  teacher_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,teacher_id,subject_id,grade_level_id),
  FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,grade_level_id) REFERENCES grade_levels(tenant_id,id) ON DELETE CASCADE
);

CREATE INDEX teacher_competencies_teacher_idx
  ON teacher_competencies(tenant_id,teacher_id);

INSERT INTO teacher_competencies(tenant_id,teacher_id,subject_id,grade_level_id)
SELECT ts.tenant_id,ts.teacher_id,ts.subject_id,gl.id
FROM teacher_subjects ts
JOIN subjects s ON s.tenant_id=ts.tenant_id AND s.id=ts.subject_id
JOIN grade_levels gl ON gl.tenant_id=s.tenant_id AND gl.school_id=s.school_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE teacher_competencies IS
  'Binding kompetensi guru ke mata pelajaran dan tingkat kelas; dikelola dari Yayasan > Semua Akun > Guru.';
