CREATE TABLE dormitories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL, gender text NOT NULL CHECK(gender IN ('MALE','FEMALE','MIXED')),
 description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,name)
);
CREATE TABLE dormitory_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 dormitory_id uuid NOT NULL, name text NOT NULL, floor integer NOT NULL DEFAULT 1 CHECK(floor BETWEEN 0 AND 100),
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 100), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,dormitory_id,name),
 FOREIGN KEY(tenant_id,dormitory_id) REFERENCES dormitories(tenant_id,id)
);
CREATE TABLE dormitory_beds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 room_id uuid NOT NULL, code text NOT NULL, status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','OCCUPIED','MAINTENANCE')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,room_id,code),
 FOREIGN KEY(tenant_id,room_id) REFERENCES dormitory_rooms(tenant_id,id)
);
CREATE TABLE student_room_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 bed_id uuid NOT NULL, start_date date NOT NULL, end_date date, assigned_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(end_date IS NULL OR end_date>=start_date),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,bed_id) REFERENCES dormitory_beds(tenant_id,id),
 FOREIGN KEY(tenant_id,assigned_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX one_active_bed_student ON student_room_assignments(tenant_id,student_id) WHERE end_date IS NULL;
CREATE UNIQUE INDEX one_active_student_bed ON student_room_assignments(tenant_id,bed_id) WHERE end_date IS NULL;
CREATE TABLE leave_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, reason text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED')),
 requested_by uuid NOT NULL, reviewed_by uuid, review_notes text NOT NULL DEFAULT '', returned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), CHECK(start_at<end_at),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE parent_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 parent_id uuid, visitor_name text NOT NULL, visit_at timestamptz NOT NULL, purpose text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED')),
 recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,parent_id) REFERENCES parents(tenant_id,id),
 FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE discipline_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 incident_date date NOT NULL, category text NOT NULL, points integer NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 1000),
 description text NOT NULL, follow_up text NOT NULL DEFAULT '', recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE tahfidz_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 record_date date NOT NULL, surah text NOT NULL, from_verse integer NOT NULL CHECK(from_verse>0),
 to_verse integer NOT NULL CHECK(to_verse>=from_verse), score numeric(5,2) CHECK(score BETWEEN 0 AND 100),
 notes text NOT NULL DEFAULT '', recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id), FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE daily_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), dormitory_id uuid,
 activity_date date NOT NULL, name text NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
 description text NOT NULL DEFAULT '', created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), CHECK(start_time<end_time), FOREIGN KEY(tenant_id,dormitory_id) REFERENCES dormitories(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE laundry_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), student_id uuid NOT NULL,
 bag_code text NOT NULL, weight_kg numeric(8,2) NOT NULL CHECK(weight_kg>0 AND weight_kg<=100),
 amount numeric(12,0) NOT NULL DEFAULT 0 CHECK(amount>=0),
 status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','WASHING','READY','COLLECTED','CANCELLED')),
 wallet_transaction_id uuid, recorded_by uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,bag_code), UNIQUE(tenant_id,wallet_transaction_id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id),
 FOREIGN KEY(tenant_id,wallet_transaction_id) REFERENCES wallet_transactions(tenant_id,id),
 FOREIGN KEY(tenant_id,recorded_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX boarding_assignment_history ON student_room_assignments(tenant_id,student_id,start_date DESC);
CREATE INDEX boarding_leave_status ON leave_permissions(tenant_id,status,start_at);
CREATE INDEX boarding_student_records ON discipline_records(tenant_id,student_id,incident_date DESC);
CREATE INDEX tahfidz_student_records ON tahfidz_records(tenant_id,student_id,record_date DESC);
CREATE INDEX laundry_status ON laundry_orders(tenant_id,status,received_at);

INSERT INTO permissions(id) VALUES ('boarding.read'),('boarding.write'),('boarding.own') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.id='PRINCIPAL' AND p.id IN ('boarding.read','boarding.write'))
 OR (r.id='TEACHER' AND p.id='boarding.read')
 OR (r.id IN ('PARENT','STUDENT') AND p.id='boarding.own') ON CONFLICT DO NOTHING;
