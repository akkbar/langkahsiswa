CREATE TABLE admission_selection_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  period_id uuid NOT NULL,
  track_id uuid,
  name text NOT NULL,
  source_stage text NOT NULL CHECK(source_stage IN ('DOCUMENT','TEST','INTERVIEW')),
  weight numeric(5,2) NOT NULL DEFAULT 100 CHECK(weight > 0 AND weight <= 100),
  minimum_score numeric(5,2) CHECK(minimum_score IS NULL OR (minimum_score >= 0 AND minimum_score <= 100)),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,period_id) REFERENCES admission_periods(tenant_id,id),
  FOREIGN KEY(tenant_id,track_id) REFERENCES admission_tracks(tenant_id,id)
);

CREATE UNIQUE INDEX admission_selection_criteria_scope
  ON admission_selection_criteria(tenant_id,period_id,COALESCE(track_id,'00000000-0000-0000-0000-000000000000'::uuid),source_stage);

ALTER TABLE applications
  ADD COLUMN selection_score numeric(5,2),
  ADD COLUMN selection_rank integer,
  ADD COLUMN selection_status text CHECK(selection_status IN ('SELECTED','NOT_SELECTED','WAITING_LIST')),
  ADD COLUMN selection_notes text NOT NULL DEFAULT '',
  ADD COLUMN selected_by uuid,
  ADD COLUMN selected_at timestamptz,
  ADD CONSTRAINT applications_selected_by_fk
    FOREIGN KEY(tenant_id,selected_by) REFERENCES users(tenant_id,id);

CREATE INDEX application_selection_queue
  ON applications(tenant_id,period_id,track_id,selection_status,selection_rank);

INSERT INTO permissions(id) VALUES
  ('admission.verify'),
  ('admission.reject'),
  ('admission.selection.run'),
  ('admission.selection.publish')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
  WHERE (r.id='STAFF' AND p.id IN ('admission.verify','admission.reject'))
     OR (r.id='PRINCIPAL' AND p.id IN ('admission.verify','admission.reject','admission.selection.run','admission.selection.publish'))
ON CONFLICT DO NOTHING;
