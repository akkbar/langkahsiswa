CREATE TABLE user_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ROTATED','REVOKED','EXPIRED')),
 ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
ALTER TABLE refresh_tokens ADD COLUMN session_id uuid;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_token_session_fk
 FOREIGN KEY(tenant_id,session_id) REFERENCES user_sessions(tenant_id,id);
CREATE UNIQUE INDEX refresh_token_session_unique ON refresh_tokens(session_id) WHERE session_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX active_user_sessions ON user_sessions(tenant_id,user_id,status,expires_at);

CREATE TABLE login_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), user_id uuid,
 email text NOT NULL, provider text NOT NULL CHECK(provider IN ('PASSWORD','GOOGLE','REFRESH')),
 success boolean NOT NULL, failure_reason text, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX login_history_lookup ON login_history(tenant_id,created_at DESC);

CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 action text NOT NULL, method text NOT NULL, path text NOT NULL, entity_type text, entity_id text,
 ip_address text, user_agent text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX audit_log_timeline ON audit_logs(tenant_id,created_at DESC);
CREATE INDEX audit_log_entity ON audit_logs(tenant_id,entity_type,entity_id);
CREATE FUNCTION reject_security_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Security logs are append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_audit_logs BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_security_log_change();
CREATE TRIGGER immutable_login_history BEFORE UPDATE OR DELETE ON login_history FOR EACH ROW EXECUTE FUNCTION reject_security_log_change();

INSERT INTO permissions(id) VALUES ('audit.read'),('session.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.id='PRINCIPAL' AND p.id='audit.read' ON CONFLICT DO NOTHING;
