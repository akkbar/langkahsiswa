CREATE TABLE IF NOT EXISTS library_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), borrowing_id uuid NOT NULL,
 condition text NOT NULL CHECK(condition IN ('GOOD','DAMAGED','LOST')), returned_by uuid NOT NULL,
 returned_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,borrowing_id),
 FOREIGN KEY(tenant_id,borrowing_id) REFERENCES borrowings(tenant_id,id),
 FOREIGN KEY(tenant_id,returned_by) REFERENCES users(tenant_id,id)
);
