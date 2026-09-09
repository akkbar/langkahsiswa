CREATE TABLE website_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id), school_id uuid NOT NULL,
 site_name text NOT NULL, tagline text NOT NULL DEFAULT '',
 primary_color text NOT NULL DEFAULT '#004aad', updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
 CHECK(primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE website_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 school_id uuid NOT NULL, title text NOT NULL, slug text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
 published_version_id uuid, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 CHECK(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE website_page_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 page_id uuid NOT NULL, version_number integer NOT NULL CHECK(version_number>0),
 content jsonb NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,page_id,version_number),
 FOREIGN KEY(tenant_id,page_id) REFERENCES website_pages(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
ALTER TABLE website_pages ADD CONSTRAINT website_page_published_version_fk
 FOREIGN KEY(tenant_id,published_version_id) REFERENCES website_page_versions(tenant_id,id);

CREATE TABLE website_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 file_id uuid NOT NULL, name text NOT NULL, alt_text text NOT NULL DEFAULT '',
 published boolean NOT NULL DEFAULT false, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,file_id),
 FOREIGN KEY(tenant_id,file_id) REFERENCES managed_files(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX website_page_public ON website_pages(tenant_id,slug) WHERE status='PUBLISHED';
CREATE INDEX website_version_history ON website_page_versions(tenant_id,page_id,version_number DESC);
CREATE INDEX website_asset_library ON website_assets(tenant_id,created_at DESC);

INSERT INTO permissions(id) VALUES ('website.read'),('website.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE r.id='PRINCIPAL' AND p.id='website.read'
 ON CONFLICT DO NOTHING;
