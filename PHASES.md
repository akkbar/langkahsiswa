# Status implementasi — 7 September 2026

Phase 0–9 telah diimplementasikan sebagai **SchoolApp V0.2**.
Panduan menjalankan dan batas implementasi: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

| Phase | Status | Hasil |
| --- | --- | --- |
| 0 | Selesai | Monorepo npm, NestJS, React, Docker PostgreSQL/Redis/MinIO, health nyata |
| 1 | Selesai | Tenant/domain/settings, resolver domain/header/JWT, FK komposit untuk isolasi tenant |
| 2 | Selesai | Login, JWT, rotasi refresh token, role/permission, akun, bootstrap super admin |
| 3 | Selesai | Sekolah, tahun ajaran, semester, tingkat, kelas, pelajaran + validasi hierarki |
| 4 | Selesai | Siswa, orang tua, wali banyak-ke-banyak, guru, staf; list/add/edit/detail |
| 5 | Selesai | Admin React: login, master sekolah dan warga sekolah, kebijakan, akun |
| 6 | Selesai | Kompetensi guru, pelajaran kelas, enrollment, jadwal, deteksi bentrok atomik |
| 7 | Selesai | Sesi/record absensi manual, 5 status, validasi roster dan semester |
| 8 | Selesai | Kategori berbobot, assessment, input nilai, normalisasi dan kelengkapan |
| 9 | Selesai | Kalkulasi raport, review wali kelas, approval opsional, publikasi, PDF, akses wali/siswa |
| 10–24 | Belum dikerjakan | Mengikuti roadmap asli di bawah |

Verifikasi mencakup build TypeScript/React, unit test formula/validasi,
integration test HTTP memakai PostgreSQL terisolasi, pengujian Chromium admin,
dan pemeriksaan visual PDF. Lihat panduan untuk perintah reproduksi.

---

Mulainya jangan dari mobile atau website builder dulu. Untuk project sebesar ini, fondasi data dan tenant harus benar dari awal supaya nanti tidak bongkar besar.

Saya sarankan kita bangun bertahap seperti ini.

## Phase 0 — Project Foundation

Goal: semua project bisa jalan lokal.

Buat monorepo:

```text
schoolapp/
├── apps/
│   ├── api/          # NestJS + TypeScript
│   ├── admin/        # React + TypeScript
│   ├── website/      # Next.js
│   ├── pos/          # React + TypeScript
│   └── mobile/       # Flutter
│
├── packages/
│   ├── shared-types/
│   ├── validation/
│   └── ui/
│
├── infra/
│   ├── docker/
│   └── nginx/
│
└── docker-compose.yml
```

Service lokal pertama:

```text
PostgreSQL
Redis
MinIO
NestJS API
```

Belum perlu semua app jalan.

**Definition of done:**

```text
GET /health

{
  "status": "ok",
  "database": "connected",
  "redis": "connected"
}
```

---

# Phase 1 — Database + Tenant

Ini pondasi terpenting.

Pertama buat:

```text
tenants
tenant_domains
tenant_settings
```

Contoh:

```text
Tenant
---------------
id
name
slug
status
created_at
```

Kemudian konsep request:

```text
demo.schoolapp.id
        ↓
domain resolver
        ↓
tenant_id
```

Untuk development bisa pakai header:

```http
X-Tenant-ID: xxx
```

supaya belum perlu repot DNS.

Setiap tabel bisnis nantinya wajib punya:

```text
tenant_id
```

**Target Phase 1:**

kita bisa membuat:

```http
POST /api/v1/tenants

GET /api/v1/tenants/:id
```

dan request sudah punya tenant context.

---

# Phase 2 — Authentication + Authorization

Setelah tenant baru buat user.

Schema awal:

```text
users
roles
permissions
user_roles
role_permissions
```

Flow:

```text
Login
 ↓
email/password
 ↓
JWT access token
 ↓
refresh token
```

JWT minimal membawa:

```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id"
}
```

Role awal:

```text
SUPER_ADMIN
SCHOOL_ADMIN
PRINCIPAL
TEACHER
FINANCE
PARENT
STUDENT
```

Permission contoh:

```text
student.read
student.create
student.update

attendance.read
attendance.write

grade.read
grade.write

payment.verify
```

**Target Phase 2:**

```http
POST /auth/login
POST /auth/refresh
GET /auth/me
```

dan endpoint sudah bisa diproteksi.

---

# Phase 3 — School Master Data

Sekarang mulai model sekolah.

Buat:

```text
schools
academic_years
semesters
grade_levels
classes
subjects
```

Contoh hierarchy:

```text
School
 ↓
Academic Year 2026/2027
 ↓
Semester 1
 ↓
Grade 7
 ↓
Class 7A
```

Ini akan dipakai hampir semua modul berikutnya.

---

# Phase 4 — People Management

Baru buat:

```text
students
parents
student_guardians
teachers
staff
```

Relasi jangan:

```text
student.parent_id
```

tapi:

```text
student_guardians
```

karena:

```text
1 student → banyak guardian
1 parent → banyak student
```

Endpoint awal:

```http
POST /students
GET /students
GET /students/:id
PATCH /students/:id
```

Kemudian sama untuk teacher dan parent.

---

# Phase 5 — Admin Web Pertama

Baru di sini React mulai serius.

Jangan langsung bikin dashboard cantik.

Buat dulu:

```text
Login

School Setting

Student
├── List
├── Add
├── Edit
└── Detail

Parent

Teacher

Academic Year

Class

Subject
```

Target utama sekarang:

> admin sudah bisa mengelola master sekolah tanpa Postman.

---

# Phase 6 — Academic Structure

Tambahkan relasi:

```text
teacher_subjects
class_subjects
class_students
timetables
```

Contoh:

```text
7A
├── Math → Teacher A
├── English → Teacher B
└── Science → Teacher C
```

Kemudian jadwal:

```text
Monday
07:00 Math
08:30 English
```

Mulai tambahkan conflict detection:

```text
teacher tidak boleh mengajar dua kelas bersamaan
class tidak boleh punya dua subject bersamaan
```

---

# Phase 7 — Attendance

Mulai sederhana dulu.

Schema:

```text
attendance_sessions
attendance_records
```

Flow teacher:

```text
Teacher
 ↓
Class 7A
 ↓
Attendance
 ↓
Mark:
Present
Late
Sick
Permission
Absent
```

Jangan langsung RFID.

Yang penting core attendance bekerja.

Setelah manual stabil baru tambahkan:

```text
source = MANUAL
source = RFID
source = QR
source = FACE
```

---

# Phase 8 — Gradebook

Buat:

```text
assessment_categories
assessments
student_scores
```

Misalnya:

```text
Mathematics

Assignment 20%
Quiz       20%
UTS        25%
UAS        35%
```

Guru bisa membuat assessment:

```text
Quiz 1
Assignment 1
UTS
UAS
```

kemudian input nilai.

---

# Phase 9 — Report Card

Raport jangan dibuat terpisah total.

Datanya berasal dari gradebook:

```text
Assessments
 ↓
Student Scores
 ↓
Final Grade
 ↓
Report Card
```

Tambahkan:

```text
report_cards
report_card_items
```

Flow:

```text
Teacher input nilai
        ↓
Calculate
        ↓
Homeroom review
        ↓
Principal approval optional
        ↓
Publish
```

Baru kemudian generate PDF.

---

# Phase 10 — Billing

Setelah student system matang, masuk finance.

Buat:

```text
fee_types
invoices
invoice_items
payments
payment_proofs
payment_verifications
```

Flow V1:

```text
School generates invoice
        ↓
Parent sees invoice
        ↓
Parent transfers
        ↓
Upload proof
        ↓
Finance verifies
        ↓
PAID
```

Belum perlu payment gateway.

---

# Phase 11 — Student/Santri Wallet

Ini saya pisahkan dari billing.

Mulai dengan:

```text
wallet_accounts
wallet_transactions
wallet_topups
wallet_merchants
```

Transaction type:

```text
TOPUP
PURCHASE
REFUND
ADJUSTMENT
```

Contoh:

```text
Parent topup +500k

Kantin       -20k
Laundry      -15k
Koperasi     -10k
```

Pastikan dari awal wallet menggunakan database transaction.

---

# Phase 12 — Canteen POS

Sekarang buat React POS ringan.

Flow:

```text
Santri datang
 ↓
scan kartu / masukkan student
 ↓
lihat balance
 ↓
pilih barang
 ↓
PAY
 ↓
wallet transaction
```

V1 bahkan belum perlu RFID.

Bisa input:

```text
NIS / Student ID
```

dulu.

Setelah flow stabil baru RFID.

---

# Phase 13 — Wallet Parent Monitoring

Parent dashboard:

```text
Balance
Rp275.000

Today Spending
Rp35.000

Transactions

07 Sep
Kantin        20.000
Koperasi      15.000
```

Kemudian tambahkan:

```text
daily limit
monthly limit
category limit
merchant restriction
```

---

# Phase 14 — Event + Notification

Sekarang central event engine.

Buat:

```text
events
event_targets
notifications
notification_deliveries
```

Event bisa untuk:

```text
Exam
Holiday
School Event
Parent Meeting
Payment Deadline
Report Publication
```

Target:

```text
all school
grade
class
specific student
teacher
parent
```

---

# Phase 15 — Flutter Mobile

Saya baru akan serius membuat mobile di tahap ini.

Karena sekarang API sudah stabil.

Flutter V1:

```text
Login

Home

Attendance

Schedule

Grades

Report Card

Billing

Wallet

Events

Notifications
```

Role-based:

```text
Parent
Student
Teacher
```

---

# Phase 16 — Push Notification

Integrasikan:

```text
Firebase Cloud Messaging
```

Backend menyimpan:

```text
device_tokens
```

Kemudian event seperti:

```text
student absent
payment verified
new grade
wallet purchase
school announcement
```

bisa menghasilkan push notification.

---

# Phase 17 — PPDB

Setelah core student matang, PPDB sebenarnya cukup mudah karena akhirnya akan membuat student.

Flow:

```text
Applicant
 ↓
Form
 ↓
Document
 ↓
Review
 ↓
Test / Interview
 ↓
Accepted
 ↓
Enrollment
 ↓
Student
```

Data applicant jangan langsung masuk `students`.

Buat:

```text
admission_periods
applicants
applications
application_documents
application_reviews
```

---

# Phase 18 — File Management

Sebenarnya infrastructure-nya sudah ada sejak awal menggunakan MinIO, tetapi di tahap ini buat UI management-nya.

Dipakai untuk:

```text
Student photo
KK
Akta lahir
PPDB documents
Payment proof
Website images
Report card PDF
```

---

# Phase 19 — School Website Builder

Saya sengaja taruh cukup belakang.

Karena website builder sebenarnya produk sendiri.

Mulai dengan block sederhana:

```text
Hero
Text
Image
Gallery
News
Announcement
Event
Teacher
Contact
Map
Footer
```

Data:

```text
website_pages
website_page_versions
website_assets
```

Page disimpan JSON:

```json
{
  "blocks": [
    {
      "type": "hero",
      "props": {}
    }
  ]
}
```

React/Next renderer akan membangun halaman dari JSON tersebut.

---

# Phase 20 — Custom Domain

Setelah website renderer berjalan:

```text
schoolabc.schoolapp.id
```

baru custom domain:

```text
www.schoolabc.sch.id
```

Flow admin:

```text
Add domain
 ↓
system gives CNAME
 ↓
school updates DNS
 ↓
verify
 ↓
SSL
 ↓
active
```

---

# Phase 21 — Boarding School

Kemudian masuk fitur pondok khusus:

```text
Dormitory
Room
Bed

Student Room Assignment

Leave Permission

Parent Visit

Discipline

Tahfidz

Daily Activity

Laundry
```

Wallet yang sebelumnya sudah dibangun akan langsung berguna di sini.

---

# Phase 22 — Library

Tambahkan:

```text
books
book_copies
borrowings
returns
penalties
```

Integrasi student card nantinya:

```text
Student Card

Attendance
Wallet
Library
Dormitory
```

---

# Phase 23 — Hardware Integration

Baru sekarang masuk wilayah yang familiar buat kamu.

Contohnya:

```text
RFID Reader
       ↓
MQTT
       ↓
Device Gateway
       ↓
School API
```

Bisa dipakai:

```text
Gate attendance
Dormitory access
Canteen wallet
Library
```

Saya akan bikin service kecil:

```text
device-gateway
```

bukan membuat NestJS utama langsung berbicara dengan setiap RFID reader.

---

# Phase 24 — Audit & Security

Ini sebenarnya dilakukan sedikit demi sedikit, tapi sebelum production harus serius.

Tambahkan:

```text
audit_logs
login_history
user_sessions
```

Audit:

```text
Finance A
verified
Invoice #123
07 Sep 2026 10:31
```

Terutama untuk:

```text
grades
payments
wallet
student data
permissions
```

---

# Roadmap versi produk

Kalau dibagi menjadi release, saya buat jauh lebih sederhana.

### V0.1 — Foundation

```text
Tenant
Auth
Role
Student
Parent
Teacher
Class
Subject
```

Ini target pertama kita.

### V0.2 — Academic

```text
Schedule
Attendance
Gradebook
Report Card
```

### V0.3 — Finance

```text
Billing
Manual Payment
Wallet
Canteen POS
```

### V0.4 — Parent Platform

```text
Events
Notifications
Flutter
```

### V0.5 — Admission

```text
PPDB
Document upload
Enrollment
```

### V0.6 — Website

```text
Website Builder
CMS
Custom Domain
```

### V0.7 — Boarding

```text
Dormitory
Permission
Discipline
Tahfidz
Laundry
```

### V1.0

```text
Production hardening
Audit
Backup
Security
Monitoring
Analytics
```

---

## Kita mulai coding dari mana?

Saya sarankan **jangan mulai dengan membuat seluruh folder tadi sekaligus**.

Step coding pertama kita cukup:

```text
STEP 1

schoolapp/
├── apps/
│   └── api/
│
└── docker-compose.yml
```

Isi awal:

```text
NestJS
+
PostgreSQL
```

Lalu buat endpoint:

```http
GET /health
```

Setelah berhasil:

```text
STEP 2 → Prisma/database
STEP 3 → Tenant
STEP 4 → Auth
STEP 5 → Student
```

Jadi milestone awal kita sangat konkret:

> **Login sebagai School Admin → membuat Student → Student tersimpan di PostgreSQL dan terisolasi berdasarkan tenant.**

Kalau flow kecil itu sudah selesai, fondasi **SchoolApp V0.1** sudah benar. Setelah itu kita bisa lanjut satu step demi satu step seperti project Industrial AI kemarin, termasuk command, struktur folder, Prisma schema, dan code yang perlu dibuat.
