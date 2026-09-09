# LangkahSiswa

**V1.0 — implementasi phase 0–22 dan 24; phase 23 ditunda.** API NestJS, admin React,
multi-tenant PostgreSQL, autentikasi/role, master sekolah, siswa/wali/guru/staf,
struktur akademik dan jadwal, absensi, gradebook, serta raport dengan review,
persetujuan opsional, publikasi, dan unduhan PDF. Dilengkapi billing manual,
dompet siswa, POS kantin, batas belanja wali, event, notifikasi, Flutter,
integrasi Firebase Cloud Messaging, login Google, PPDB publik, enrollment calon
siswa, pustaka berkas privat berbasis MinIO/filesystem, serta website builder
berbasis blok dengan riwayat versi dan renderer publik terpisah. V1.0 juga
mencakup custom domain, operasional pondok, perpustakaan, serta audit dan sesi
keamanan. Integrasi hardware phase 23 belum diaktifkan.

Tema light/dark memakai warna utama **#004aad**, latar putih/hitam, aksen biru
muda, dan pastel tipis. Pilihan tema tersimpan pada perangkat.

Panduan instalasi, akun demo, API, aturan bisnis, dan pengujian:
**[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)**.
Langkah startup dari instalasi pertama sampai aplikasi mobile:
**[docs/START_APP.md](docs/START_APP.md)**.
Status per phase: **[PHASES.md](PHASES.md)**.

```powershell
npm install
npm run setup
docker compose up -d postgres redis minio
npm run db:migrate
npm run db:seed
npm run dev
```

Buka admin di **http://localhost:5173** dan renderer website sekolah di
**http://localhost:5174/{kode-sekolah}/{slug}**. Login demo: sekolah `demo`, email
`admin@demo.langkahsiswa.id`, password `LangkahSiswa!2026`.
Health: **http://localhost:3000/health**.

Implementasi menggunakan migrasi SQL versioned dan `pg` untuk PostgreSQL.
Panduan modul: [Keuangan/POS](docs/FINANCE.md),
[Flutter dan Firebase](docs/MOBILE_NOTIFICATIONS.md),
[login Google](docs/GOOGLE_LOGIN.md),
[PPDB/manajemen berkas](docs/ADMISSIONS_FILES.md),
[website builder](docs/WEBSITE_BUILDER.md),
[operasional dan keamanan](docs/OPERATIONS_SECURITY.md), serta
[catatan phase 23](docs/PHASE_23_DEFERRED.md).
Google/Firebase memerlukan konfigurasi proyek sendiri; tanpa kredensial,
login password dan notifikasi dalam aplikasi tetap berjalan. Rancangan asli
dipertahankan di bawah sebagai referensi.

---

Saya gabungkan planning awal dengan modul **Student/Santri Wallet**, lalu saya susun arsitektur yang cocok untuk stack kamu: **Backend TypeScript, Frontend React + TypeScript, PostgreSQL, dan Flutter mobile**.

## 1. Scope produk

Platform ini saya sarankan diposisikan sebagai **School & Boarding School Operating Platform** dengan arsitektur multi-tenant.

Core modules:

| Domain         | Modul                                                             |
| -------------- | ----------------------------------------------------------------- |
| Platform       | Multi-tenant, school setup, custom domain, branding               |
| Website        | School website builder, CMS, news, gallery, PPDB page             |
| Admission      | PPDB, document upload, review, acceptance                         |
| Student        | Student master, parent, guardian, alumni                          |
| Academic       | Academic year, semester, class, subject, timetable                |
| Grade          | Assessment, gradebook, report card                                |
| Attendance     | Student attendance, teacher attendance                            |
| Billing        | SPP, uang gedung, kegiatan, invoice, manual verification          |
| Wallet         | Parent top-up, saldo santri, merchant transaction, spending limit |
| Event          | Calendar, school event, exam, payment deadline                    |
| Notification   | Dashboard, mobile push, email/WhatsApp later                      |
| Parent Portal  | Attendance, grade, billing, wallet, event                         |
| Student Portal | Schedule, assignment, grade, wallet balance                       |
| Teacher Portal | Class, attendance, grades, report                                 |
| Boarding       | Dormitory, permission, visitor, discipline                        |
| Supporting     | Library, extracurricular, health, asset/inventory                 |
| Admin          | Role, permission, audit log, settings                             |

Untuk pondok, modul tambahannya:

```text
Boarding School
├── Dormitory
├── Room / Bed Assignment
├── Student Permission
├── Parent Visit
├── Discipline
├── Tahfidz / Memorization
├── Daily Activity
├── Laundry
├── Student Wallet
└── Canteen / Cooperative
```

---

# 2. Arsitektur teknologi

Saya sarankan jangan langsung microservices penuh.

Untuk awal, pakai **modular monolith** tetapi dari struktur project sudah dipisah per domain. Ini lebih cepat dikembangkan, lebih gampang debug, tetapi nanti masih mudah dipecah menjadi service terpisah.

Stack:

```text
Frontend Web
React + TypeScript

Mobile
Flutter

Backend
Node.js + TypeScript
NestJS

Database
PostgreSQL

Cache / Queue
Redis

File Storage
S3-compatible
MinIO untuk development
S3 / Cloudflare R2 untuk production

Realtime
WebSocket / Socket.IO

Push Notification
Firebase Cloud Messaging

Reverse Proxy
Nginx / Traefik

Container
Docker
```

Untuk backend saya lebih memilih **NestJS** daripada Express biasa karena project sebesar ini akan cepat kompleks.

---

# 3. High-level architecture

```text
                         INTERNET
                            │
                            ▼
                     ┌─────────────┐
                     │ Nginx / LB  │
                     └──────┬──────┘
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
          ▼                 ▼                  ▼

 school.sch.id        app.langkahsiswa.id     api.langkahsiswa.id
      │                     │                  │
      ▼                     ▼                  ▼
┌─────────────┐      ┌──────────────┐    ┌───────────────┐
│ Web Builder │      │ React Admin  │    │ NestJS API    │
│ Renderer    │      │ Portal       │    │               │
└─────────────┘      └──────────────┘    └──────┬────────┘
                                                │
                   ┌────────────────────────────┼───────────────┐
                   │                            │               │
                   ▼                            ▼               ▼
             PostgreSQL                     Redis          Object Storage
                                                             S3 / MinIO
```

Flutter juga menggunakan backend yang sama:

```text
Flutter
   │
 HTTPS
   │
   ▼
NestJS API
```

Jadi jangan buat backend mobile terpisah.

---

# 4. Backend architecture

Struktur project kira-kira:

```text
apps/
  api/
    src/
      modules/
        auth/
        tenant/
        school/
        user/
        parent/
        student/
        teacher/

        academic/
        class/
        subject/
        timetable/

        attendance/

        assessment/
        gradebook/
        report-card/

        admission/

        billing/
        payment/

        wallet/
        merchant/
        transaction/

        event/
        notification/

        website/
        cms/

        boarding/
        dormitory/
        permission/
        discipline/

        library/
        extracurricular/

        files/
        audit/

      common/
      database/
      guards/
      decorators/
      interceptors/
```

Setiap modul punya pola:

```text
student/
├── student.controller.ts
├── student.service.ts
├── student.repository.ts
├── student.entity.ts
├── student.dto.ts
├── student.module.ts
└── student.policy.ts
```

---

# 5. Multi-tenant design

Karena setiap sekolah punya data sendiri, setiap record penting harus punya:

```text
tenant_id
```

Contohnya:

```text
students

id
tenant_id
nis
name
class_id
status
```

Jadi:

```text
Tenant A
├── Students
├── Teachers
├── Payments
└── Website

Tenant B
├── Students
├── Teachers
├── Payments
└── Website
```

Backend selalu resolve tenant dari:

```text
subdomain
custom domain
JWT
```

Contoh:

```text
smkn1.langkahsiswa.id
```

atau:

```text
www.smkn1karawang.sch.id
```

keduanya resolve menjadi:

```text
tenant_id = abc123
```

Saya sarankan awalnya:

**1 PostgreSQL database + shared schema + tenant_id**

bukan satu database per sekolah.

Lebih sederhana dioperasikan.

---

# 6. Tenant/domain resolution

Request:

```text
www.smakarya.sch.id
```

masuk ke:

```text
Nginx
   ↓
Domain Resolver
   ↓
tenant_domains
   ↓
tenant_id
```

Tabel:

```text
tenant_domains

id
tenant_id
domain
type
is_primary
verified_at
```

Contoh:

```text
langkahsiswa.id
smakarya.langkahsiswa.id
www.smakarya.sch.id
```

---

# 7. Authentication

Satu sistem identity.

```text
users
roles
permissions
user_roles
role_permissions
```

User bisa punya lebih dari satu role.

Contoh guru sekaligus parent:

```text
user
 ├── teacher
 └── parent
```

JWT:

```text
access_token
refresh_token
```

Payload:

```json
{
  "sub": "user-id",
  "tenant_id": "school-id",
  "roles": ["teacher"],
  "permissions": ["grade.read", "grade.write", "attendance.write"]
}
```

---

# 8. Core school data model

Hierarkinya:

```text
Tenant
  │
School
  │
Academic Year
  │
Semester
  │
Grade Level
  │
Class
  │
Student
```

Contohnya:

```text
2026/2027
   │
Semester 1
   │
Grade 7
   │
Class 7A
```

---

# 9. Student dan parent relation

Jangan buat:

```text
student.parent_id
```

karena satu siswa bisa punya:

- father
- mother
- guardian

dan satu parent bisa punya banyak anak.

Pakai:

```text
students

parents

student_guardians
```

Contoh:

```text
student_guardians

student_id
parent_id
relationship
is_primary
can_pickup
receive_notification
```

---

# 10. Academic model

```text
subjects
teachers
classes

class_subjects
```

Contoh:

```text
Class 7A
    │
    ├── Math → Teacher A
    ├── English → Teacher B
    └── Science → Teacher C
```

---

# 11. Attendance architecture

Core tables:

```text
attendance_sessions
attendance_records
attendance_devices
```

Record:

```text
student_id
date
status

PRESENT
ABSENT
SICK
PERMISSION
LATE
```

Sumber:

```text
MANUAL
QR
RFID
NFC
FACE
IMPORT
```

Ini penting supaya kalau nanti kamu integrasikan device, model datanya tidak perlu dirombak.

---

# 12. Gradebook

Struktur:

```text
assessment_categories
assessments
student_scores
```

Misalnya:

```text
Math

Assignment     20%
Quiz           20%
Mid Term       25%
Final Exam     35%
```

`student_scores`:

```text
student_id
assessment_id
score
```

Final grade dihitung oleh backend.

---

# 13. Report card

Saya sarankan raport jangan disimpan hanya sebagai PDF.

Simpan structured data:

```text
report_cards
report_card_items
```

Kemudian PDF hanya hasil render.

Flow:

```text
Gradebook
    ↓
Final Grade
    ↓
Teacher Review
    ↓
Homeroom Review
    ↓
Publish
    ↓
Parent
```

---

# 14. Billing

Pisahkan tiga konsep:

```text
Fee
Invoice
Payment
```

Fee:

```text
SPP
Building Fee
Uniform
Study Tour
```

Invoice:

```text
Student
SPP September
Rp500,000
```

Payment:

```text
Transfer
Cash
QRIS
```

Untuk sekarang:

```text
Parent upload proof
       ↓
WAITING_VERIFICATION
       ↓
Finance verify
       ↓
PAID
```

---

# 15. Student Wallet architecture

Modul ini jangan digabung ke billing.

Strukturnya:

```text
wallet_accounts
wallet_topups
wallet_transactions
wallet_merchants
wallet_categories
wallet_limits
```

Contoh account:

```text
Student: Ahmad
Balance: Rp250,000
```

---

# 16. Wallet transaction flow

Parent:

```text
Top Up Rp500,000
      ↓
Manual verification
      ↓
Wallet +500,000
```

Santri beli:

```text
Student Card
     ↓
POS Kantin
     ↓
POST /wallet/payment
     ↓
Validate balance
     ↓
Validate spending limit
     ↓
Create transaction
     ↓
Balance decrement
```

Parent mobile langsung melihat:

```text
Kantin
Nasi Ayam
Rp18,000
14:03
```

---

# 17. Wallet ledger

Ini penting.

Jangan hanya simpan:

```text
balance = 200000
```

Gunakan ledger:

```text
wallet_transactions

TOPUP       +500,000
PURCHASE     -18,000
PURCHASE      -5,000
REFUND        +5,000
```

Balance:

```text
SUM(transaction.amount)
```

Bisa ada cached balance untuk performa.

Tapi **ledger tetap source of truth**.

---

# 18. Merchant / Kantin

Merchant:

```text
Kantin Utama
Kantin Asrama
Koperasi
Laundry
Fotocopy
```

Merchant punya POS account.

```text
wallet_merchants

id
tenant_id
name
category
status
```

Setiap transaksi:

```text
student
merchant
item
amount
timestamp
```

---

# 19. Spending control

Parent bisa menentukan:

```text
wallet_limits

student_id
daily_limit
weekly_limit
monthly_limit
```

Bisa juga per kategori:

```text
Food       40k/day
Snack      15k/day
Stationery 100k/month
```

Backend verify sebelum transaksi.

---

# 20. Merchant POS

POS bisa berupa React PWA.

Jadi tidak perlu Flutter dulu.

```text
Browser / Tablet

┌────────────────────┐
│ Canteen POS        │
│                    │
│ Scan RFID          │
│ Ahmad              │
│ Balance Rp230k     │
│                    │
│ Nasi     15k       │
│ Tea       5k       │
│                    │
│ PAY Rp20k          │
└────────────────────┘
```

---

# 21. Website builder architecture

Ini sebaiknya tidak menyimpan HTML mentah.

Simpan sebagai JSON page definition.

Contoh:

```json
{
  "sections": [
    {
      "type": "hero",
      "props": {
        "title": "Welcome to SMA ABC"
      }
    },
    {
      "type": "news"
    },
    {
      "type": "gallery"
    }
  ]
}
```

Database:

```text
website_pages
website_page_versions
website_components
website_assets
website_settings
```

React renderer:

```text
Page JSON
   ↓
Component Registry
   ↓
React
```

Misalnya:

```text
hero      → HeroComponent
gallery   → GalleryComponent
news      → NewsComponent
contact   → ContactComponent
```

Jadi sekolah bebas menyusun halaman tetapi tetap aman.

---

# 22. React frontend

Saya akan membuat monorepo.

Contoh:

```text
school-platform/

apps/
├── api
├── admin-web
├── school-web
├── pos-web
└── mobile

packages/
├── ui
├── types
├── validation
└── config
```

`admin-web`

```text
React + TypeScript
```

dipakai:

```text
Admin
Teacher
Finance
Principal
```

---

# 23. Public website renderer

Pisahkan dari dashboard.

```text
admin.langkahsiswa.id
```

untuk management.

Sedangkan:

```text
www.school.sch.id
```

adalah website publik.

Keduanya tetap React tetapi aplikasi berbeda.

---

# 24. Flutter architecture

Flutter menjadi satu application:

```text
LangkahSiswa
```

Setelah login:

```text
Role Resolver
     ↓

Parent App
Student App
Teacher App
```

Struktur:

```text
lib/
├── core/
│   ├── api/
│   ├── auth/
│   ├── storage/
│   └── notification/
│
├── features/
│   ├── home/
│   ├── attendance/
│   ├── grades/
│   ├── report/
│   ├── wallet/
│   ├── billing/
│   ├── event/
│   └── profile/
```

---

# 25. API design

REST cukup.

Contoh:

```text
/api/v1/auth

/api/v1/students
/api/v1/teachers
/api/v1/classes

/api/v1/attendance

/api/v1/assessments
/api/v1/grades
/api/v1/report-cards

/api/v1/billing
/api/v1/payments

/api/v1/wallet
/api/v1/wallet/transactions

/api/v1/events
/api/v1/notifications

/api/v1/website
```

Tidak perlu GraphQL untuk awal.

---

# 26. Realtime

Realtime dipakai hanya untuk yang memang membutuhkan.

Misalnya:

```text
Payment verification
Wallet transaction
Attendance
Notification
Chat
```

Gunakan:

```text
Socket.IO
```

Contoh:

```text
RFID transaction
     ↓
API
     ↓
Socket.IO
     ↓
Parent dashboard
```

Parent bisa langsung melihat transaksi baru.

---

# 27. Notification service

Buat abstraction:

```text
NotificationService

sendInApp()
sendPush()
sendEmail()
sendWhatsapp()
```

Sekarang mungkin hanya:

```text
In App
Push
```

Nanti tinggal tambah adapter.

---

# 28. Queue

Untuk pekerjaan async:

```text
Redis
+
BullMQ
```

Gunakan untuk:

```text
Send notification
Generate report PDF
Generate invoice
Bulk import students
Send email
Image processing
```

Jangan generate raport 500 siswa langsung di request HTTP.

---

# 29. File storage

Dokumen seperti:

```text
Student photo
KK
Birth certificate
Payment proof
Report PDF
Website image
```

jangan masuk PostgreSQL.

Pakai:

```text
S3-compatible storage
```

Database hanya menyimpan:

```text
file_id
path
mime_type
size
```

---

# 30. PostgreSQL

Saya sarankan PostgreSQL dari awal karena:

- relational data kuat
- JSONB untuk website builder
- transaction kuat untuk wallet
- indexing bagus
- row-level structures cocok untuk multi-tenant

Wallet khususnya sangat butuh database transaction.

Misalnya pembelian:

```sql
BEGIN;

check balance

create transaction

update cached balance

COMMIT;
```

Supaya tidak terjadi double spending.

---

# 31. Schema domain besar

Secara kasar databasenya menjadi:

```text
PLATFORM

tenants
tenant_domains
tenant_settings


AUTH

users
roles
permissions
user_roles
role_permissions


SCHOOL

schools
academic_years
semesters


PEOPLE

students
parents
student_guardians
teachers
staff


ACADEMIC

classes
subjects
class_subjects
timetables


ATTENDANCE

attendance_sessions
attendance_records


GRADE

assessment_categories
assessments
student_scores
report_cards
report_card_items


FINANCE

fees
invoices
invoice_items
payments
payment_verifications


WALLET

wallet_accounts
wallet_transactions
wallet_topups
wallet_merchants
wallet_limits


EVENT

events
event_participants


NOTIFICATION

notifications
notification_deliveries


CMS

website_pages
website_page_versions
website_assets


BOARDING

dormitories
rooms
student_rooms
permissions
discipline_records
visits
```

---

# 32. Deployment architecture

Untuk awal:

```text
                 VPS / Cloud
                     │
                  Nginx
                     │
      ┌──────────────┼───────────────┐
      │              │               │
      ▼              ▼               ▼
 React Admin      React Web      NestJS API

                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          PostgreSQL    Redis     MinIO
```

Semua bisa Docker.

```text
docker compose

postgres
redis
minio
api
admin-web
school-web
pos-web
nginx
```

---

# 33. Nanti ketika mulai besar

Baru pecah service.

Misalnya:

```text
                    API Gateway
                         │
       ┌─────────────────┼────────────────┐
       │                 │                │
       ▼                 ▼                ▼
 Academic Service    Finance Service   Wallet Service

       │                 │                │
       └─────────────────┼────────────────┘
                         │
                    PostgreSQL
```

Wallet mungkin salah satu service pertama yang layak dipisah karena transaction-nya sensitif.

---

# 34. Struktur repository yang saya rekomendasikan

Kalau kamu mau mulai coding, saya justru akan membuat:

```text
langkahsiswa/

apps/
│
├── api/
│   └── NestJS
│
├── admin/
│   └── React TypeScript
│
├── website/
│   └── React TypeScript
│
├── pos/
│   └── React TypeScript
│
└── mobile/
    └── Flutter

packages/
│
├── shared-types/
├── ui/
├── eslint-config/
└── validation/

infra/
│
├── docker/
├── nginx/
└── postgres/

docker-compose.yml
```

Untuk React, saya akan pertimbangkan **Vite + React** untuk dashboard/POS. Untuk public school website, kalau SEO menjadi penting, saya justru akan memakai **Next.js dengan React + TypeScript**, bukan SPA React biasa.

Jadi komposisi akhirnya:

```text
Backend
NestJS + TypeScript

Admin
React + TypeScript + Vite

POS
React + TypeScript + Vite

Public Website
Next.js + TypeScript

Mobile
Flutter

Database
PostgreSQL

Cache / Queue
Redis + BullMQ

Storage
S3 / MinIO

Realtime
Socket.IO

Push
Firebase FCM
```

Dan kalau kita mulai membangunnya, urutan yang paling aman menurut saya adalah **Tenant/Auth → Student/Parent/Teacher → Academic → Attendance → Billing → Wallet → Grade/Report → Event/Notification → Website Builder → Flutter**. Dengan urutan ini, data model fundamental selesai dulu sebelum UI mobile dan builder mulai bergantung ke backend.
