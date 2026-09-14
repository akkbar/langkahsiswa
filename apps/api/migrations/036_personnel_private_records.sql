CREATE TABLE personnel_private_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 teacher_id uuid,
 staff_id uuid,
 employment_status text NOT NULL DEFAULT 'PERMANENT'
  CHECK(employment_status IN ('PERMANENT','CONTRACT','HONORARY','INTERN')),
 hire_date date,
 base_salary numeric(14,2) CHECK(base_salary>=0),
 allowance numeric(14,2) CHECK(allowance>=0),
 bank_name text,
 bank_account_number text,
 tax_number text,
 national_id text,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((teacher_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1),
 FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,staff_id) REFERENCES staff(tenant_id,id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX personnel_private_teacher_unique
 ON personnel_private_records(tenant_id,teacher_id) WHERE teacher_id IS NOT NULL;
CREATE UNIQUE INDEX personnel_private_staff_unique
 ON personnel_private_records(tenant_id,staff_id) WHERE staff_id IS NOT NULL;

INSERT INTO permissions(id) VALUES
 ('hr_private.read'),('hr_private.write'),('hr_private.create'),
 ('hr_private.update'),('hr_private.delete')
ON CONFLICT DO NOTHING;
INSERT INTO permission_realms(permission_id,account_level)
SELECT id,'OPERATIONAL' FROM permissions WHERE id LIKE 'hr_private.%'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT 'FOUNDATION_HEAD',id FROM permissions WHERE id LIKE 'hr_private.%'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE personnel_private_records IS
 'Restricted HR data. Never expose this table through the generic resource catalog.';
COMMENT ON TABLE teacher_competencies IS
 'Binding kompetensi guru ke mata pelajaran dan tingkat kelas; dikelola dari Yayasan > Guru dan Staff.';
