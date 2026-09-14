ALTER TABLE tenant_settings ADD COLUMN lesson_minutes integer NOT NULL DEFAULT 40 CHECK(lesson_minutes BETWEEN 10 AND 120);
CREATE TABLE subject_weekly_weights (
 tenant_id uuid NOT NULL REFERENCES tenants(id), subject_id uuid NOT NULL, grade_level_id uuid NOT NULL,
 weekly_weight integer NOT NULL CHECK(weekly_weight BETWEEN 0 AND 60),
 PRIMARY KEY(tenant_id,subject_id,grade_level_id),
 FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,grade_level_id) REFERENCES grade_levels(tenant_id,id) ON DELETE CASCADE
);
