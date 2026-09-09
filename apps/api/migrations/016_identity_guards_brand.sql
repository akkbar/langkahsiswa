CREATE OR REPLACE FUNCTION enforce_account_role_level() RETURNS trigger AS $$
DECLARE level text;
BEGIN
 SELECT a.account_level INTO level FROM users u JOIN accounts a ON a.id=u.account_id
 WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.user_id;
 IF NEW.role_id IN ('PARENT','STUDENT') AND level <> 'FAMILY' THEN
  RAISE EXCEPTION 'family role requires FAMILY account' USING ERRCODE='23514';
 END IF;
 IF NEW.role_id NOT IN ('PARENT','STUDENT') AND level <> 'OPERATIONAL' THEN
  RAISE EXCEPTION 'operational role requires OPERATIONAL account' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER user_role_account_level_guard
 BEFORE INSERT OR UPDATE ON user_roles
 FOR EACH ROW EXECUTE FUNCTION enforce_account_role_level();

DO $$
DECLARE demo_account uuid;
BEGIN
 SELECT u.account_id INTO demo_account FROM users u JOIN tenants t ON t.id=u.tenant_id
 WHERE t.slug='demo' AND u.email=('admin@demo.school'||'app.id') LIMIT 1;
 IF demo_account IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM accounts WHERE email='admin@demo.langkahsiswa.id' AND id<>demo_account
 ) THEN
  UPDATE accounts SET email='admin@demo.langkahsiswa.id' WHERE id=demo_account;
  UPDATE users SET email='admin@demo.langkahsiswa.id',
   password_hash=crypt('LangkahSiswa!2026',gen_salt('bf',12))
  WHERE account_id=demo_account;
 END IF;
END $$;
