CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenant_domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 domain text NOT NULL UNIQUE CHECK(domain=lower(domain)), is_primary boolean NOT NULL DEFAULT false, verified_at timestamptz
);
CREATE TABLE tenant_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id), principal_approval_required boolean NOT NULL DEFAULT false
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
 email text NOT NULL CHECK(email=lower(email)), password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,email)
);
CREATE TABLE roles (id text PRIMARY KEY);
CREATE TABLE permissions (id text PRIMARY KEY);
CREATE TABLE role_permissions (role_id text REFERENCES roles(id),permission_id text REFERENCES permissions(id),PRIMARY KEY(role_id,permission_id));
CREATE TABLE user_roles (
 tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL, role_id text REFERENCES roles(id),
 PRIMARY KEY(tenant_id,user_id,role_id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE refresh_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
 address text, phone text, principal_name text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE academic_years (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), school_id uuid NOT NULL,
 name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL, is_active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,name), CHECK(start_date<end_date),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id)
);
CREATE UNIQUE INDEX one_active_year ON academic_years(tenant_id,school_id) WHERE is_active;
CREATE TABLE semesters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), academic_year_id uuid NOT NULL,
 name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,academic_year_id,name), CHECK(start_date<end_date),
 FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id)
);
CREATE TABLE grade_levels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), school_id uuid NOT NULL,
 name text NOT NULL, level integer NOT NULL CHECK(level BETWEEN 1 AND 20), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,level), FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id)
);
CREATE TABLE students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
 nis text NOT NULL, name text NOT NULL, email text, phone text, address text, birth_date date, gender text CHECK(gender IN ('MALE','FEMALE')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','GRADUATED')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,nis), UNIQUE(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE parents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
 name text NOT NULL, email text, phone text, address text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE teachers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
 nip text NOT NULL, name text NOT NULL, email text, phone text, address text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,nip), UNIQUE(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
 employee_number text NOT NULL, name text NOT NULL, position text NOT NULL, email text, phone text, address text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,employee_number),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE student_guardians (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,parent_id uuid NOT NULL,
 relationship text NOT NULL CHECK(relationship IN ('FATHER','MOTHER','GUARDIAN')), is_primary boolean NOT NULL DEFAULT false,
 can_pickup boolean NOT NULL DEFAULT true, receive_notification boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_id,parent_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,parent_id) REFERENCES parents(tenant_id,id)
);
CREATE UNIQUE INDEX one_primary_guardian ON student_guardians(tenant_id,student_id) WHERE is_primary;
CREATE TABLE classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), academic_year_id uuid NOT NULL, grade_level_id uuid NOT NULL,
 name text NOT NULL, homeroom_teacher_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,academic_year_id,name),
 FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id), FOREIGN KEY(tenant_id,grade_level_id) REFERENCES grade_levels(tenant_id,id),
 FOREIGN KEY(tenant_id,homeroom_teacher_id) REFERENCES teachers(tenant_id,id)
);
CREATE TABLE subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), school_id uuid NOT NULL,
 name text NOT NULL, code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,school_id,code),
 FOREIGN KEY(tenant_id,school_id) REFERENCES schools(tenant_id,id)
);
CREATE TABLE teacher_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), teacher_id uuid NOT NULL,subject_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,teacher_id,subject_id),
 FOREIGN KEY(tenant_id,teacher_id) REFERENCES teachers(tenant_id,id), FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id)
);
CREATE TABLE class_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), class_id uuid NOT NULL,subject_id uuid NOT NULL,teacher_id uuid NOT NULL,semester_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,class_id,subject_id,semester_id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id), FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id),
 FOREIGN KEY(tenant_id,teacher_id,subject_id) REFERENCES teacher_subjects(tenant_id,teacher_id,subject_id), FOREIGN KEY(tenant_id,semester_id) REFERENCES semesters(tenant_id,id)
);
CREATE TABLE class_students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), class_id uuid NOT NULL,student_id uuid NOT NULL,
 academic_year_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,class_id,student_id), UNIQUE(tenant_id,academic_year_id,student_id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id), FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id)
);
CREATE TABLE timetables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), class_subject_id uuid NOT NULL,
 day_of_week integer NOT NULL CHECK(day_of_week BETWEEN 1 AND 7), start_time time NOT NULL,end_time time NOT NULL,room text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(start_time<end_time), FOREIGN KEY(tenant_id,class_subject_id) REFERENCES class_subjects(tenant_id,id)
);
CREATE TABLE attendance_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),class_id uuid NOT NULL,semester_id uuid NOT NULL,date date NOT NULL,created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,class_id,date),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id), FOREIGN KEY(tenant_id,semester_id) REFERENCES semesters(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE attendance_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),session_id uuid NOT NULL,student_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('PRESENT','LATE','SICK','PERMISSION','ABSENT')),source text NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','RFID','QR','FACE','NFC','IMPORT')),notes text,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,session_id,student_id),FOREIGN KEY(tenant_id,session_id) REFERENCES attendance_sessions(tenant_id,id),FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id)
);
CREATE TABLE assessment_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),class_subject_id uuid NOT NULL,name text NOT NULL,weight numeric(6,3) NOT NULL CHECK(weight>0 AND weight<=100),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),UNIQUE(tenant_id,class_subject_id,name),FOREIGN KEY(tenant_id,class_subject_id) REFERENCES class_subjects(tenant_id,id)
);
CREATE TABLE assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),category_id uuid NOT NULL,name text NOT NULL,max_score numeric(10,3) NOT NULL CHECK(max_score>0),due_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,category_id,name),FOREIGN KEY(tenant_id,category_id) REFERENCES assessment_categories(tenant_id,id)
);
CREATE TABLE student_scores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),assessment_id uuid NOT NULL,student_id uuid NOT NULL,score numeric(10,3) NOT NULL CHECK(score>=0),updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,assessment_id,student_id),
 FOREIGN KEY(tenant_id,assessment_id) REFERENCES assessments(tenant_id,id),FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE report_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),student_id uuid NOT NULL,class_id uuid NOT NULL,semester_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','APPROVED','PUBLISHED')),notes text NOT NULL DEFAULT '', snapshot jsonb NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now(),reviewed_by uuid,approved_by uuid,published_at timestamptz,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,student_id,semester_id),FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,class_id) REFERENCES classes(tenant_id,id),FOREIGN KEY(tenant_id,semester_id) REFERENCES semesters(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id),FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE report_card_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),report_card_id uuid NOT NULL,subject_id uuid NOT NULL,
 subject_name text NOT NULL,final_grade numeric(5,2) NOT NULL CHECK(final_grade BETWEEN 0 AND 100),details jsonb NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,report_card_id,subject_id),FOREIGN KEY(tenant_id,report_card_id) REFERENCES report_cards(tenant_id,id),FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id)
);
CREATE INDEX timetable_lookup ON timetables(tenant_id,day_of_week,start_time,end_time);
CREATE INDEX attendance_date ON attendance_sessions(tenant_id,class_id,date);
CREATE INDEX report_lookup ON report_cards(tenant_id,class_id,semester_id);
