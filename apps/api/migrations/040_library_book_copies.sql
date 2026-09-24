-- Create shelves table
CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  code text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  UNIQUE(tenant_id, code)
);

-- Phase 2: Extend book_copies with shelf, acquisition_date, condition, status enums
ALTER TABLE book_copies
  ADD COLUMN IF NOT EXISTS shelf_id uuid REFERENCES shelves(id),
  ADD COLUMN IF NOT EXISTS acquisition_date date;

-- Update condition enum
ALTER TABLE book_copies
  ALTER COLUMN condition TYPE text;

-- Update status enum with more values
ALTER TABLE book_copies
  ALTER COLUMN status TYPE text;

-- Drop old inline constraints before adding updated check constraints
ALTER TABLE book_copies DROP CONSTRAINT IF EXISTS book_copies_condition_check;
ALTER TABLE book_copies DROP CONSTRAINT IF EXISTS book_copies_status_check;

-- Add check constraints for updated enums
ALTER TABLE book_copies
  ADD CONSTRAINT book_copies_condition_check
  CHECK (condition IN ('GOOD', 'FAIR', 'DAMAGED', 'LOST'));

ALTER TABLE book_copies
  ADD CONSTRAINT book_copies_status_check
  CHECK (status IN ('AVAILABLE', 'BORROWED', 'RESERVED', 'LOST', 'DAMAGED', 'MAINTENANCE'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_book_copies_book_id ON book_copies(tenant_id, book_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_shelf_id ON book_copies(tenant_id, shelf_id);
CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_shelves_tenant ON shelves(tenant_id);

-- Permissions for shelves
INSERT INTO permissions(id) VALUES ('library.shelves.read'), ('library.shelves.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE (r.id IN ('PRINCIPAL', 'SCHOOL_ADMIN') AND p.id IN ('library.shelves.read', 'library.shelves.write'))
     OR (r.id = 'TEACHER' AND p.id = 'library.shelves.read') ON CONFLICT DO NOTHING;
