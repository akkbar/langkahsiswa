-- Migration 048: Teacher Teaching Plans (Phase 1)

CREATE TABLE IF NOT EXISTS teaching_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL,
  semester_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_plans_tenant_teacher ON teaching_plans(tenant_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_teaching_plans_class_subject ON teaching_plans(tenant_id, class_id, subject_id, semester_id);

CREATE TABLE IF NOT EXISTS teaching_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES teaching_plans(id) ON DELETE CASCADE,
  meeting_number INT NOT NULL,
  topic VARCHAR(255) NOT NULL,
  learning_objective TEXT,
  teacher_notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PLANNED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_plan_items_plan ON teaching_plan_items(tenant_id, plan_id);
