ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_level_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_level_check
 CHECK(account_level IN ('OPERATIONAL','FAMILY','TENANT'));

CREATE TABLE tenant_accounts (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 tenant_kind text NOT NULL DEFAULT 'CANTEEN'
  CHECK(tenant_kind IN ('CANTEEN')),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roles ADD COLUMN IF NOT EXISTS account_level text;
UPDATE roles SET account_level=CASE
 WHEN id IN ('PARENT','STUDENT') THEN 'FAMILY'
 ELSE 'OPERATIONAL'
END WHERE account_level IS NULL;
ALTER TABLE roles ALTER COLUMN account_level SET NOT NULL;
ALTER TABLE roles ALTER COLUMN account_level SET DEFAULT 'OPERATIONAL';
ALTER TABLE roles ADD CONSTRAINT roles_account_level_check
 CHECK(account_level IN ('OPERATIONAL','FAMILY','TENANT'));

INSERT INTO roles(id,account_level) VALUES('CANTEEN_ADMIN','TENANT')
ON CONFLICT(id) DO UPDATE SET account_level='TENANT';
INSERT INTO permissions(id) VALUES
 ('student.read'),('finance.read'),('wallet.read'),('pos.write'),
 ('event.read'),('notification.read'),('site.read')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT 'CANTEEN_ADMIN',id FROM permissions
WHERE id IN (
 'student.read','finance.read','wallet.read','pos.write',
 'event.read','notification.read','site.read'
) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_account_role_level() RETURNS trigger AS $$
DECLARE account_kind text;
DECLARE role_kind text;
BEGIN
 SELECT a.account_level INTO account_kind
 FROM users u JOIN accounts a ON a.id=u.account_id
 WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.user_id;
 SELECT account_level INTO role_kind FROM roles WHERE id=NEW.role_id;
 IF account_kind IS NULL OR role_kind IS NULL OR account_kind <> role_kind THEN
  RAISE EXCEPTION 'role realm must match account realm' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;

COMMENT ON COLUMN organizations.slug IS
 'Kode yayasan yang digunakan sebagai konteks awal login semua account realm';
COMMENT ON COLUMN accounts.account_level IS
 'Isolated login realm: OPERATIONAL, FAMILY, or TENANT';
