ALTER TABLE schools
  ADD COLUMN education_authority text NOT NULL DEFAULT 'KEMENDIKBUD'
    CHECK (education_authority IN ('KEMENDIKBUD','KEMENAG')),
  ADD COLUMN npsn text,
  ADD COLUMN nss text,
  ADD COLUMN dapodik_id text,
  ADD COLUMN nsm text,
  ADD COLUMN emis_id text;

ALTER TABLE schools ADD CONSTRAINT schools_registry_by_authority_check CHECK (
  (education_authority='KEMENDIKBUD' AND nsm IS NULL AND emis_id IS NULL)
  OR
  (education_authority='KEMENAG' AND nss IS NULL AND dapodik_id IS NULL)
);

