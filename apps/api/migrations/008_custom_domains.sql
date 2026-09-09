ALTER TABLE tenant_domains
 ADD COLUMN verification_token text,
 ADD COLUMN verification_status text NOT NULL DEFAULT 'PENDING'
  CHECK(verification_status IN ('PENDING','VERIFIED','ACTIVE','FAILED')),
 ADD COLUMN ssl_status text NOT NULL DEFAULT 'PENDING'
  CHECK(ssl_status IN ('PENDING','ACTIVE','FAILED')),
 ADD COLUMN cname_target text NOT NULL DEFAULT 'domains.langkahsiswa.id',
 ADD COLUMN last_checked_at timestamptz,
 ADD COLUMN verification_error text,
 ADD COLUMN created_by uuid,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT tenant_domain_creator_fk FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id);
UPDATE tenant_domains SET verification_status='ACTIVE',ssl_status='ACTIVE' WHERE verified_at IS NOT NULL;
CREATE UNIQUE INDEX one_primary_domain ON tenant_domains(tenant_id) WHERE is_primary;
CREATE INDEX tenant_domain_status ON tenant_domains(tenant_id,verification_status);

INSERT INTO permissions(id) VALUES ('domain.read'),('domain.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.id='PRINCIPAL' AND p.id='domain.read' ON CONFLICT DO NOTHING;
