-- Operational subject defaults selected by school level and education authority.
CREATE TABLE curriculum_subject_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_level text NOT NULL CHECK(school_level IN ('SD','SMP','SMA')),
 education_authority text NOT NULL
  CHECK(education_authority IN ('KEMENDIKBUD','KEMENAG')),
 code text NOT NULL,
 name text NOT NULL,
 sort_order integer NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_level,education_authority,code)
);

ALTER TABLE subjects
 ADD COLUMN curriculum_template_id uuid
  REFERENCES curriculum_subject_templates(id) ON DELETE SET NULL;

INSERT INTO curriculum_subject_templates(
 school_level,education_authority,code,name,sort_order
) VALUES
 ('SD','KEMENDIKBUD','PA','Pendidikan Agama dan Budi Pekerti',1),
 ('SD','KEMENDIKBUD','PPKN','Pendidikan Pancasila',2),
 ('SD','KEMENDIKBUD','BIN','Bahasa Indonesia',3),
 ('SD','KEMENDIKBUD','MTK','Matematika',4),
 ('SD','KEMENDIKBUD','IPAS','Ilmu Pengetahuan Alam dan Sosial (IPAS)',5),
 ('SD','KEMENDIKBUD','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',6),
 ('SD','KEMENDIKBUD','SENI','Seni dan Budaya',7),
 ('SD','KEMENDIKBUD','BING','Bahasa Inggris',8),
 ('SD','KEMENDIKBUD','MULOK','Muatan Lokal',9),
 ('SD','KEMENAG','QH','Al-Qur''an Hadis',1),
 ('SD','KEMENAG','AA','Akidah Akhlak',2),
 ('SD','KEMENAG','FIQ','Fikih',3),
 ('SD','KEMENAG','SKI','Sejarah Kebudayaan Islam',4),
 ('SD','KEMENAG','PPKN','Pendidikan Pancasila',5),
 ('SD','KEMENAG','BIN','Bahasa Indonesia',6),
 ('SD','KEMENAG','MTK','Matematika',7),
 ('SD','KEMENAG','IPAS','Ilmu Pengetahuan Alam dan Sosial (IPAS)',8),
 ('SD','KEMENAG','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',9),
 ('SD','KEMENAG','SENI','Seni dan Budaya atau Prakarya',10),
 ('SD','KEMENAG','BAR','Bahasa Arab',11),
 ('SD','KEMENAG','BING','Bahasa Inggris',12),
 ('SD','KEMENAG','MULOK','Muatan Lokal',13),
 ('SMP','KEMENDIKBUD','PA','Pendidikan Agama dan Budi Pekerti',1),
 ('SMP','KEMENDIKBUD','PPKN','Pendidikan Pancasila',2),
 ('SMP','KEMENDIKBUD','BIN','Bahasa Indonesia',3),
 ('SMP','KEMENDIKBUD','MTK','Matematika',4),
 ('SMP','KEMENDIKBUD','IPA','Ilmu Pengetahuan Alam',5),
 ('SMP','KEMENDIKBUD','IPS','Ilmu Pengetahuan Sosial',6),
 ('SMP','KEMENDIKBUD','BING','Bahasa Inggris',7),
 ('SMP','KEMENDIKBUD','INF','Informatika',8),
 ('SMP','KEMENDIKBUD','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',9),
 ('SMP','KEMENDIKBUD','SENI','Seni dan Budaya atau Prakarya',10),
 ('SMP','KEMENDIKBUD','MULOK','Muatan Lokal',11),
 ('SMP','KEMENAG','QH','Al-Qur''an Hadis',1),
 ('SMP','KEMENAG','AA','Akidah Akhlak',2),
 ('SMP','KEMENAG','FIQ','Fikih',3),
 ('SMP','KEMENAG','SKI','Sejarah Kebudayaan Islam',4),
 ('SMP','KEMENAG','PPKN','Pendidikan Pancasila',5),
 ('SMP','KEMENAG','BIN','Bahasa Indonesia',6),
 ('SMP','KEMENAG','MTK','Matematika',7),
 ('SMP','KEMENAG','IPA','Ilmu Pengetahuan Alam',8),
 ('SMP','KEMENAG','IPS','Ilmu Pengetahuan Sosial',9),
 ('SMP','KEMENAG','BING','Bahasa Inggris',10),
 ('SMP','KEMENAG','INF','Informatika',11),
 ('SMP','KEMENAG','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',12),
 ('SMP','KEMENAG','SENI','Seni dan Budaya atau Prakarya',13),
 ('SMP','KEMENAG','BAR','Bahasa Arab',14),
 ('SMP','KEMENAG','MULOK','Muatan Lokal',15),
 ('SMA','KEMENDIKBUD','PA','Pendidikan Agama dan Budi Pekerti',1),
 ('SMA','KEMENDIKBUD','PPKN','Pendidikan Pancasila',2),
 ('SMA','KEMENDIKBUD','BIN','Bahasa Indonesia',3),
 ('SMA','KEMENDIKBUD','MTK','Matematika',4),
 ('SMA','KEMENDIKBUD','FIS','Fisika',5),
 ('SMA','KEMENDIKBUD','KIM','Kimia',6),
 ('SMA','KEMENDIKBUD','BIO','Biologi',7),
 ('SMA','KEMENDIKBUD','SEJ','Sejarah',8),
 ('SMA','KEMENDIKBUD','SOS','Sosiologi',9),
 ('SMA','KEMENDIKBUD','EKO','Ekonomi',10),
 ('SMA','KEMENDIKBUD','GEO','Geografi',11),
 ('SMA','KEMENDIKBUD','BING','Bahasa Inggris',12),
 ('SMA','KEMENDIKBUD','INF','Informatika',13),
 ('SMA','KEMENDIKBUD','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',14),
 ('SMA','KEMENDIKBUD','SENI','Seni dan Budaya atau Prakarya',15),
 ('SMA','KEMENDIKBUD','MULOK','Muatan Lokal',16),
 ('SMA','KEMENAG','QH','Al-Qur''an Hadis',1),
 ('SMA','KEMENAG','AA','Akidah Akhlak',2),
 ('SMA','KEMENAG','FIQ','Fikih',3),
 ('SMA','KEMENAG','SKI','Sejarah Kebudayaan Islam',4),
 ('SMA','KEMENAG','BAR','Bahasa Arab',5),
 ('SMA','KEMENAG','PPKN','Pendidikan Pancasila',6),
 ('SMA','KEMENAG','BIN','Bahasa Indonesia',7),
 ('SMA','KEMENAG','MTK','Matematika',8),
 ('SMA','KEMENAG','FIS','Fisika',9),
 ('SMA','KEMENAG','KIM','Kimia',10),
 ('SMA','KEMENAG','BIO','Biologi',11),
 ('SMA','KEMENAG','SEJ','Sejarah',12),
 ('SMA','KEMENAG','SOS','Sosiologi',13),
 ('SMA','KEMENAG','EKO','Ekonomi',14),
 ('SMA','KEMENAG','GEO','Geografi',15),
 ('SMA','KEMENAG','BING','Bahasa Inggris',16),
 ('SMA','KEMENAG','INF','Informatika',17),
 ('SMA','KEMENAG','PJOK','Pendidikan Jasmani, Olahraga, dan Kesehatan',18),
 ('SMA','KEMENAG','SENI','Seni dan Budaya atau Prakarya',19),
 ('SMA','KEMENAG','MULOK','Muatan Lokal',20);

CREATE OR REPLACE FUNCTION prefill_school_subjects()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

CREATE TRIGGER schools_prefill_default_subjects
AFTER INSERT OR UPDATE OF school_level,education_authority ON schools
FOR EACH ROW EXECUTE FUNCTION prefill_school_subjects();

-- Existing schools receive the same defaults once during migration.
INSERT INTO subjects(tenant_id,school_id,name,code,curriculum_template_id)
SELECT school.tenant_id,school.id,template.name,template.code,template.id
FROM schools school
JOIN curriculum_subject_templates template
 ON template.school_level=school.school_level
 AND template.education_authority=school.education_authority
 AND template.active
WHERE NOT EXISTS(
 SELECT 1 FROM subjects existing
 WHERE existing.tenant_id=school.tenant_id AND existing.school_id=school.id
  AND (upper(existing.code)=upper(template.code)
    OR lower(existing.name)=lower(template.name))
)
ON CONFLICT(tenant_id,school_id,code) DO NOTHING;

COMMENT ON COLUMN subjects.curriculum_template_id IS
 'Template that originally prefilled this school subject; null means manually created.';
