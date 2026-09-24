-- PPDB Phase 4: payment tracking hardening and idempotent re-registration
ALTER TABLE admission_payments
  ADD COLUMN payment_number text,
  ADD COLUMN payment_reference text,
  ADD COLUMN payment_method text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE admission_payments
  DROP CONSTRAINT IF EXISTS admission_payments_status_check,
  ADD CONSTRAINT admission_payments_status_check
    CHECK(status IN ('PENDING','PAID','PARTIAL','WAIVED','REFUNDED','CANCELLED','EXPIRED'));

CREATE UNIQUE INDEX admission_payments_number_unique
  ON admission_payments(tenant_id,payment_number)
  WHERE payment_number IS NOT NULL;
CREATE UNIQUE INDEX admission_payments_application_scheme_installment_unique
  ON admission_payments(tenant_id,application_id,payment_scheme_id,installment_number);
CREATE UNIQUE INDEX admission_payments_payment_proof_unique
  ON admission_payments(tenant_id,payment_proof_file_id)
  WHERE payment_proof_file_id IS NOT NULL;

CREATE TABLE admission_re_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL,
  student_id uuid NOT NULL,
  registration_date timestamptz NOT NULL DEFAULT now(),
  final_program text NOT NULL DEFAULT '',
  final_class_id uuid,
  parent_confirmed boolean NOT NULL DEFAULT false,
  documents jsonb NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),
  completed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,application_id),
  FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
  FOREIGN KEY(tenant_id,final_class_id) REFERENCES classes(tenant_id,id),
  FOREIGN KEY(tenant_id,completed_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX admission_re_registrations_student ON admission_re_registrations(tenant_id,student_id);

INSERT INTO permissions(id) VALUES ('admission.reregistration') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.id IN ('PRINCIPAL','STAFF') AND p.id='admission.reregistration'
ON CONFLICT DO NOTHING;
