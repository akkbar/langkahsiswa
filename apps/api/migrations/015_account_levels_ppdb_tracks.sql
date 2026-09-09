ALTER TABLE accounts ADD COLUMN account_level text NOT NULL DEFAULT 'OPERATIONAL'
 CHECK(account_level IN ('OPERATIONAL','FAMILY'));

UPDATE accounts a SET account_level='FAMILY'
WHERE NOT EXISTS (
 SELECT 1 FROM users u JOIN user_roles ur
  ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
 WHERE u.account_id=a.id
 AND ur.role_id NOT IN ('PARENT','STUDENT')
);

CREATE TABLE operational_accounts (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 position text NOT NULL DEFAULT 'STAFF'
  CHECK(position IN ('STAFF','TEACHER','PRINCIPAL','FOUNDATION_STAFF','FOUNDATION_HEAD')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE family_accounts (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 created_via text NOT NULL DEFAULT 'SELF_REGISTRATION'
  CHECK(created_via IN ('SELF_REGISTRATION','SCHOOL_ADMIN','MIGRATION')),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO operational_accounts(account_id,position)
SELECT id,'STAFF' FROM accounts WHERE account_level='OPERATIONAL';
INSERT INTO family_accounts(account_id,created_via)
SELECT id,'MIGRATION' FROM accounts WHERE account_level='FAMILY';

INSERT INTO roles(id) VALUES('STAFF'),('FOUNDATION_STAFF'),('FOUNDATION_HEAD')
ON CONFLICT DO NOTHING;
INSERT INTO permissions(id) VALUES
 ('family.read'),('family.write'),('family.student.manage')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT role_id,permission_id FROM (VALUES
 ('STAFF','school.read'),('STAFF','student.read'),('STAFF','student.create'),
 ('STAFF','student.update'),('STAFF','people.read'),('STAFF','people.write'),
 ('STAFF','user.write'),('STAFF','admission.read'),('STAFF','admission.write'),
 ('STAFF','event.read'),('STAFF','notification.read'),('STAFF','site.read'),
 ('FOUNDATION_STAFF','school.read'),('FOUNDATION_STAFF','student.read'),
 ('FOUNDATION_STAFF','people.read'),('FOUNDATION_STAFF','finance.read'),
 ('FOUNDATION_STAFF','report.read'),('FOUNDATION_STAFF','event.read'),
 ('FOUNDATION_STAFF','admission.read'),('FOUNDATION_STAFF','site.read'),
 ('FOUNDATION_HEAD','school.read'),('FOUNDATION_HEAD','school.write'),
 ('FOUNDATION_HEAD','student.read'),('FOUNDATION_HEAD','people.read'),
 ('FOUNDATION_HEAD','academic.read'),('FOUNDATION_HEAD','finance.read'),
 ('FOUNDATION_HEAD','report.read'),('FOUNDATION_HEAD','report.approve'),
 ('FOUNDATION_HEAD','event.read'),('FOUNDATION_HEAD','admission.read'),
 ('FOUNDATION_HEAD','audit.read'),('FOUNDATION_HEAD','site.read'),
 ('FOUNDATION_HEAD','site.write'),('PARENT','family.read'),
 ('PARENT','family.write'),('PARENT','family.student.manage'),
 ('STUDENT','family.read')
) grants(role_id,permission_id)
JOIN roles r ON r.id=grants.role_id
JOIN permissions p ON p.id=grants.permission_id
ON CONFLICT DO NOTHING;

CREATE TABLE admission_tracks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 period_id uuid NOT NULL,
 name text NOT NULL,
 code text NOT NULL CHECK(code=upper(code)),
 cost numeric(14,2) NOT NULL DEFAULT 0 CHECK(cost>=0),
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,period_id,code),
 FOREIGN KEY(tenant_id,period_id) REFERENCES admission_periods(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
ALTER TABLE applications ADD COLUMN track_id uuid;
ALTER TABLE applications ADD COLUMN family_account_id uuid REFERENCES family_accounts(account_id);
ALTER TABLE applications ADD CONSTRAINT application_track_fk
 FOREIGN KEY(tenant_id,track_id) REFERENCES admission_tracks(tenant_id,id);
CREATE INDEX applications_family_lookup
 ON applications(tenant_id,family_account_id,submitted_at DESC);

ALTER TABLE tenant_domains ALTER COLUMN cname_target
 SET DEFAULT 'domains.langkahsiswa.id';
UPDATE tenant_domains SET cname_target='domains.langkahsiswa.id'
WHERE cname_target=('domains.school'||'app.id');
