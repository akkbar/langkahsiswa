CREATE TABLE student_score_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 class_subject_id uuid NOT NULL, assessment_id uuid NOT NULL, student_id uuid NOT NULL,
 student_name text NOT NULL, assessment_name text NOT NULL,
 old_score numeric(10,3), new_score numeric(10,3),
 action text NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE')),
 actor_id uuid NOT NULL, actor_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX student_score_history_class ON student_score_history(tenant_id,class_subject_id,created_at DESC,id);
CREATE INDEX student_score_history_cell ON student_score_history(tenant_id,assessment_id,student_id,created_at DESC);
CREATE TRIGGER immutable_student_score_history BEFORE UPDATE OR DELETE ON student_score_history
 FOR EACH ROW EXECUTE FUNCTION reject_security_log_change();
CREATE FUNCTION log_student_score_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed student_scores%ROWTYPE;
DECLARE actor uuid;
DECLARE subject uuid;
DECLARE student_label text;
DECLARE assessment_label text;
DECLARE actor_label text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.score IS NOT DISTINCT FROM OLD.score THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
 actor := CASE WHEN TG_OP='DELETE' THEN coalesce(nullif(current_setting('app.grade_actor_id',true),'')::uuid,OLD.updated_by) ELSE NEW.updated_by END;
 SELECT cat.class_subject_id,a.name INTO subject,assessment_label FROM assessments a
 JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id WHERE a.tenant_id=changed.tenant_id AND a.id=changed.assessment_id;
 SELECT name INTO student_label FROM students WHERE tenant_id=changed.tenant_id AND id=changed.student_id;
 SELECT name INTO actor_label FROM users WHERE tenant_id=changed.tenant_id AND id=actor;
 INSERT INTO student_score_history(tenant_id,class_subject_id,assessment_id,student_id,student_name,assessment_name,old_score,new_score,action,actor_id,actor_name)
 VALUES(changed.tenant_id,subject,changed.assessment_id,changed.student_id,student_label,assessment_label,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.score END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.score END,
 CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN TG_OP='DELETE' THEN 'DELETE' ELSE 'UPDATE' END,actor,actor_label);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER student_scores_history AFTER INSERT OR UPDATE OR DELETE ON student_scores
 FOR EACH ROW EXECUTE FUNCTION log_student_score_change();
