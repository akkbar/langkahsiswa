-- Keep legacy *.write grants operational while introducing explicit CRUD
-- permissions for page visibility and action-level authorization.
INSERT INTO permissions(id)
SELECT DISTINCT split_part(id,'.',1)||'.'||action
FROM permissions
CROSS JOIN (VALUES('create'),('read'),('update'),('delete')) actions(action)
WHERE id LIKE '%.write'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT rp.role_id,split_part(rp.permission_id,'.',1)||'.'||actions.action
FROM role_permissions rp
CROSS JOIN (VALUES('create'),('read'),('update'),('delete')) actions(action)
WHERE rp.permission_id LIKE '%.write'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE permissions IS
 'Permissions use area.action. Standard page actions are create, read, update, and delete; read controls menu visibility.';
COMMENT ON COLUMN roles.account_level IS
 'Role realm classification: OPERATIONAL (yayasan/sekolah), FAMILY (siswa/wali), or TENANT (kantin/vendor).';
