# LangkahSiswa — Teacher Workflow Architecture Audit

We are extending the existing LangkahSiswa academic system with a teacher daily-workflow module.

Repository:
https://github.com/akkbar/langkahsiswa

## Important

DO NOT implement any feature yet.

DO NOT create migrations.

DO NOT modify existing code.

DO NOT refactor existing modules.

This task is architecture analysis only.

The existing system already has working modules for:

* teachers
* classes
* subjects
* teacher competencies / teacher-subject relationships
* class subjects
* student enrollment
* timetables
* attendance
* assessment configuration
* grade input

We want to add teacher-facing daily workflow features while reusing the existing architecture as much as possible.

---

# Features we plan to add

## 1. Teaching Plan

A teacher should be able to plan teaching for a class + subject + semester.

Example:

Mathematics
Class 1A
Semester 1

Meeting 1 — Numbers 1–10
Meeting 2 — Comparing numbers
Meeting 3 — Addition within 10
Meeting 4 — Addition within 20

Each planned meeting may contain:

* meeting number
* topic
* learning objective
* teacher notes
* planned status

Plans must belong to the correct tenant, school, academic year, semester, teacher, class and subject using the existing LangkahSiswa hierarchy.

---

## 2. Teaching Log / Jurnal Mengajar

After teaching, the teacher records what actually happened.

Example:

Planned topic:
Addition within 20

Actually taught:
Addition using ten frames

Completion:

* COMPLETED
* PARTIAL
* NOT_COVERED

Teacher notes:
Several students still struggle with crossing 10.

Next meeting note:
Review crossing 10 for 10 minutes.

The system must preserve the distinction between:

PLANNED teaching

and

ACTUAL teaching.

---

## 3. Teacher Dashboard

Teacher personal dashboard should answer:

"What do I need to do today?"

It should eventually show:

TODAY

08:00–09:00
Mathematics
Class 1A

Planned topic:
Addition within 20

Previous reminder:
Review crossing 10.

[View Plan]
[Start Class]

Also show tomorrow's schedule.

The dashboard should reuse the existing timetable system.

DO NOT design another independent scheduling system.

---

## 4. Attendance Integration

Attendance already exists.

We DO NOT want another attendance implementation.

The future teacher workflow should integrate with the existing attendance_sessions / attendance_records architecture.

Desired future workflow:

Teacher Dashboard
→ Start Class
→ Existing Attendance
→ Teaching
→ End Class
→ Teaching Log
→ Follow-up for next meeting

---

## 5. Assignment

Later we want teachers to create assignments related to a teaching meeting/session.

Example:

Workbook pages 21–23
Assigned: 24 September
Due: 27 September

Students should eventually have submission/review status.

Do NOT implement this yet.

---

## 6. Student Notes

Teachers should eventually be able to attach short academic/follow-up notes to individual students.

Example:

24 Sep
Still struggling with addition across 10.

This should complement, not replace, assessments/student_scores.

Do NOT implement this yet.

---

# Audit tasks

Inspect the actual repository and report the existing implementation relevant to this workflow.

Specifically inspect:

## Backend

Find the actual modules/entities/migrations/services/controllers related to:

* teachers
* schools
* academic years
* semesters
* classes
* subjects
* teacher_subjects or equivalent
* class_subjects or equivalent
* timetables
* attendance_sessions
* attendance_records
* assessments
* student_scores
* authentication
* permissions
* tenant isolation

For each relevant table/entity, report:

* table name
* important columns
* foreign keys
* tenant/school relationships
* existing indexes/constraints
* how it is used by services/controllers

---

## Critical architecture question: Teaching Session

Determine whether the existing `attendance_sessions` entity can safely serve as the canonical representation of an actual teaching/class meeting.

Evaluate:

OPTION A

Extend/reuse attendance_sessions as the class meeting/session entity.

OPTION B

Create a separate teaching_sessions entity and link attendance_sessions to it.

OPTION C

Another architecture that better matches the existing repository.

Do not decide based only on naming.

Inspect the actual implementation, responsibilities and constraints of attendance_sessions.

Explain the tradeoffs.

Recommend the architecture that causes the least duplication while keeping domain responsibilities clear.

---

## Timetable analysis

Inspect the existing timetable implementation.

Determine:

* how recurring schedules are represented
* how teacher is associated with timetable
* how class and subject are associated
* how semester/academic year is represented
* how schedule conflicts are handled

Explain how a future Teacher Dashboard can query:

1. teacher's classes today
2. teacher's classes tomorrow
3. class + subject for each schedule
4. corresponding planned teaching topic

Do not create another timetable implementation.

---

## Attendance analysis

Inspect how attendance sessions are currently created.

Determine:

* who creates them
* when they are created
* whether they correspond to timetable entries
* whether multiple attendance sessions can exist for the same class/date
* whether subject and teacher are stored
* whether attendance sessions already represent a lesson meeting or only an attendance container

This analysis is important before designing teaching logs.

---

## Permissions

Inspect existing permission conventions.

Determine which existing permissions can be reused and which new permissions would likely be required for:

* teaching plan read/write
* teaching log read/write
* assignment read/write
* student notes read/write

Follow existing LangkahSiswa permission naming conventions.

Do not implement permissions yet.

---

## Frontend

Inspect the existing teacher-facing UI.

Find the existing pages/components/routes for:

* Absensi
* Penilaian
* Input Nilai
* teacher schedule, if any

Report:

* route structure
* API client pattern
* state/data-fetching pattern
* component conventions
* loading/error/empty-state conventions

Read and respect UI_STANDARDS.md.

Future teacher pages must visually match the existing application.

---

## Mobile

Inspect the Flutter teacher implementation.

Determine what teacher functionality already exists and which APIs it currently consumes.

Do NOT modify Flutter yet.

We will implement mobile only after the backend/web workflow stabilizes.

---

# Proposed future entities

Evaluate, but DO NOT implement, whether we need concepts similar to:

TeachingPlan

TeachingPlanItem

TeachingLog

Assignment

StudentAssignment

StudentNote

Do not blindly use these names.

Adapt them to the existing LangkahSiswa naming and domain conventions.

Identify which existing entities should be referenced rather than duplicated.

---

# Multi-tenant requirement

This is critical.

Any proposed table must follow the existing LangkahSiswa tenant isolation model.

Inspect how tenant_id and school relationships are currently enforced.

Identify the correct pattern future tables must follow.

Do not introduce a weaker tenant-isolation model.

---

# Required output

Create:

docs/TEACHER_WORKFLOW_ARCHITECTURE.md

The document should contain:

1. Existing architecture relevant to teachers
2. Existing database entities we can reuse
3. Existing API endpoints we can reuse
4. Existing frontend components/pages we can reuse
5. Existing Flutter teacher functionality
6. Timetable architecture analysis
7. Attendance session architecture analysis
8. Teaching-session architecture recommendation
9. Proposed new entities and relationships
10. Proposed API structure
11. Proposed permission additions
12. Proposed frontend route structure
13. Multi-tenant considerations
14. Migration risks
15. Backward-compatibility risks
16. Recommended implementation order for Phase 25A–25J

Include a simple relationship diagram, for example:

Academic Year
↓
Semester
↓
Class Subject
↓
Timetable
↓
Teaching Plan
↓
Planned Meeting
↓
Actual Session
├── Attendance
├── Teaching Log
├── Assignment
└── Student Notes

But modify this diagram according to what the actual repository architecture supports.

---

# Verification

Before completing the task:

* inspect the actual source code, not only README/PHASES documentation
* verify entity/table names from migrations/source
* verify routes from controllers
* verify frontend routes/components from source
* verify tenant isolation from actual implementation
* verify attendance behavior from source
* verify timetable behavior from source

Do not assume documentation is perfectly synchronized with implementation.

---

# Final response

Do not implement anything.

Return:

1. files inspected
2. major findings
3. architectural recommendation
4. unresolved questions
5. path to the generated architecture document

STOP after the architecture report.

Wait for approval before implementing Phase 25A.
