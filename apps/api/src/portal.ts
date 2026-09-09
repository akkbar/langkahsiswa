import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { uuid } from "../../../packages/validation/src";
import { AuthGuard, AuthRequest, isAdmin } from "./auth";
import { Database } from "./database";

// Every mobile academic query starts from this ownership check, even when a caller supplies a student UUID.
export const linkedStudentPredicate = `(s.user_id=$2 OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$2))`;
const assignedStudentPredicate = `EXISTS(SELECT 1 FROM class_students cs JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN teachers t ON t.tenant_id=c.tenant_id AND t.user_id=$2 WHERE cs.tenant_id=s.tenant_id AND cs.student_id=s.id AND (c.homeroom_teacher_id=t.id OR EXISTS(SELECT 1 FROM class_subjects x WHERE x.tenant_id=c.tenant_id AND x.class_id=c.id AND x.teacher_id=t.id)))`;
@Controller("api/v1/portal")
@UseGuards(AuthGuard)
export class PortalController {
  constructor(@Inject(Database) private readonly db: Database) {}
  private privileged(req: AuthRequest) {
    return isAdmin(req.actor) || req.actor.roles.includes("PRINCIPAL");
  }
  @Get("students") async students(@Req() req: AuthRequest) {
    const data = (
      await this.db.query(
        `SELECT s.id,s.name,s.nis,s.status FROM students s WHERE s.tenant_id=$1 AND ($3 OR ${linkedStudentPredicate} OR ($4 AND ${assignedStudentPredicate})) ORDER BY s.name`,
        [
          req.actor.tenant_id,
          req.actor.id,
          this.privileged(req),
          req.actor.roles.includes("TEACHER"),
        ],
      )
    ).rows;
    return { data, total: data.length };
  }
  @Get("overview") async overview(
    @Req() req: AuthRequest,
    @Query("student_id") studentId: string,
  ) {
    uuid.parse(studentId);
    const student = (
      await this.db.query(
        `SELECT s.id,s.name,s.nis,${linkedStudentPredicate} AS is_owner FROM students s WHERE s.tenant_id=$1 AND s.id=$5 AND ($3 OR ${linkedStudentPredicate} OR ($4 AND ${assignedStudentPredicate}))`,
        [
          req.actor.tenant_id,
          req.actor.id,
          this.privileged(req),
          req.actor.roles.includes("TEACHER"),
          studentId,
        ],
      )
    ).rows[0];
    if (!student)
      throw new ForbiddenException(
        "Siswa tidak terhubung ke akun atau penugasan Anda",
      );
    const broad = this.privileged(req) || student.is_owner;
    const params = [req.actor.tenant_id, studentId, req.actor.id, broad];
    const classAccess = `($4 OR EXISTS(SELECT 1 FROM teachers t WHERE t.tenant_id=c.tenant_id AND t.user_id=$3 AND (t.id=c.homeroom_teacher_id OR EXISTS(SELECT 1 FROM class_subjects cs2 WHERE cs2.tenant_id=c.tenant_id AND cs2.class_id=c.id AND cs2.teacher_id=t.id))))`;
    const subjectAccess = `($4 OR EXISTS(SELECT 1 FROM teachers t WHERE t.tenant_id=c.tenant_id AND t.user_id=$3 AND (t.id=cs.teacher_id OR t.id=c.homeroom_teacher_id)))`;
    const [attendance, schedule, grades, reports] = await Promise.all([
      this.db.query(
        `SELECT r.id,r.status,r.notes,a.date,c.name AS class_name FROM attendance_records r JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE r.tenant_id=$1 AND r.student_id=$2 AND ${classAccess} ORDER BY a.date DESC LIMIT 200`,
        params,
      ),
      this.db.query(
        `SELECT t.id,t.day_of_week,t.start_time,t.end_time,t.room,s.name AS subject_name,teacher.name AS teacher_name,c.name AS class_name,sem.name AS semester_name FROM timetables t JOIN class_subjects cs ON cs.tenant_id=t.tenant_id AND cs.id=t.class_subject_id JOIN class_students roster ON roster.tenant_id=cs.tenant_id AND roster.class_id=cs.class_id JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN teachers teacher ON teacher.tenant_id=cs.tenant_id AND teacher.id=cs.teacher_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id JOIN academic_years y ON y.tenant_id=c.tenant_id AND y.id=c.academic_year_id WHERE t.tenant_id=$1 AND roster.student_id=$2 AND y.is_active AND (now() AT TIME ZONE 'Asia/Jakarta')::date BETWEEN sem.start_date AND sem.end_date AND ${subjectAccess} ORDER BY t.day_of_week,t.start_time`,
        params,
      ),
      this.db.query(
        `SELECT score.id,score.score,score.updated_at,a.name AS assessment_name,a.max_score,a.due_date,cat.name AS category_name,s.name AS subject_name,c.name AS class_name FROM student_scores score JOIN assessments a ON a.tenant_id=score.tenant_id AND a.id=score.assessment_id JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id JOIN class_subjects cs ON cs.tenant_id=cat.tenant_id AND cs.id=cat.class_subject_id JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id WHERE score.tenant_id=$1 AND score.student_id=$2 AND ${subjectAccess} ORDER BY a.due_date DESC LIMIT 200`,
        params,
      ),
      this.db.query(
        `SELECT r.id,r.status,r.published_at,r.notes,c.name AS class_name,sem.name AS semester_name,COALESCE((SELECT jsonb_agg(jsonb_build_object('subject_name',i.subject_name,'final_grade',i.final_grade)) FROM report_card_items i WHERE i.tenant_id=r.tenant_id AND i.report_card_id=r.id),'[]') AS items FROM report_cards r JOIN classes c ON c.tenant_id=r.tenant_id AND c.id=r.class_id JOIN semesters sem ON sem.tenant_id=r.tenant_id AND sem.id=r.semester_id WHERE r.tenant_id=$1 AND r.student_id=$2 AND r.status='PUBLISHED' AND ($4 OR EXISTS(SELECT 1 FROM teachers t WHERE t.tenant_id=c.tenant_id AND t.id=c.homeroom_teacher_id AND t.user_id=$3)) ORDER BY r.published_at DESC`,
        params,
      ),
    ]);
    const { is_owner, ...profile } = student;
    return {
      student: profile,
      attendance: attendance.rows,
      schedule: schedule.rows,
      grades: grades.rows,
      reports: reports.rows,
    };
  }
  @Get("teaching") async teaching(@Req() req: AuthRequest) {
    if (!req.actor.roles.includes("TEACHER") && !this.privileged(req))
      throw new ForbiddenException("Akses guru diperlukan");
    const data = (
      await this.db.query(
        `SELECT cs.id,cs.class_id,cs.semester_id,c.name AS class_name,s.name AS subject_name,sem.name AS semester_name,
     COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st.id,'name',st.name,'nis',st.nis)) FROM class_students roster JOIN students st ON st.tenant_id=roster.tenant_id AND st.id=roster.student_id WHERE roster.tenant_id=cs.tenant_id AND roster.class_id=cs.class_id),'[]') AS students,
     COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'max_score',a.max_score)) FROM assessments a JOIN assessment_categories cat ON cat.tenant_id=a.tenant_id AND cat.id=a.category_id WHERE cat.tenant_id=cs.tenant_id AND cat.class_subject_id=cs.id),'[]') AS assessments
     FROM class_subjects cs JOIN teachers t ON t.tenant_id=cs.tenant_id AND t.id=cs.teacher_id JOIN classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id JOIN semesters sem ON sem.tenant_id=cs.tenant_id AND sem.id=cs.semester_id WHERE cs.tenant_id=$1 AND ($3 OR t.user_id=$2) ORDER BY c.name,s.name`,
        [req.actor.tenant_id, req.actor.id, this.privileged(req)],
      )
    ).rows;
    return { data, total: data.length };
  }
}
