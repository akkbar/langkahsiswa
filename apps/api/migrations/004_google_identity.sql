CREATE TABLE user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider = 'GOOGLE'),
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,provider,subject),
  UNIQUE(tenant_id,user_id,provider),
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);

-- Upgrade existing installations without depending on rerunning demo seed.
INSERT INTO permissions(id) VALUES
 ('finance.read'),('finance.write'),('wallet.read'),('wallet.write'),('pos.write'),
 ('event.read'),('event.write'),('notification.read'),('notification.manage')
 ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.id='FINANCE' AND p.id IN ('finance.read','finance.write','wallet.read','wallet.write','pos.write'))
 OR (r.id='PRINCIPAL' AND p.id='event.write')
 OR (p.id IN ('event.read','notification.read'))
 ON CONFLICT DO NOTHING;
