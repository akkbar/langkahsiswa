ALTER TABLE schools ADD COLUMN school_level text
  CHECK (school_level IN ('PAUD','TK','SD','SMP','SMA'));

