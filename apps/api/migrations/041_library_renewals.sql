CREATE TABLE IF NOT EXISTS library_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  borrowing_id uuid NOT NULL,
  renewal_count integer NOT NULL DEFAULT 1,
  previous_due_date date NOT NULL,
  new_due_date date NOT NULL,
  renewed_by uuid NOT NULL,
  renewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, borrowing_id) REFERENCES borrowings(tenant_id, id),
  FOREIGN KEY(tenant_id, renewed_by) REFERENCES users(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS library_renewal_borrowing ON library_renewals(tenant_id, borrowing_id, renewed_at DESC);
