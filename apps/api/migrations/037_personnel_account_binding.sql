CREATE UNIQUE INDEX IF NOT EXISTS staff_user_unique
 ON staff(tenant_id,user_id) WHERE user_id IS NOT NULL;

COMMENT ON INDEX staff_user_unique IS
 'One staff profile per user account in a school.';
