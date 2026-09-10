-- Authentication is unified. Account realm tables remain as compatibility
-- metadata for existing installations, but no longer restrict roles or login.
DROP TRIGGER IF EXISTS user_role_account_level_guard ON user_roles;
DROP FUNCTION IF EXISTS enforce_account_role_level();

ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD CONSTRAINT users_status_check
 CHECK(status IN ('PENDING','ACTIVE','LOCKED','SUSPENDED','ARCHIVED'));
ALTER TABLE users ADD COLUMN last_login_at timestamptz;
ALTER TABLE users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE users SET status='LOCKED' WHERE NOT active;

CREATE OR REPLACE FUNCTION synchronize_user_status() RETURNS trigger AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT NEW.active AND NEW.status='ACTIVE' THEN NEW.status='LOCKED'; END IF;
  IF NEW.status<>'ACTIVE' THEN NEW.active=false; END IF;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  NEW.active=(NEW.status='ACTIVE');
 ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
  NEW.status=CASE WHEN NEW.active THEN 'ACTIVE' ELSE 'LOCKED' END;
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER users_status_sync
 BEFORE INSERT OR UPDATE ON users
 FOR EACH ROW EXECUTE FUNCTION synchronize_user_status();

COMMENT ON TABLE accounts IS
 'Global identity registry. Authorization comes from user_roles on each school membership, not account_level.';
COMMENT ON TABLE users IS
 'Login-capable membership of an identity (accounts) in a school tenant. Domain records may exist without this membership.';
COMMENT ON COLUMN accounts.account_level IS
 'Deprecated compatibility hint; it must not be used to select or authorize a login flow.';
COMMENT ON TABLE operational_accounts IS
 'Deprecated compatibility metadata; no longer an authentication boundary.';
COMMENT ON TABLE family_accounts IS
 'Deprecated compatibility metadata; no longer an authentication boundary.';
COMMENT ON TABLE tenant_accounts IS
 'Deprecated compatibility metadata; no longer an authentication boundary.';
