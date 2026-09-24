-- Migration 049: Teacher Teaching Logs (Phase 2)

CREATE TABLE IF NOT EXISTS teaching_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_item_id UUID REFERENCES teaching_plan_items(id) ON DELETE SET NULL,
  timetable_id UUID,
  teacher_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  semester_id UUID NOT NULL,
  date DATE NOT NULL,
  planned_topic VARCHAR(255),
  actually_taught VARCHAR(255) NOT NULL,
  completion_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  teacher_notes TEXT,
  next_meeting_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_logs_tenant_teacher ON teaching_logs(tenant_id, teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_teaching_logs_class_subject ON teaching_logs(tenant_id, class_id, subject_id);
