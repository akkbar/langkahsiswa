# SchoolApp V0.2 — Phase 0–9

Implementasi berupa monorepo npm: API NestJS/TypeScript, admin React/Vite,
PostgreSQL, Redis, dan MinIO. Public website, POS, dan Flutter mengikuti phase
lanjutan sehingga belum dibuat. Rancangan lengkap tetap ada di README/PHASES.

## Menjalankan secara lokal

Prasyarat: Node.js 22+, npm, Docker Desktop/Engine yang aktif.

```powershell
npm install
npm run setup
docker compose up -d postgres redis minio
npm run db:migrate
npm run db:seed
npm run dev
```

- Admin: http://localhost:5173
- API health: http://localhost:3000/health
- MinIO console: http://localhost:9001 (akun dev di `.env`)
- Login demo: kode sekolah **demo**, email **admin@demo.schoolapp.id**,
  kata sandi **SchoolApp!2026**. Seed membaca `SEED_ADMIN_EMAIL/PASSWORD`.

Seed idempoten: membuat sekolah, tahun ajaran 2026/2027, semester 1,
kelas 7A, guru, tiga siswa, wali, jadwal, serta empat kategori Matematika
(20/20/25/35%). Nilai belum diisi. Menjalankan seed lagi tidak mengganti data.

Semua aplikasi juga dapat dijalankan dalam Docker:

```powershell
npm run setup
docker compose up -d --build
docker compose exec api npm run db:seed
```

Jangan jalankan `npm run dev` bersamaan dengan container api/admin karena
menggunakan port yang sama. Untuk berpindah ke development:
`docker compose stop api admin`, lalu `npm run dev`.

`npm run setup` tidak menimpa `.env` yang sudah ada. Bila port PostgreSQL
dipakai aplikasi lain, sesuaikan port compose dan `DATABASE_URL` lokal.
Secret JWT dibuat acak oleh setup. Kredensial contoh khusus development.

## Alur penggunaan admin

1. **Pengaturan Sekolah → Tahun Ajaran → Semester → Tingkat Kelas**.
2. Buat **Guru, Orang Tua, Siswa, Staf**. **Wali Siswa** menghubungkan banyak
   siswa dengan banyak orang tua; wali utama dibatasi satu per siswa.
3. Buat **Kelas** dengan wali kelas dan **Mata Pelajaran**.
4. **Kompetensi Guru** menghubungkan guru dengan pelajaran. **Pelajaran Kelas**
   menghubungkan kelas, pelajaran, guru, dan semester. **Anggota Kelas**
   menempatkan siswa dalam satu kelas per tahun ajaran.
5. Atur **Jadwal Pelajaran**. Hari 1=Senin hingga 7=Minggu. Jam yang bersebelahan
   diperbolehkan; kelas/guru dengan jam beririsan ditolak, termasuk request bersamaan.
6. **Absensi**: pilih kelas, semester, tanggal; isi Hadir/Terlambat/Sakit/Izin/Alpa.
   Status awal pada layar adalah Hadir, dan tersimpan hanya setelah tombol Simpan.
7. **Bobot Penilaian → Penilaian → Input Nilai**. Jumlah bobot tiap pelajaran
   harus 100% sebelum raport dihitung. Kolom nilai kosong bukan nilai nol.
8. **Raport Siswa**: pilih kelas, semester, siswa → Hitung → Review →
   persetujuan kepala sekolah bila diwajibkan → Publikasikan → Unduh PDF.
9. **Akun Pengguna** untuk akun guru/principal/parent/student. Hubungkan akun
   melalui field Akun pengguna di master Guru/Orang Tua/Siswa. Orang tua dan
   siswa hanya melihat raport terbit yang terhubung ke akun mereka.

Relasi tahun ajaran/kelas/pelajaran yang sudah dibuat tidak dapat dipindahkan
dengan PATCH. Koreksi nama, kontak, wali kelas, jam jadwal, dan nilai tetap
tersedia sesuai aturan. Penghapusan data/histori dan migrasi siswa antar kelas
belum menjadi alur V0.2.

## Perhitungan dan siklus raport

Untuk setiap assessment: `nilai / nilai maksimum × 100`. Dalam satu kategori,
nilai assessment yang telah dinormalisasi dirata-ratakan secara setara.
Nilai akhir pelajaran = jumlah `(rata-rata kategori × bobot / 100)`, dibulatkan
dua desimal pada hasil akhir. Contoh: tugas 80 dan 100 berbobot 20%, ujian 70
berbobot 80% menghasilkan `90 × 20% + 70 × 80% = 74`.

Tidak ada kebijakan otomatis menganggap nilai hilang sebagai nol. Semua
kategori harus memiliki assessment dan setiap assessment siswa harus dinilai.

- `DRAFT`: dapat dihitung ulang. Perubahan gradebook/absensi menghapus draft
  terkait di kelas/semester tersebut agar snapshot lama tidak ikut direview.
- `REVIEWED`: wali kelas sudah memeriksa. Penilaian/absensi kelas-semester
  dikunci. School admin dapat mengoperasikan workflow sebagai administrator.
- `APPROVED`: kepala sekolah/admin menyetujui.
- `PUBLISHED`: snapshot tetap, tidak dapat dibuka kembali. Parent/student yang
  terhubung dapat membaca dan mengunduh PDF.
- Review/approval dapat dibuka kembali ke draft sebelum publikasi. Bila perlu
  mengubah nilai, buka seluruh raport yang sudah direview dalam kelas/semester.

PDF dibuat satu siswa per request dari snapshot terstruktur, bukan menjadi
sumber data nilai. Penyimpanan PDF ke MinIO dan antrean cetak massal belum
diaktifkan; infrastruktur MinIO sudah disediakan.

## Tenant dan otorisasi

Semua tabel bisnis menggunakan `tenant_id`. Foreign key komposit
`(tenant_id, foreign_id)` mencegah relasi lintas tenant. Query bisnis selalu
menggunakan tenant actor, bukan tenant yang dikirim di body. Role/permission
adalah template global; user-role ditautkan per tenant.

- JWT menyertakan `sub` dan `tenant_id`, berlaku 15 menit. Actor/role/status
  tenant dibaca lagi dari database di setiap request.
- Refresh token acak berlaku 7 hari, hanya hash SHA-256 disimpan di database.
  Rotasi memakai row lock sehingga token lama tidak dapat digunakan ulang.
- Admin menyimpan access token di memori dan refresh cookie HttpOnly,
  SameSite=Strict; refresh token juga tersedia di response untuk klien API.
- Login memerlukan domain terdaftar, `tenant_slug`, atau `X-Tenant-ID`.
  Header hanya aktif di non-production dengan `ALLOW_TENANT_HEADER=true`.
  Domain/header/slug/token yang saling bertentangan ditolak.
- Domain hanya digunakan jika `tenant_domains.verified_at` terisi. Provisioning
  DNS dan verifikasi custom domain mengikuti phase 20. Untuk uji lokal operator
  dapat mendaftarkan domain di database; endpoint publik tidak mengklaim domain.
- Guru hanya dapat mengubah absensi kelas yang diajar dan nilai pelajaran yang
  diampu. Kalkulasi/review raport dilakukan wali kelas atau admin.
- Parent/student tidak memiliki akses daftar master sekolah/siswa/nilai mentah.
- Login dibatasi 30 percobaan/IP/menit dalam satu proses. Distributed rate limit,
  audit, reset password, MFA, dan hardening produksi termasuk pekerjaan lanjutan.

Bootstrap super admin (sekali untuk slug baru) sebelum membuat tenant lain:

```powershell
$env:PLATFORM_ADMIN_EMAIL = 'platform@example.test'
$env:PLATFORM_ADMIN_PASSWORD = 'isi-password-kuat-minimal-12-karakter'
npm run platform:admin
```

Login memakai kode sekolah `platform`; kemudian `POST /api/v1/tenants`.
School admin tidak dapat membuat tenant. Script bootstrap tidak mengubah
akun yang sudah ada; slug/email duplikat akan ditolak.

## API

Prefix seluruh endpoint bisnis: `/api/v1`. Health berada di `/health`.

| Endpoint | Operasi |
| --- | --- |
| `/auth/login`, `/auth/refresh`, `/auth/logout` | POST |
| `/auth/me` | GET |
| `/tenants` | POST, SUPER_ADMIN |
| `/tenants/:id` | GET, tenant sendiri atau SUPER_ADMIN |
| `/tenants/:id/settings` | PATCH `{principal_approval_required}` |
| `/users` | GET daftar ringkas, POST akun dan role |
| `/schools`, `/academic-years`, `/semesters`, `/grade-levels`, `/classes`, `/subjects` | GET list/detail, POST, PATCH |
| `/students`, `/parents`, `/teachers`, `/staff`, `/student-guardians` | GET list/detail, POST, PATCH |
| `/teacher-subjects`, `/class-subjects`, `/class-students`, `/timetables` | GET list/detail, POST, PATCH |
| `/assessment-categories`, `/assessments` | GET list/detail, POST, PATCH |
| `/attendance?class_id=...&date=YYYY-MM-DD` | GET sesi dan records |
| `/attendance` | PUT `{class_id,semester_id,date,records:[{student_id,status,notes?}]}` |
| `/grades?assessment_id=...` | GET nilai tersimpan |
| `/grades` | PUT `{assessment_id,scores:[{student_id,score}]}` |
| `/report-cards?class_id=...&semester_id=...` | GET raport sesuai akses |
| `/report-cards/calculate` | POST `{class_id,semester_id,student_id}` |
| `/report-cards/:id` | GET snapshot dan item |
| `/report-cards/:id/review`, `/approve`, `/publish`, `/reopen` | POST `{notes?}` |
| `/report-cards/:id/pdf` | GET PDF dengan bearer token |

Resource list mendukung `page`, `limit` (maksimum 200), `search` pada nama,
dan filter ID relasi seperti `class_id`, `semester_id`, `category_id`.
Response `{data,total,page,limit}`. Semua create/PATCH menolak properti tak dikenal.
Body lengkap master didefinisikan di `packages/validation/src/index.ts`.

Contoh login PowerShell:

```powershell
$session = Invoke-RestMethod http://localhost:3000/api/v1/auth/login `
  -Method Post -ContentType application/json `
  -Body '{"tenant_slug":"demo","email":"admin@demo.schoolapp.id","password":"SchoolApp!2026"}'
$headers = @{ Authorization = "Bearer $($session.access_token)" }
Invoke-RestMethod http://localhost:3000/api/v1/students -Headers $headers
```

## Verifikasi

```powershell
npm run typecheck
npm run build
npm test
npm run test:integration
npx playwright install chromium
npm run test:ui
```

Integration test membutuhkan database di `.env`. Test membuat schema sementara
dengan nama acak, menjalankan migrasi di schema tersebut, dan menghapus hanya
schema itu saat selesai. Database sekolah lain tidak direset. Redis aktif membuat
health mengembalikan 200; tanpa Redis health yang terdegradasi tetap diuji.

UI test membutuhkan API/admin berjalan, seed demo default, dan Chromium.
Test melakukan CRUD siswa uji, edit jadwal demo, isi absensi/nilai demo, menghitung
dan mereview raport, mengunduh PDF, membuka kembali draft, serta memeriksa
navigasi, refresh sesi, logout, dan tampilan mobile. Jalankan terhadap
database development. Screenshot dan trace berada di `test-results/` (gitignored).

Migrasi SQL bernomor dijalankan dalam transaksi dengan advisory lock dan dicatat
di `schema_migrations`. Query menggunakan parameter pg; transaksi mutasi per
tenant memakai transaction advisory lock. Ini mengutamakan konsistensi pada
V0.2; fine-grained locking dapat ditambahkan bila beban meningkat.

Hasil verifikasi implementasi (7 September 2026): build API/admin dan typecheck
lulus; 5 unit test, 19 integration test, dan 1 skenario UI Chromium lulus.
Container API/admin/PostgreSQL/Redis/MinIO berjalan; `/health` mengembalikan
`status: ok`, `database: connected`, `redis: connected`. PDF hasil integration
test telah dirender dan diperiksa secara visual.

Referensi implementasi: [NestJS controllers](https://docs.nestjs.com/controllers),
[PostgreSQL locking](https://www.postgresql.org/docs/14/explicit-locking.html),
[React TypeScript](https://react.dev/learn/typescript),
[Vite](https://vite.dev/guide/).
