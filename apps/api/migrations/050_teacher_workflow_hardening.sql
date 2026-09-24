-- Phase 25A-25D: enforce tenant-local teacher workflow integrity without rewriting data.
-- Abort rather than silently discard historical duplicates before creating unique indexes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM teaching_plans
    GROUP BY tenant_id, teacher_id, class_id, subject_id, semester_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Cannot apply 050: duplicate teaching plans require manual resolution'; END IF;
  IF EXISTS (
    SELECT 1 FROM teaching_logs WHERE timetable_id IS NOT NULL
    GROUP BY tenant_id, timetable_id, date HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Cannot apply 050: duplicate timetable teaching logs require manual resolution'; END IF;
  IF EXISTS (
    SELECT 1 FROM teaching_logs WHERE timetable_id IS NULL
    GROUP BY tenant_id, class_id, subject_id, date HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Cannot apply 050: duplicate untimetabled teaching logs require manual resolution'; END IF;
END $$;

ALTER TABLE teaching_plans ADD CONSTRAINT teaching_plans_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE teaching_plan_items ADD CONSTRAINT teaching_plan_items_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE teaching_logs ADD CONSTRAINT teaching_logs_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE semesters ADD CONSTRAINT semesters_tenant_id_year_unique UNIQUE (tenant_id, id, academic_year_id);

CREATE UNIQUE INDEX teaching_plans_teacher_class_subject_semester_unique
  ON teaching_plans(tenant_id, teacher_id, class_id, subject_id, semester_id);
CREATE UNIQUE INDEX teaching_plan_items_meeting_unique
  ON teaching_plan_items(tenant_id, plan_id, meeting_number);
CREATE UNIQUE INDEX teaching_logs_timetable_date_unique
  ON teaching_logs(tenant_id, timetable_id, date) WHERE timetable_id IS NOT NULL;
CREATE UNIQUE INDEX teaching_logs_class_subject_date_without_timetable_unique
  ON teaching_logs(tenant_id, class_id, subject_id, date) WHERE timetable_id IS NULL;

ALTER TABLE teaching_plans
  ADD CONSTRAINT teaching_plans_teacher_fk FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_plans_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_plans_subject_fk FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_plans_semester_year_fk FOREIGN KEY (tenant_id, semester_id, academic_year_id) REFERENCES semesters(tenant_id, id, academic_year_id) NOT VALID;
ALTER TABLE teaching_plan_items
  ADD CONSTRAINT teaching_plan_items_plan_fk FOREIGN KEY (tenant_id, plan_id) REFERENCES teaching_plans(tenant_id, id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT teaching_plan_items_meeting_positive CHECK (meeting_number > 0) NOT VALID,
  ADD CONSTRAINT teaching_plan_items_status_check CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED')) NOT VALID;
ALTER TABLE teaching_logs
  ADD CONSTRAINT teaching_logs_plan_item_fk FOREIGN KEY (tenant_id, plan_item_id) REFERENCES teaching_plan_items(tenant_id, id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT teaching_logs_timetable_fk FOREIGN KEY (tenant_id, timetable_id) REFERENCES timetables(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_logs_teacher_fk FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_logs_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_logs_subject_fk FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_logs_semester_fk FOREIGN KEY (tenant_id, semester_id) REFERENCES semesters(tenant_id, id) NOT VALID,
  ADD CONSTRAINT teaching_logs_completion_status_check CHECK (completion_status IN ('COMPLETED', 'PARTIAL', 'NOT_COVERED')) NOT VALID;
