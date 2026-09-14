ALTER TABLE roles ADD COLUMN organization_id uuid REFERENCES organizations(id);
CREATE INDEX roles_organization_lookup ON roles(organization_id);

CREATE TABLE organization_role_overrides (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,role_id)
);

CREATE TABLE organization_role_permissions (
 organization_id uuid NOT NULL,
 role_id text NOT NULL,
 permission_id text NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
 PRIMARY KEY(organization_id,role_id,permission_id),
 FOREIGN KEY(organization_id,role_id)
  REFERENCES organization_role_overrides(organization_id,role_id) ON DELETE CASCADE
);

COMMENT ON COLUMN roles.organization_id IS
 'Owner foundation for custom roles; NULL identifies built-in role templates.';
COMMENT ON TABLE organization_role_overrides IS
 'Marks that a foundation uses its own permission set for a built-in role, including an intentionally empty set.';
