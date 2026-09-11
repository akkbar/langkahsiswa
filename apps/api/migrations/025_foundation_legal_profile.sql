-- Foundation is the legal entity above operational school tenants.
ALTER TABLE organizations
 ADD COLUMN short_name text,
 ADD COLUMN legal_name text,
 ADD COLUMN legal_status text NOT NULL DEFAULT 'ACTIVE'
  CHECK(legal_status IN ('ACTIVE','INACTIVE','DISSOLVED')),
 ADD COLUMN legal_entity_number text,
 ADD COLUMN legal_entity_date date,
 ADD COLUMN ahu_registration_number text,
 ADD COLUMN deed_number text,
 ADD COLUMN deed_date date,
 ADD COLUMN notary_name text,
 ADD COLUMN npwp text,
 ADD COLUMN nib text,
 ADD COLUMN npyp text,
 ADD COLUMN address text,
 ADD COLUMN province_id text,
 ADD COLUMN city_id text,
 ADD COLUMN district_id text,
 ADD COLUMN village_id text,
 ADD COLUMN postal_code text,
 ADD COLUMN phone text,
 ADD COLUMN email text,
 ADD COLUMN website text,
 ADD COLUMN established_date date,
 ADD COLUMN foundation_type text NOT NULL DEFAULT 'EDUCATION'
  CHECK(foundation_type IN ('EDUCATION','SOCIAL','RELIGIOUS','HUMANITARIAN','OTHER')),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE organizations SET legal_name=name WHERE legal_name IS NULL;

CREATE TABLE foundation_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 document_type text NOT NULL,
 document_number text,
 document_date date,
 file_url text,
 valid_from date,
 valid_until date,
 is_active boolean NOT NULL DEFAULT true,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from)
);

CREATE TABLE foundation_licenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 license_type text NOT NULL CHECK(license_type IN (
  'AHU_APPROVAL','NIB','TAX_REGISTRATION','DOMICILE','FOUNDATION_OPERATIONAL','OTHER'
 )),
 license_number text NOT NULL,
 issued_by text,
 issue_date date,
 valid_from date,
 valid_until date,
 document_id uuid REFERENCES foundation_documents(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'ACTIVE'
  CHECK(status IN ('DRAFT','ACTIVE','EXPIRED','REVOKED')),
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from)
);

CREATE TABLE foundation_officials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 person_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
 person_name text NOT NULL,
 organ_type text NOT NULL CHECK(organ_type IN ('PEMBINA','PENGURUS','PENGAWAS')),
 position text NOT NULL,
 start_date date NOT NULL,
 end_date date,
 is_active boolean NOT NULL DEFAULT true,
 appointment_document_id uuid REFERENCES foundation_documents(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date IS NULL OR end_date>=start_date)
);

CREATE TABLE foundation_tax_profiles (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 npwp text,
 tax_status text NOT NULL DEFAULT 'REGISTERED'
  CHECK(tax_status IN ('UNREGISTERED','REGISTERED','INACTIVE')),
 pkp_status text NOT NULL DEFAULT 'NON_PKP'
  CHECK(pkp_status IN ('NON_PKP','PKP')),
 tax_office_name text,
 tax_office_code text,
 bookkeeping_start_month integer NOT NULL DEFAULT 1 CHECK(bookkeeping_start_month BETWEEN 1 AND 12),
 fiscal_year_start date,
 tax_email text,
 tax_phone text,
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schools
 ADD COLUMN code text,
 ADD COLUMN education_form text,
 ADD COLUMN ownership_status text NOT NULL DEFAULT 'PRIVATE'
  CHECK(ownership_status IN ('PUBLIC','PRIVATE')),
 ADD COLUMN province_id text,
 ADD COLUMN city_id text,
 ADD COLUMN district_id text,
 ADD COLUMN village_id text,
 ADD COLUMN postal_code text,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE schools s SET code=os.site_code
FROM organization_sites os WHERE os.tenant_id=s.tenant_id AND s.code IS NULL;

CREATE TABLE school_licenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 school_id uuid NOT NULL,
 license_type text NOT NULL CHECK(license_type IN ('ESTABLISHMENT','OPERATIONAL','ACCREDITATION','OTHER')),
 license_number text NOT NULL,
 issued_by text,
 issue_date date,
 valid_from date,
 valid_until date,
 accreditation_grade text,
 document_id uuid,
 status text NOT NULL DEFAULT 'ACTIVE'
  CHECK(status IN ('DRAFT','ACTIVE','EXPIRED','REVOKED')),
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id) ON DELETE CASCADE,
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from)
);

CREATE INDEX foundation_officials_history
 ON foundation_officials(organization_id,organ_type,is_active,start_date DESC);
CREATE INDEX foundation_licenses_history
 ON foundation_licenses(organization_id,license_type,status,valid_until);
CREATE INDEX foundation_documents_lookup
 ON foundation_documents(organization_id,document_type,is_active);
CREATE INDEX school_licenses_history
 ON school_licenses(tenant_id,school_id,license_type,status,valid_until);

INSERT INTO permissions(id) VALUES
 ('foundation.create'),('foundation.read'),('foundation.update'),('foundation.delete')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT DISTINCT rp.role_id,'foundation.read'
FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
WHERE rp.permission_id='site.read' AND r.account_level='OPERATIONAL'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT DISTINCT rp.role_id,'foundation.'||action
FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
CROSS JOIN (VALUES('create'),('update'),('delete')) actions(action)
WHERE rp.permission_id IN ('site.write','site.create','site.update','site.delete')
 AND r.account_level='OPERATIONAL'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE organizations IS
 'Foundation legal entity above operational school tenants.';
COMMENT ON TABLE school_licenses IS
 'Versioned school establishment, operational, and accreditation records.';
