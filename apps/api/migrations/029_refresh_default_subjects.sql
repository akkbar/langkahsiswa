-- Refresh unused generated defaults when a school's level or authority changes.
CREATE OR REPLACE FUNCTION prefill_school_subjects()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (
  OLD.school_level IS DISTINCT FROM NEW.school_level
  OR OLD.education_authority IS DISTINCT FROM NEW.education_authority
 ) THEN
  DELETE FROM subjects subject
  WHERE subject.tenant_id=NEW.tenant_id
   AND subject.school_id=NEW.id
   AND subject.curriculum_template_id IS NOT NULL
   AND NOT EXISTS(
    SELECT 1 FROM teacher_subjects assignment
    WHERE assignment.tenant_id=subject.tenant_id
     AND assignment.subject_id=subject.id
   )
   AND NOT EXISTS(
    SELECT 1 FROM class_subjects assignment
    WHERE assignment.tenant_id=subject.tenant_id
     AND assignment.subject_id=subject.id
   )
   AND NOT EXISTS(
    SELECT 1 FROM report_card_items report
    WHERE report.tenant_id=subject.tenant_id
     AND report.subject_id=subject.id
   );
 END IF;

 IF NEW.school_level IN ('SD','SMP','SMA') THEN
  INSERT INTO subjects(
   tenant_id,school_id,name,code,curriculum_template_id
  )
  SELECT NEW.tenant_id,NEW.id,template.name,template.code,template.id
  FROM curriculum_subject_templates template
  WHERE template.school_level=NEW.school_level
   AND template.education_authority=NEW.education_authority
   AND template.active
   AND NOT EXISTS(
    SELECT 1 FROM subjects existing
    WHERE existing.tenant_id=NEW.tenant_id AND existing.school_id=NEW.id
     AND (upper(existing.code)=upper(template.code)
       OR lower(existing.name)=lower(template.name))
   )
  ON CONFLICT(tenant_id,school_id,code) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
