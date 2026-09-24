# Teacher Workflow Architecture Audit

**Scope:** architecture audit of the current repository only. No application code or migrations were changed.

## Executive conclusion

The proposed workflow is **partly already implemented**:

- Migration `048_teacher_teaching_plans.sql` created `teaching_plans` and `teaching_plan_items`.
- Migration `049_teacher_workflow.sql` created `teaching_logs`.
- `TeacherModule` exposes plan, log, and timetable-backed dashboard APIs under `/api/v1/teacher`.

The existing implementation reuses the timetable correctly, but its integrity and teacher-ownership controls are incomplete. `attendance_sessions` must remain the daily, class-level attendance container; it is not a safe canonical representation of a subject-period teaching meeting. The least disruptive direction is to strengthen the existing plan/log model and treat `teaching_logs` (renamed only if a future migration deliberately warrants it) as the actual-meeting record.

## 1. Existing architecture relevant to teachers

The API is a NestJS modular monolith using a shared PostgreSQL schema. Tenant-scoped tables conventionally store `tenant_id`; core tables additionally use composite foreign keys of the form `(tenant_id, foreign_id)` to prevent cross-tenant references.

Relevant backend modules:

- `modules/teacher`: existing teaching plans, logs, and teacher dashboard.
- `modules/lesson-planning`: annual curriculum weights and recurring timetable generation/querying.
- `modules/attendance`: daily class attendance session and records.
- `modules/assessment-plans` and `modules/gradebook`: teacher-scoped assessment configuration and score entry.
- `modules/academic-year-setup`: annual setup, class subjects, teacher assignments, calendars, and schedule preparation.
- `modules/academics/academic-policy.ts` and `resource-policy.ts`: class/semester, teacher assignment, report-lock, school consistency, and timetable-conflict policies.
- `modules/auth`: authenticated `Actor`, permission checks, and OPERATIONAL-realm enforcement.

`Actor` tenant context is server-provided through authentication. Services generally filter primary queries with `actor.tenant_id`; client-supplied tenant IDs are not used as authority.

## 2. Existing database entities that can be reused

### Core academic hierarchy

| Entity/table | Important relationships and constraints | Workflow use |
|---|---|---|
| `teachers` | Tenant-scoped teacher profile; unique `(tenant_id, user_id)` and `(tenant_id, nip)` | Resolve the authenticated teacher profile from `actor.id`; do not trust a supplied `teacher_id`. |
| `academic_years` | Tenant and school scoped; unique `(tenant_id, school_id, name)`; one-active-year partial index | Anchor plans and schedules to the relevant school year. |
| `semesters` | Tenant-scoped and belongs to an academic year; unique `(tenant_id, academic_year_id, name)` | Required context for plans, class subjects, attendance, and dashboard date bounds. |
| `classes` | Tenant-scoped, annual class/rombel; belongs to academic year and grade level; unique `(tenant_id, academic_year_id, name)` | Reuse; do not create a second class identifier. |
| `subjects` | Tenant/school scoped; unique `(tenant_id, school_id, code)` | Reuse subject master. |
| `teacher_subjects` | Tenant-scoped teacher-to-subject competency/binding; unique `(tenant_id, teacher_id, subject_id)` | Reuse for assignment validation. |
| `class_subjects` | Tenant-scoped class + subject + teacher + semester; unique `(tenant_id, class_id, subject_id, semester_id)` and composite FK that proves teacher-subject membership | This is the principal instructional assignment. Future teaching plans/logs should validate against it rather than independently accepting class, subject, teacher, and semester IDs. |
| `teacher_assignments` | Annual assignment; unique `(tenant_id, academic_year_id, teacher_id, subject_id, classroom_id)` | Useful annual planning input, but timetable/class-subject remains the direct operational join. |
| `student_enrollments` | Tenant-scoped annual enrollment; unique `(tenant_id, academic_year_id, student_id)` | Reuse for student-based assignment and note authorization. |

### Recurring timetable

` timetables ` holds recurring schedule rows:

- `id`, `tenant_id`, `class_subject_id`, `day_of_week`, `start_time`, `end_time`, `room`.
- It has a time-ordering check and lookup index beginning `(tenant_id, day_of_week, start_time, end_time)`.
- `class_subjects` supplies its class, subject, teacher, and semester.

`resource-policy.ts` rejects overlapping schedules for the same class or teacher where semesters overlap. This is the authoritative recurring schedule; a teacher workflow must not create a separate schedule table.

### Attendance

`attendance_sessions` is a daily, class-level attendance container:

- Columns: `id`, `tenant_id`, `class_id`, `semester_id`, `date`, `created_by`, `created_at`.
- Constraints: tenant-composite FKs to class, semester, and user; unique `(tenant_id, id)` and **unique `(tenant_id, class_id, date)`**.
- Index: `(tenant_id, class_id, date)`.

`attendance_records` stores each student's result:

- Columns: `id`, `tenant_id`, `session_id`, `student_id`, `status`, `source`, `notes`.
- Constraints: tenant-composite FKs to session and student; unique `(tenant_id, session_id, student_id)`.
- Statuses: `PRESENT`, `LATE`, `SICK`, `PERMISSION`, `ABSENT`.
- Sources: `MANUAL`, `RFID`, `QR`, `FACE`, `NFC`, `IMPORT`.

### Assessment and score records

- `assessment_categories`: belongs to `class_subject_id`; unique category name per class subject.
- `assessments`: belongs to a category; unique assessment name per category.
- `student_scores`: belongs to an assessment and student; unique `(tenant_id, assessment_id, student_id)`.
- Score history is append-only via migration `039_score_history.sql`.

These remain the source of truth for formal assessment. Student notes must complement, not duplicate, scores or score history.

### Existing teaching workflow tables

#### `teaching_plans` (migration 048)

Columns: `id`, `tenant_id`, nullable `school_id`, `academic_year_id`, `semester_id`, `teacher_id`, `class_id`, `subject_id`, `title`, `description`, timestamps.

Indexes:

- `(tenant_id, teacher_id)`
- `(tenant_id, class_id, subject_id, semester_id)`

#### `teaching_plan_items` (migration 048)

Columns: `id`, `tenant_id`, `plan_id`, `meeting_number`, `topic`, `learning_objective`, `teacher_notes`, `status`, timestamps.

Index: `(tenant_id, plan_id)`.

#### `teaching_logs` (migration 049)

Columns: `id`, `tenant_id`, nullable `plan_item_id`, nullable `timetable_id`, `teacher_id`, `class_id`, `subject_id`, `semester_id`, `date`, `planned_topic`, `actually_taught`, `completion_status`, `teacher_notes`, `next_meeting_note`, timestamps.

Indexes:

- `(tenant_id, teacher_id, date)`
- `(tenant_id, class_id, subject_id)`

The API limits `completion_status` to `COMPLETED`, `PARTIAL`, and `NOT_COVERED`.

### Integrity gaps in migrations 048/049

The core schema uses stronger tenant-composite relationships than the new workflow tables. Before extending the feature, a dedicated hardening migration should address:

1. `teaching_plans` has no FKs for academic year, semester, teacher, class, or subject; `school_id` uses a non-composite FK.
2. `teaching_plan_items.plan_id` and `teaching_logs.plan_item_id` are not tenant-composite FKs.
3. `teaching_logs.timetable_id`, teacher, class, subject, and semester have no FKs.
4. No uniqueness prevents duplicate plan identities, duplicate `meeting_number` per plan, or duplicate actual logs for the same real meeting.
5. The migration does not constrain plan-item status or teaching-log completion status at database level.

The API must also validate that the academic year, semester, teacher, class, subject, plan item, and optional timetable describe one consistent tenant-local instructional assignment.

## 3. Existing APIs to reuse

### Teaching workflow APIs already present

Controller: `apps/api/src/modules/teacher/teacher.controller.ts`.

- `GET /api/v1/teacher/plans`
- `POST /api/v1/teacher/plans`
- `GET /api/v1/teacher/plans/:id`
- `PATCH /api/v1/teacher/plans/:id`
- `DELETE /api/v1/teacher/plans/:id`
- `GET /api/v1/teacher/logs`
- `POST /api/v1/teacher/logs`
- `GET /api/v1/teacher/dashboard?teacher_id=&date=`

The dashboard joins `timetables → class_subjects → classes/subjects/teachers`, filters by weekday, and finds the most recent `next_meeting_note` for each class/subject. It is a valid starting point, but it currently does not select the planned item/topic and performs an N+1 query for reminders.

### Existing APIs that remain authoritative

- Attendance: `GET /api/v1/attendance?class_id=&date=`, `PUT /api/v1/attendance`.
- Schedule: `GET /api/v1/lesson-planning/schedule?semester_id=`, plus generation endpoints in the same module.
- Assessment plans: `GET /api/v1/assessment-plans`, `GET/PUT /api/v1/assessment-plans/:id`.
- Gradebook: score matrix, cell update, bulk grade, and history endpoints in `/api/v1/grades`.
- Academic-year setup: setup lifecycle and annual operational context endpoints.

## 4. Existing frontend pages/components to reuse

Admin routing is hash-based in `apps/admin/src/main.tsx`.

Existing teacher-operational routes:

- `#attendance` → `AttendancePage`
- `#grades` → `ScoresPage`
- `#assessments` → `AssessmentPlansPage`
- `#timetables` → `TimetablesPage`
- `#academic-year-setup` → `AcademicYearSetupPage`

Current page/API patterns:

- `api()` in `apps/admin/src/api.ts` prefixes `/api/v1/`, passes cookie and bearer authentication, refreshes once after 401, and surfaces API validation as `ApiError`.
- Pages use `useState`/`useEffect`, local `loading`, `busy`, `error`, success messages, cancellation flags, filters, and pagination/search state.
- `AttendancePage` already selects class, semester, and date, loads the existing attendance session, and saves its records.
- `TimetablesPage` consumes `lesson-planning/schedule`, includes table/day/calendar/teacher-load views, and persists its selected mode.
- `AssessmentPlansPage` and `ScoresPage` provide the closest teacher-scoped permission and data-selection model.

UI requirements from `UI_STANDARDS.md` for a future page:

- Where the data structure permits it, provide at least two persisted display modes.
- Keep list/table/filter/search in main content; use the standard right drawer for create/detail/edit.
- Reuse one editor for create, detail, and edit where fields match.
- Use `SortableTable`, in-viewport scrolling, sticky table headers, and server-side pagination/lazy loading as appropriate.
- Follow existing OPERATIONAL realm and permission gating in navigation and actions.

## 5. Existing Flutter teacher functionality

The Flutter app is intentionally not in the implementation scope, but it already contains teacher-related work:

- `apps/mobile/lib/teaching_pages.dart` provides a teacher teaching list and dated teacher entry flow that loads/saves attendance and score-related entries.
- `SchoolApi` in `apps/mobile/lib/api.dart` authenticates with bearer tokens, refreshes once on 401, and defaults to `/api/v1`.
- `RoleLanding` defines teacher tabs but its primary pages are currently placeholders, so it should not be treated as a complete dashboard implementation.

Do not modify Flutter until the backend/web workflow contract is stable. When it is ready, evolve the existing teaching pages to consume the stabilized teacher dashboard and plan/log endpoints rather than creating parallel API shapes.

## 6. Timetable and dashboard analysis

### Representation and conflict handling

A timetable is a recurring weekday/time row tied to a `class_subject`. That relationship supplies the class, subject, teacher, and semester. `resource-policy.ts` protects both class and teacher from overlapping scheduled times for overlapping semesters.

### Dashboard query design

For the authenticated teacher:

1. Resolve `teachers.id` from `teachers.user_id = actor.id` and `tenant_id = actor.tenant_id`.
2. Query timetable rows joined to `class_subjects`, class, subject, and semester.
3. Filter by the requested date's weekday and the semester date interval. Query both the current date and next date for Today/Tomorrow.
4. Restrict results to the resolved teacher unless the actor has an explicit administrative cross-teacher scope.
5. Join the relevant plan and planned item, using a deterministic product rule for selecting the next uncompleted `meeting_number` for that class subject/semester.
6. Join the most recent prior log/reminder in one SQL operation (for example, a `LEFT JOIN LATERAL` or window-function query), not one query per timetable row.
7. Optionally return attendance-session summary/state for the class/date; do not reconstruct attendance.

The current endpoint proves feasibility but accepts arbitrary `teacher_id`, does not constrain active semester/year for the target date, returns one day only, and does not return planned topic.

## 7. Attendance session analysis

Attendance sessions are created or updated by `PUT /api/v1/attendance`.

- An OPERATIONAL actor with `attendance.write` submits `class_id`, `semester_id`, date, and records.
- The service validates class-teaching authority (`teachClass`), class/semester year consistency, semester date range, report-card editability, student enrollment, and duplicate submitted student IDs.
- The repository upserts the daily session by `(tenant_id, class_id, date)` and upserts records by `(tenant_id, session_id, student_id)`.
- Absences can create idempotently keyed notifications.
- Reading requires `attendance.read` but presently is not class-teacher scoped.

It is a daily class roll-call container, not a lesson meeting:

- It has no subject, teacher, timetable, start/end time, actual teaching content, or outcome.
- The unique key allows only one session for a class on a date.
- A class with Mathematics and Bahasa Indonesia on the same day cannot have two subject-period attendance sessions.

## 8. Teaching-session architecture recommendation

### Decision: Option C — retain and harden the current plan/log model

Do **not** make `attendance_sessions` canonical for actual teaching sessions. Do **not** add another recurring scheduling system. Use:

- `class_subjects` + `timetables` for the scheduled teaching opportunity.
- `teaching_plans` + `teaching_plan_items` for intended curriculum sequence.
- `teaching_logs` as the actual teaching-meeting record, then harden it. A later product decision can rename it to `teaching_sessions` only through an explicit migration; naming alone does not solve integrity.
- `attendance_sessions` + `attendance_records` for existing daily attendance.

A future optional `attendance_session_id` on the actual-session/log record can support cross-navigation. It must be nullable until attendance moves to subject-period semantics. It must not imply that the attendance session uniquely identifies a lesson.

### Trade-offs

**Option A: reuse attendance session as actual meeting**

- Benefit: fewer tables.
- Rejected: its class/date uniqueness and missing subject/teacher/timetable fields collapse multiple lessons into one object and mix attendance responsibility with instructional evidence.

**Option B: create a new teaching_sessions table and link attendance**

- Benefit: a clearer first-class actual-session model when multiple lessons per class/day must be recorded and scheduled session lifecycle becomes complex.
- Cost: overlaps substantially with the already-created `teaching_logs`; introducing it now duplicates records and migration risk without a demonstrated need.

**Option C: strengthen `teaching_logs` as actual session**

- Benefit: lowest duplication and preserves existing APIs/migrations.
- Requirement: add relational constraints, canonical instructional-assignment validation, a duplicate policy, ownership enforcement, and possibly a timetable/session linkage.
- Recommended now.

### Relationship diagram

```text
Academic year
  └─ Semester
      └─ ClassSubject (class + subject + assigned teacher)
          ├─ Timetable (recurring weekday/time)
          ├─ TeachingPlan
          │   └─ TeachingPlanItem (planned meeting)
          └─ TeachingLog / actual meeting
              ├─ optional link to Timetable
              ├─ optional link to TeachingPlanItem
              ├─ optional link to existing daily AttendanceSession
              │   └─ AttendanceRecord
              ├─ future Assignment
              │   └─ future StudentAssignment
              └─ future StudentNote (student-scoped; may optionally reference actual meeting)
```

## 9. Proposed future entities and relationships

The first priority is not new entities; it is hardening existing tables and service validation.

After that, proposed concepts are:

- **Assignment**: tenant/school/class-subject/semester scoped; optionally references actual log/session and planned item; has title/instructions, assigned date, due date, lifecycle fields. Do not duplicate assessment definitions.
- **StudentAssignment**: tenant-scoped assignment + enrolled student, submission/review status, timestamps, optional file references. Unique per assignment/student.
- **StudentNote**: tenant/school/student scoped academic follow-up note, author teacher, date, content, visibility/sensitivity rules, and optional class-subject plus actual-log reference. It is not a `student_score` substitute.

Prefer names consistent with existing `teaching_*`, `assessment_*`, and `student_*` naming. Final names should be decided with the data-owner and reporting requirements before migrations.

## 10. Proposed API structure

Retain existing teacher endpoints and evolve them rather than adding duplicate routes.

- `GET /teacher/dashboard?date=` should return authenticated teacher Today and Tomorrow sessions; an administrative explicit teacher filter may be allowed only after scope checks.
- Existing `/teacher/plans` CRUD should be scoped to the actor's teacher assignment; optionally expose plan-item endpoints only if the current aggregate update contract becomes impractical.
- Existing `/teacher/logs` should add read-by-ID and update/correction behavior only when audit/correction policy is decided. Creation must resolve/verify the scheduled instructional assignment.
- Attendance actions remain `/attendance`; the teacher dashboard links into or embeds the existing attendance state/action.
- Future `/teacher/assignments` and `/teacher/student-notes` should be introduced only with explicit authorization and tenant-composite relationships.

Avoid routes that accept an unverified teacher identity as the authority for a regular teacher.

## 11. Permission proposal

Current implementation reuses:

- plans/log reads: `academic.read`
- plan mutations: `academic.write`
- log creation: `attendance.write`
- attendance: `attendance.read` / `attendance.write`

The project convention is CRUD-style `<area>.create/read/update/delete`, with legacy `.write` support during transition. For the workflow, introduce granular permissions only when applying a coordinated permission migration:

- `teaching_plan.create/read/update/delete`
- `teaching_log.create/read/update/delete`
- future `assignment.create/read/update/delete`
- future `student_note.create/read/update/delete`

All must retain OPERATIONAL-realm enforcement. Permission alone is insufficient: non-admin teachers must be scoped to teacher assignments belonging to their authenticated teacher profile; administrators may use explicit tenant-local cross-teacher access.

## 12. Proposed frontend route structure

Keep the existing **Guru** navigation group and avoid separate standalone scheduling.

Suggested routes after approval:

- `#teacher-dashboard` — Today/Tomorrow timetable-driven work queue.
- `#teaching-plans` — list/card modes and shared right-drawer editor.
- `#teaching-logs` — list/history with detail/correction drawer if correction policy permits.
- existing `#attendance`, `#assessments`, `#grades` — linked from the dashboard, not duplicated.
- future `#assignments` and `#student-notes` only after their APIs stabilize.

Use the current API client, local loading/error/busy conventions, permission-gated navigation/actions, and `UI_STANDARDS.md` drawer/table requirements.

## 13. Multi-tenant and school considerations

Future workflow data must follow the core tenant isolation pattern:

1. Include non-null `tenant_id` on tenant data.
2. Use composite `(tenant_id, id)` foreign keys for tenant-local parents, not bare UUID references.
3. Filter every service query and update/delete predicate by actor tenant.
4. Validate school/year/semester/class/subject/teacher consistency server-side through existing academic policies or a focused equivalent.
5. Derive a normal teacher's teacher profile from the actor; never use a submitted `teacher_id` as authorization.
6. Preserve `school_id` where school filtering/reporting is required and ensure it is consistent with the referenced annual class/subject context.
7. Keep attendance and grade/report locks in their existing services rather than copying business rules to a new module.

## 14. Migration risks

- Existing workflow tables contain live schema names but lack many core-style FKs; adding constraints requires a preflight query and remediation policy for orphan/inconsistent rows.
- Adding a uniqueness rule for actual logs requires a product decision: one log per timetable/date, per class-subject/date, or multiple logs for legitimately split meetings.
- A unique plan identity must decide whether title is part of the identity or whether there is exactly one plan per teacher/class-subject/semester.
- Adding status checks can fail if existing free-text statuses differ from approved values.
- Replacing daily attendance semantics with period attendance would be a breaking data-model migration. Do not perform it as incidental work.
- Any new FK/index migration needs production-size and lock impact review.

## 15. Backward-compatibility risks

- The existing teacher API accepts tenant-local arbitrary teacher/class/subject/semester IDs. Enforcing actor ownership will correctly reject requests that may currently work for administrators or improperly scoped teacher clients; plan a role-aware transition.
- Existing clients may depend on `teacher_id` in dashboard queries. Retain it only as an administrator filter or deprecate it after mobile/admin clients use actor-derived identity.
- Changing response shape from one-day `sessions` to Today/Tomorrow should preserve the existing fields or version/add fields first.
- Mobile teaching screens currently use attendance and score-related flows; their behavior must be regression-tested before changing endpoint contracts.

## 16. Recommended implementation order: Phase 25A–25J

| Phase | Scope |
|---|---|
| 25A | Re-audit existing 048/049 data in each environment; decide canonical plan identity and actual-log duplicate rule. |
| 25B | Add tenant-composite FKs, approved status constraints, required indexes, and safe uniqueness constraints after data preflight. |
| 25C | Harden `TeacherService`: actor-to-teacher resolution, assignment/semester/date validation, school consistency, and tenant-safe plan/log ownership. |
| 25D | Improve teacher dashboard SQL: active semester/date filtering, Today/Tomorrow, planned next item, and non-N+1 previous reminder. |
| 25E | Implement/admin-integrate teacher dashboard using existing timetable and attendance actions. |
| 25F | Implement/admin-integrate teaching plan UI using existing drawer/table/card conventions. |
| 25G | Implement/admin-integrate teaching-log UI and define correction/audit policy. |
| 25H | Add granular workflow permissions and migrate role grants/UI visibility in a compatible rollout. |
| 25I | Design and implement assignments only after teacher-session linkage, submission/review, and permission policy are approved. |
| 25J | Design and implement student notes with student privacy/visibility policy; then stabilize the API and update Flutter. |

## Sources inspected

- `apps/api/migrations/001_foundation.sql`
- `apps/api/migrations/030_academic_year_setup.sql`
- `apps/api/migrations/038_subject_schedule.sql`
- `apps/api/migrations/039_score_history.sql`
- `apps/api/migrations/048_teacher_teaching_plans.sql`
- `apps/api/migrations/049_teacher_workflow.sql`
- `apps/api/src/modules/teacher/teacher.controller.ts`
- `apps/api/src/modules/teacher/teacher.service.ts`
- `apps/api/src/modules/attendance/attendance.controller.ts`
- `apps/api/src/modules/attendance/attendance.service.ts`
- `apps/api/src/modules/attendance/attendance.repository.ts`
- `apps/api/src/modules/lesson-planning/*`
- `apps/api/src/modules/academic-year-setup/*`
- `apps/api/src/modules/academics/academic-policy.ts`
- `apps/api/src/modules/academics/resource-policy.ts`
- `apps/api/src/modules/auth/permissions.ts`
- `apps/api/src/modules/assessment-plans/*`
- `apps/api/src/modules/gradebook/*`
- `apps/admin/src/main.tsx`, `api.ts`, and relevant teacher/admin pages
- `apps/mobile/lib/api.dart`, `main.dart`, `teaching_pages.dart`, `screens/role_landing.dart`
- `UI_STANDARDS.md`, `docs/PERMISSIONS.md`
