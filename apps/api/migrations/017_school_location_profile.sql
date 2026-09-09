ALTER TABLE schools
  ADD COLUMN principal_teacher_id uuid,
  ADD CONSTRAINT schools_principal_teacher_fkey
    FOREIGN KEY (tenant_id, principal_teacher_id) REFERENCES teachers(tenant_id, id);

ALTER TABLE managed_files DROP CONSTRAINT managed_files_category_check;
ALTER TABLE managed_files ADD CONSTRAINT managed_files_category_check
  CHECK (category IN (
    'STUDENT_PHOTO', 'FAMILY_CARD', 'BIRTH_CERTIFICATE', 'PPDB_DOCUMENT',
    'PAYMENT_PROOF', 'WEBSITE_IMAGE', 'REPORT_CARD', 'SCHOOL_PHOTO', 'OTHER'
  ));
