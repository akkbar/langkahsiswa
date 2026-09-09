CREATE TABLE accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 email text NOT NULL UNIQUE CHECK(email=lower(email)),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO accounts(name,email,active,created_at)
SELECT DISTINCT ON (lower(email)) name,lower(email),active,created_at
FROM users
ORDER BY lower(email),created_at,id;

ALTER TABLE users ADD COLUMN account_id uuid;
UPDATE users u SET account_id=a.id FROM accounts a WHERE a.email=lower(u.email);
ALTER TABLE users ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_account_fk FOREIGN KEY(account_id) REFERENCES accounts(id);
CREATE UNIQUE INDEX users_tenant_account_unique ON users(tenant_id,account_id);
CREATE INDEX users_account_lookup ON users(account_id,tenant_id) WHERE active;

CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 slug text NOT NULL UNIQUE CHECK(slug=lower(slug)),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_sites (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id),
 site_code text NOT NULL CHECK(site_code=lower(site_code)),
 is_primary boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,tenant_id),
 UNIQUE(organization_id,site_code)
);
CREATE UNIQUE INDEX organization_primary_site
 ON organization_sites(organization_id) WHERE is_primary;

INSERT INTO organizations(id,name,slug,status,created_at)
SELECT id,name,slug,status,created_at FROM tenants;
INSERT INTO organization_sites(organization_id,tenant_id,site_code,is_primary,created_at)
SELECT id,id,slug,true,created_at FROM tenants;

INSERT INTO permissions(id) VALUES('site.read'),('site.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT role_id,permission_id FROM (VALUES
 ('SUPER_ADMIN','site.read'),('SUPER_ADMIN','site.write'),
 ('SCHOOL_ADMIN','site.read'),('SCHOOL_ADMIN','site.write'),
 ('PRINCIPAL','site.read'),('TEACHER','site.read'),('FINANCE','site.read'),
 ('PARENT','site.read'),('STUDENT','site.read')
) grant_rows(role_id,permission_id)
JOIN roles r ON r.id=grant_rows.role_id
ON CONFLICT DO NOTHING;
