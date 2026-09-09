CREATE TABLE books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), isbn text,
 title text NOT NULL, author text NOT NULL, publisher text NOT NULL DEFAULT '', publication_year integer CHECK(publication_year BETWEEN 1000 AND 3000),
 category text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,isbn)
);
CREATE TABLE book_copies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), book_id uuid NOT NULL,
 barcode text NOT NULL, condition text NOT NULL DEFAULT 'GOOD' CHECK(condition IN ('GOOD','DAMAGED','LOST')),
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','BORROWED','MAINTENANCE','LOST')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,barcode),
 FOREIGN KEY(tenant_id,book_id) REFERENCES books(tenant_id,id)
);
CREATE TABLE borrowings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), copy_id uuid NOT NULL,
 student_id uuid NOT NULL, borrowed_at timestamptz NOT NULL DEFAULT now(), due_date date NOT NULL, returned_at timestamptz,
 status text NOT NULL DEFAULT 'BORROWED' CHECK(status IN ('BORROWED','RETURNED','LOST')),
 borrowed_by uuid NOT NULL, returned_by uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,copy_id) REFERENCES book_copies(tenant_id,id), FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,borrowed_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,returned_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX one_active_borrowing_copy ON borrowings(tenant_id,copy_id) WHERE returned_at IS NULL;
CREATE TABLE library_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), borrowing_id uuid NOT NULL,
 condition text NOT NULL CHECK(condition IN ('GOOD','DAMAGED','LOST')), returned_by uuid NOT NULL,
 returned_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,borrowing_id),
 FOREIGN KEY(tenant_id,borrowing_id) REFERENCES borrowings(tenant_id,id),
 FOREIGN KEY(tenant_id,returned_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE library_penalties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), borrowing_id uuid NOT NULL,
 student_id uuid NOT NULL, type text NOT NULL CHECK(type IN ('OVERDUE','DAMAGE','LOST')),
 amount numeric(12,0) NOT NULL CHECK(amount>0), status text NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID','PAID','WAIVED')),
 notes text NOT NULL DEFAULT '', wallet_transaction_id uuid, resolved_by uuid, resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,borrowing_id,type), UNIQUE(tenant_id,wallet_transaction_id),
 FOREIGN KEY(tenant_id,borrowing_id) REFERENCES borrowings(tenant_id,id), FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,wallet_transaction_id) REFERENCES wallet_transactions(tenant_id,id), FOREIGN KEY(tenant_id,resolved_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX library_catalog ON books(tenant_id,title,author);
CREATE INDEX library_borrower ON borrowings(tenant_id,student_id,status,due_date);
CREATE INDEX library_penalty_status ON library_penalties(tenant_id,status,created_at);

INSERT INTO permissions(id) VALUES ('library.read'),('library.write'),('library.own') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.id='PRINCIPAL' AND p.id IN ('library.read','library.write'))
 OR (r.id='TEACHER' AND p.id='library.read')
 OR (r.id IN ('PARENT','STUDENT') AND p.id='library.own') ON CONFLICT DO NOTHING;
