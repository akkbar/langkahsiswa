-- Phase 25E–25H: granular visibility and CRUD permissions for teacher workflow.
-- Teacher endpoints retain their existing academic/attendance guards for backwards
-- compatibility; these permissions drive role settings and admin route gating.
INSERT INTO permissions(id) VALUES
  ('teaching_plan.create'), ('teaching_plan.read'),
  ('teaching_plan.update'), ('teaching_plan.delete'),
  ('teaching_log.create'), ('teaching_log.read'),
  ('teaching_log.update'), ('teaching_log.delete')
ON CONFLICT DO NOTHING;

-- Roles that already hold academic read can view workflow data. Roles that hold
-- academic write receive plan CRUD; attendance writers receive journal CRUD,
-- matching the current backend guards.
INSERT INTO role_permissions(role_id, permission_id)
SELECT DISTINCT rp.role_id, grants.permission_id
FROM role_permissions rp
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE
      WHEN rp.permission_id = 'academic.write' THEN ARRAY[
        'teaching_plan.create', 'teaching_plan.read',
        'teaching_plan.update', 'teaching_plan.delete',
        'teaching_log.read'
      ]
      WHEN rp.permission_id = 'academic.read' THEN ARRAY[
        'teaching_plan.read', 'teaching_log.read'
      ]
      WHEN rp.permission_id = 'attendance.write' THEN ARRAY[
        'teaching_log.create', 'teaching_log.read',
        'teaching_log.update', 'teaching_log.delete'
      ]
      ELSE ARRAY[]::text[]
    END
  ) AS permission_id
) grants
JOIN permissions p ON p.id = grants.permission_id
ON CONFLICT DO NOTHING;

INSERT INTO permission_realms(permission_id, account_level)
SELECT p.id, 'OPERATIONAL'
FROM permissions p
WHERE p.id IN (
  'teaching_plan.create', 'teaching_plan.read',
  'teaching_plan.update', 'teaching_plan.delete',
  'teaching_log.create', 'teaching_log.read',
  'teaching_log.update', 'teaching_log.delete'
)
ON CONFLICT DO NOTHING;
