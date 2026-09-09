CREATE TABLE fee_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', amount numeric(12,0) NOT NULL CHECK(amount>0),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE TABLE invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 title text NOT NULL, due_date date NOT NULL, total_amount numeric(12,0) NOT NULL CHECK(total_amount>0),
 paid_amount numeric(12,0) NOT NULL DEFAULT 0 CHECK(paid_amount>=0 AND paid_amount<=total_amount),
 status text NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID','PARTIAL','PAID')), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE invoice_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), invoice_id uuid NOT NULL, fee_type_id uuid,
 description text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
 unit_amount numeric(12,0) NOT NULL CHECK(unit_amount>0), amount numeric(12,0) NOT NULL CHECK(amount=quantity*unit_amount),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoices(tenant_id,id),
 FOREIGN KEY(tenant_id,fee_type_id) REFERENCES fee_types(tenant_id,id)
);
CREATE TABLE payment_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 uploaded_by uuid NOT NULL, file_name text NOT NULL, mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','application/pdf')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152), storage_key text NOT NULL UNIQUE, sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,uploaded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), invoice_id uuid NOT NULL, student_id uuid NOT NULL,
 amount numeric(12,0) NOT NULL CHECK(amount>0), proof_id uuid NOT NULL, reference text NOT NULL DEFAULT '', submitted_by uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,proof_id),
 FOREIGN KEY(tenant_id,invoice_id,student_id) REFERENCES invoices(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,proof_id,student_id) REFERENCES payment_proofs(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE payment_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), payment_id uuid NOT NULL, verified_by uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')), notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,payment_id), FOREIGN KEY(tenant_id,payment_id) REFERENCES payments(tenant_id,id),
 FOREIGN KEY(tenant_id,verified_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE wallet_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 balance numeric(12,0) NOT NULL DEFAULT 0 CHECK(balance>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_id), UNIQUE(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id)
);
CREATE TABLE wallet_merchants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, category text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), merchant_id uuid NOT NULL,
 name text NOT NULL, price numeric(12,0) NOT NULL CHECK(price>0), stock integer CHECK(stock>=0), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,merchant_id), UNIQUE(tenant_id,merchant_id,name),
 FOREIGN KEY(tenant_id,merchant_id) REFERENCES wallet_merchants(tenant_id,id)
);
CREATE TABLE wallet_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), account_id uuid NOT NULL, student_id uuid NOT NULL,
 type text NOT NULL CHECK(type IN ('TOPUP','PURCHASE','REFUND','ADJUSTMENT')), amount numeric(12,0) NOT NULL CHECK(amount<>0),
 balance_after numeric(12,0) NOT NULL CHECK(balance_after>=0), merchant_id uuid, merchant_name text, category text,
 description text NOT NULL, created_by uuid NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, original_transaction_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,merchant_id), UNIQUE(tenant_id,idempotency_key),
 UNIQUE(tenant_id,original_transaction_id), CHECK((type='PURCHASE' AND amount<0 AND merchant_id IS NOT NULL) OR (type IN ('TOPUP','REFUND') AND amount>0) OR type='ADJUSTMENT'),
 CHECK((type='REFUND')=(original_transaction_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,account_id,student_id) REFERENCES wallet_accounts(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,merchant_id) REFERENCES wallet_merchants(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,original_transaction_id) REFERENCES wallet_transactions(tenant_id,id)
);
CREATE TABLE wallet_purchase_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), transaction_id uuid NOT NULL, merchant_id uuid NOT NULL,
 product_id uuid NOT NULL, product_name text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), unit_amount numeric(12,0) NOT NULL CHECK(unit_amount>0),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,transaction_id,product_id),
 FOREIGN KEY(tenant_id,transaction_id,merchant_id) REFERENCES wallet_transactions(tenant_id,id,merchant_id),
 FOREIGN KEY(tenant_id,product_id,merchant_id) REFERENCES products(tenant_id,id,merchant_id)
);
CREATE TABLE wallet_topups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 amount numeric(12,0) NOT NULL CHECK(amount>0), proof_id uuid NOT NULL, reference text NOT NULL DEFAULT '', submitted_by uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')), verified_by uuid, verified_at timestamptz, notes text NOT NULL DEFAULT '',
 transaction_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,proof_id), UNIQUE(tenant_id,transaction_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,proof_id,student_id) REFERENCES payment_proofs(tenant_id,id,student_id),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,verified_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,transaction_id) REFERENCES wallet_transactions(tenant_id,id)
);
CREATE TABLE wallet_limits (
 tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL, daily_limit numeric(12,0) CHECK(daily_limit>=0),
 monthly_limit numeric(12,0) CHECK(monthly_limit>=0), category_limits jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(category_limits)='object'),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,student_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE wallet_merchant_restrictions (
 tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL, merchant_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,student_id,merchant_id), FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,merchant_id) REFERENCES wallet_merchants(tenant_id,id)
);
CREATE INDEX invoices_student ON invoices(tenant_id,student_id,due_date);
CREATE INDEX payments_status ON payments(tenant_id,status,created_at);
CREATE INDEX wallet_history ON wallet_transactions(tenant_id,student_id,created_at);
CREATE INDEX wallet_topups_status ON wallet_topups(tenant_id,status,created_at);
CREATE FUNCTION reject_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Wallet ledger is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_wallet_ledger BEFORE UPDATE OR DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER immutable_wallet_items BEFORE UPDATE OR DELETE ON wallet_purchase_items FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER immutable_payment_verifications BEFORE UPDATE OR DELETE ON payment_verifications FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
