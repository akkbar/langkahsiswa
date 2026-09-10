ALTER TABLE roles ADD COLUMN scope_level text NOT NULL DEFAULT 'SCHOOL';
ALTER TABLE roles ADD CONSTRAINT roles_scope_level_check
 CHECK(scope_level IN ('PLATFORM','FOUNDATION','SCHOOL'));

UPDATE roles SET scope_level=CASE
 WHEN id='SUPER_ADMIN' THEN 'PLATFORM'
 WHEN id IN ('FOUNDATION_HEAD','FOUNDATION_STAFF') THEN 'FOUNDATION'
 ELSE 'SCHOOL'
END;

CREATE TABLE user_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES accounts(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 tenant_id uuid REFERENCES tenants(id),
 role_id text NOT NULL REFERENCES roles(id),
 status text NOT NULL DEFAULT 'ACTIVE'
  CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_bindings_foundation_unique
 ON user_bindings(account_id,organization_id,role_id) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX user_bindings_school_unique
 ON user_bindings(account_id,organization_id,tenant_id,role_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX user_bindings_access_lookup
 ON user_bindings(account_id,organization_id,status,tenant_id);

CREATE OR REPLACE FUNCTION validate_user_binding() RETURNS trigger AS $$
DECLARE role_scope text;
BEGIN
 SELECT scope_level INTO role_scope FROM roles WHERE id=NEW.role_id;
 IF role_scope='SCHOOL' AND NEW.tenant_id IS NULL THEN
  RAISE EXCEPTION 'school role requires a school binding' USING ERRCODE='23514';
 END IF;
 IF role_scope IN ('PLATFORM','FOUNDATION') AND NEW.tenant_id IS NOT NULL THEN
  RAISE EXCEPTION 'platform/foundation role requires foundation scope' USING ERRCODE='23514';
 END IF;
 IF NEW.tenant_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM organization_sites os
  WHERE os.organization_id=NEW.organization_id AND os.tenant_id=NEW.tenant_id
 ) THEN
  RAISE EXCEPTION 'bound school does not belong to foundation' USING ERRCODE='23514';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER user_bindings_scope_guard
 BEFORE INSERT OR UPDATE ON user_bindings
 FOR EACH ROW EXECUTE FUNCTION validate_user_binding();

INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
SELECT DISTINCT u.account_id,os.organization_id,
 CASE WHEN r.scope_level='SCHOOL' THEN u.tenant_id ELSE NULL END,
 ur.role_id
FROM users u
JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
JOIN roles r ON r.id=ur.role_id
JOIN organization_sites os ON os.tenant_id=u.tenant_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE user_bindings IS
 'Authoritative account access scope. NULL tenant_id grants foundation-wide access; a tenant_id grants one school/site.';
COMMENT ON COLUMN user_bindings.tenant_id IS
 'Operational school/site scope. NULL means the complete foundation.';
