CREATE TABLE IF NOT EXISTS library_stock_opnames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL,
  shelf_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  notes text,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, shelf_id) REFERENCES shelves(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS library_stock_opname_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  opname_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  expected_status text NOT NULL,
  actual_status text NOT NULL,
  is_match boolean NOT NULL DEFAULT true,
  notes text,
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, opname_id) REFERENCES library_stock_opnames(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id, copy_id) REFERENCES book_copies(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS library_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  copy_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('LOST', 'DAMAGED')),
  description text NOT NULL,
  resolution text,
  reported_by uuid,
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, copy_id) REFERENCES book_copies(tenant_id, id),
  FOREIGN KEY(tenant_id, reported_by) REFERENCES users(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS library_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  copy_id uuid NOT NULL,
  from_shelf_id uuid,
  to_shelf_id uuid,
  reason text NOT NULL,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, copy_id) REFERENCES book_copies(tenant_id, id),
  FOREIGN KEY(tenant_id, from_shelf_id) REFERENCES shelves(tenant_id, id),
  FOREIGN KEY(tenant_id, to_shelf_id) REFERENCES shelves(tenant_id, id),
  FOREIGN KEY(tenant_id, performed_by) REFERENCES users(tenant_id, id)
);
