-- Repair databases where built-in roles were initialized after migration 022
-- and therefore inherited the SCHOOL default.
UPDATE roles SET scope_level=CASE
 WHEN id='SUPER_ADMIN' THEN 'PLATFORM'
 WHEN id IN ('FOUNDATION_HEAD','FOUNDATION_STAFF') THEN 'FOUNDATION'
 ELSE 'SCHOOL'
END;
