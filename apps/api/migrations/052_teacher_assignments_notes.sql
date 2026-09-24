-- Phase 25I–25J: tenant-safe teacher assignments and student academic notes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_teaching_logs_tenant_id ON teaching_logs(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teaching_plan_items_tenant_id ON teaching_plan_items(tenant_id,id);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_subject_id UUID NOT NULL,
  teaching_log_id UUID,
  plan_item_id UUID,
  teacher_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL CHECK (btrim(title) <> ''),
  instructions TEXT NOT NULL CHECK (btrim(instructions) <> ''),
  assigned_date DATE NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  CHECK (due_date IS NULL OR due_date >= assigned_date),
  FOREIGN KEY(tenant_id,class_subject_id) REFERENCES class_subjects(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,teaching_log_id) REFERENCES teaching_logs(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id,plan_item_id) REFERENCES teaching_plan_items(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_scope ON assignments(tenant_id,class_subject_id,assigned_date DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(tenant_id,teacher_id,assigned_date DESC);

CREATE TABLE IF NOT EXISTS student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ,
  submission_text TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  review_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','SUBMITTED','REVIEWED','RETURNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,assignment_id,student_id),
  CHECK ((status = 'ASSIGNED' AND submitted_at IS NULL AND reviewed_at IS NULL) OR status <> 'ASSIGNED'),
  CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL),
  FOREIGN KEY(tenant_id,assignment_id) REFERENCES assignments(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,reviewed_by) REFERENCES teachers(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_student_assignments_student ON student_assignments(tenant_id,student_id,status);

CREATE TABLE IF NOT EXISTS student_academic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  author_teacher_id UUID NOT NULL,
  class_subject_id UUID,
  teaching_log_id UUID,
  note TEXT NOT NULL CHECK(btrim(note) <> ''),
  visibility VARCHAR(30) NOT NULL CHECK(visibility IN ('TEACHERS_ONLY','SCHOOL_STAFF','PARENT_VISIBLE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,author_teacher_id) REFERENCES teachers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,class_subject_id) REFERENCES class_subjects(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id,teaching_log_id) REFERENCES teaching_logs(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_student_academic_notes_student ON student_academic_notes(tenant_id,student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_academic_notes_author ON student_academic_notes(tenant_id,author_teacher_id,created_at DESC);

INSERT INTO permissions(id) VALUES
 ('assignment.create'),('assignment.read'),('assignment.update'),('assignment.delete'),
 ('student_note.create'),('student_note.read'),('student_note.update'),('student_note.delete')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT rp.role_id, p.id FROM role_permissions rp
JOIN permissions p ON p.id IN ('assignment.create','assignment.read','assignment.update','assignment.delete','student_note.create','student_note.read','student_note.update','student_note.delete')
WHERE rp.permission_id IN ('grade.create','grade.read','grade.update','grade.delete')
ON CONFLICT DO NOTHING;
