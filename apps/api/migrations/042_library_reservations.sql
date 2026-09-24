CREATE TABLE IF NOT EXISTS library_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  book_id uuid NOT NULL,
  student_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  queue_position integer NOT NULL DEFAULT 1,
  assigned_copy_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, id),
  FOREIGN KEY(tenant_id, book_id) REFERENCES books(tenant_id, id),
  FOREIGN KEY(tenant_id, student_id) REFERENCES students(tenant_id, id),
  FOREIGN KEY(tenant_id, assigned_copy_id) REFERENCES book_copies(tenant_id, id),
  FOREIGN KEY(tenant_id, created_by) REFERENCES users(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS library_reservation_queue ON library_reservations(tenant_id, book_id, status, queue_position);
CREATE INDEX IF NOT EXISTS library_reservation_student ON library_reservations(tenant_id, student_id, status);
