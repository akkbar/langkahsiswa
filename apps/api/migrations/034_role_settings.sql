ALTER TABLE roles ADD COLUMN IF NOT EXISTS name text;
UPDATE roles SET name=CASE id
 WHEN 'SUPER_ADMIN' THEN 'Super Admin'
 WHEN 'SCHOOL_ADMIN' THEN 'Admin Sekolah'
 WHEN 'PRINCIPAL' THEN 'Kepala Sekolah'
 WHEN 'TEACHER' THEN 'Guru'
 WHEN 'FINANCE' THEN 'Keuangan'
 WHEN 'STAFF' THEN 'Staff'
 WHEN 'FOUNDATION_STAFF' THEN 'Staff Yayasan'
 WHEN 'FOUNDATION_HEAD' THEN 'Kepala Yayasan'
 WHEN 'PARENT' THEN 'Orang Tua / Wali'
 WHEN 'STUDENT' THEN 'Siswa'
 WHEN 'CANTEEN_ADMIN' THEN 'Administrator Kantin'
 ELSE initcap(replace(id,'_',' '))
END WHERE name IS NULL;
ALTER TABLE roles ALTER COLUMN name SET NOT NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT true;

CREATE TABLE permission_realms (
 permission_id text NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
 account_level text NOT NULL
  CHECK(account_level IN ('OPERATIONAL','FAMILY','TENANT')),
 PRIMARY KEY(permission_id,account_level)
);

INSERT INTO permission_realms(permission_id,account_level)
SELECT DISTINCT rp.permission_id,r.account_level
FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE permission_realms IS
 'Permission catalog available to roles in each account realm.';
COMMENT ON COLUMN roles.name IS
 'Human-readable role name shown in Role Setting.';
