# LangkahSiswa

Platform operasional sekolah dan pondok pesantren multi-tenant. Satu instalasi
melayani banyak yayasan dan sekolah — setiap tenant terisolasi melalui
`tenant_id` pada shared PostgreSQL schema. Admin, guru, wali, dan siswa
mengakses sistem yang sama dengan role dan permission masing-masing.

**Status:** V1.0 — phase 0–22 & 24 selesai. Phase 23 (integrasi hardware)
ditunda. Lihat [PHASES.md](PHASES.md) untuk rincian per phase.

## Arsitektur

```
                      Internet
                         │
                      Nginx / LB
                         │
          ┌──────────────┼───────────────┐
          │              │               │
   school.sch.id   app.langkahsiswa.id  api.langkahsiswa.id
          │              │               │
    ┌───────────┐  ┌──────────┐   ┌────────────┐
    │  Website  │  │  Admin   │   │  NestJS    │◄── Flutter
    │  Renderer │  │  (React) │   │  API       │    (HTTPS)
    └───────────┘  └──────────┘   └─────┬──────┘
                                        │
                        ┌───────────────┼───────────┐
                        │               │           │
                   PostgreSQL        Redis      MinIO / S3
```

### Stack

| Layer           | Teknologi                            |
| --------------- | ------------------------------------ |
| Backend         | Node.js · TypeScript · NestJS        |
| Admin & POS     | React · TypeScript · Vite            |
| Website publik  | React · TypeScript · Vite            |
| Mobile          | Flutter (Android & iOS)              |
| Database        | PostgreSQL (shared schema, tenant_id)|
| Cache & Queue   | Redis · BullMQ                       |
| File storage    | S3-compatible (MinIO dev, R2/S3 prod)|
| Push            | Firebase Cloud Messaging             |
| Container       | Docker Compose                       |

### Prinsip desain

- **Modular monolith.** Kode backend diorganisasi per domain di `modules/`,
  tetapi berjalan sebagai satu proses. Struktur ini memudahkan pemecahan
  menjadi service terpisah di masa depan tanpa perombakan data model.

- **Tenant isolation via row-level filtering.** Setiap tabel utama memiliki
  kolom `tenant_id`. Backend menyelesaikan tenant dari subdomain, custom domain,
  atau JWT — lalu memfilter seluruh query terhadap tenant tersebut.

- **Ledger-based wallet.** Saldo dompet siswa dihitung dari penjumlahan
  transaksi immutable (topup, purchase, refund). Cached balance ada untuk
  performa, tetapi ledger tetap source of truth.

- **Structured report cards.** Raport disimpan sebagai data terstruktur
  (bukan PDF mentah). PDF dihasilkan saat render — sehingga data bisa
  diquery, di-review bertahap, dan di-approve sebelum dipublikasikan.

- **JSON-based website builder.** Halaman website sekolah disimpan sebagai
  JSON page definition (bukan HTML mentah), lalu di-render oleh component
  registry di sisi client. Sekolah bisa menyusun halaman dengan bebas
  tanpa risiko injeksi kode.

## Peta modul

```
Platform       Tenant, domain, custom domain, branding, settings
Auth           Login password/Google, JWT, role, permission, sesi, audit
Sekolah        Yayasan, sekolah, tahun ajaran, semester, tingkat
Orang          Siswa, orang tua/wali (many-to-many), guru, staf
Akademik       Kelas, pelajaran, kompetensi guru, enrollment, jadwal
Absensi        Sesi, record (5 status), sumber (manual/QR/RFID/NFC/face)
Penilaian      Kategori berbobot, assessment, input nilai
Raport         Kalkulasi, review wali kelas, approval, publikasi, PDF
Keuangan       Jenis biaya, invoice, pembayaran parsial, verifikasi
Dompet         Saldo ledger, topup, purchase, refund, limit belanja
POS            Kantin/koperasi, merchant, produk, stok, checkout
PPDB           Periode, kuota, formulir publik, dokumen, review, enrollment
Event          Kalender, target peserta, notifikasi
Notifikasi     Inbox, push (FCM), outbox persisten, retry
Berkas         Pustaka privat, MinIO/filesystem, metadata, arsip
Website        Builder 11 blok, versi immutable, aset, renderer publik
Pondok         Asrama, kamar, izin, kunjungan, disiplin, tahfidz, laundry
Perpustakaan   Buku, peminjaman, pengembalian, denda, pembayaran wallet
Keamanan       Audit log, login history, sesi perangkat, pencabutan token
```

## Quick start

```powershell
npm install
npm run setup
docker compose up -d postgres redis minio
npm run db:migrate
npm run db:seed
npm run dev
```

| Aplikasi            | URL                                                |
| ------------------- | -------------------------------------------------- |
| Admin               | http://localhost:5173                               |
| Website sekolah     | http://localhost:5174/{kode-sekolah}/{slug}         |
| Health check        | http://localhost:3000/health                        |

**Login demo:** sekolah `demo` · email `admin@demo.langkahsiswa.id` · password `LangkahSiswa!2026`

## Struktur monorepo

```
langkahsiswa/
├── apps/
│   ├── api/          NestJS backend
│   ├── admin/        React admin dashboard
│   ├── website/      React website renderer publik
│   └── mobile/       Flutter app (parent/student/teacher)
├── packages/
│   ├── shared-types/ Type definitions bersama
│   └── validation/   Skema validasi bersama
├── infra/            Nginx, Docker config
├── docs/             Dokumentasi detail per modul
└── docker-compose.yml
```

## Multi-tenant & autentikasi

Satu database, shared schema. Tenant di-resolve dari:
- Subdomain (`smkn1.langkahsiswa.id`)
- Custom domain (`www.smkn1karawang.sch.id` → lookup `tenant_domains`)
- Claim `tenant_id` di JWT

Satu user bisa memiliki beberapa role (misal guru sekaligus wali) dan binding
ke beberapa sekolah di bawah satu yayasan. Perpindahan konteks sekolah
dilakukan via kartu sekolah di sidebar tanpa login ulang.

JWT payload membawa `sub`, `tenant_id`, `roles`, dan `permissions`.
Refresh token dirotasi setiap penggunaan; pencabutan dicatat di `revoked_tokens`.

## Tema & UI

Warna utama **#004aad** dengan latar putih (light) / hitam (dark), aksen biru
muda, dan pastel tipis. Pilihan tema tersimpan di perangkat.
Standar UI lengkap: [UI_STANDARDS.md](UI_STANDARDS.md).

## Dokumentasi

| Dokumen | Isi |
| ------- | --- |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Instalasi, akun demo, API, aturan bisnis, pengujian |
| [docs/START_APP.md](docs/START_APP.md) | Langkah startup dari nol sampai mobile |
| [docs/FINANCE.md](docs/FINANCE.md) | Keuangan, billing, POS |
| [docs/MOBILE_NOTIFICATIONS.md](docs/MOBILE_NOTIFICATIONS.md) | Flutter, Firebase, push notification |
| [docs/GOOGLE_LOGIN.md](docs/GOOGLE_LOGIN.md) | Konfigurasi OAuth Google |
| [docs/ACCOUNT_LEVELS_PPDB.md](docs/ACCOUNT_LEVELS_PPDB.md) | Akun, multi-lokasi, PPDB keluarga |
| [docs/ACCOUNT_REALMS.md](docs/ACCOUNT_REALMS.md) | Realm, binding yayasan/sekolah |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | Role, permission, template CRUD |
| [docs/ADMISSIONS_FILES.md](docs/ADMISSIONS_FILES.md) | PPDB & manajemen berkas |
| [docs/WEBSITE_BUILDER.md](docs/WEBSITE_BUILDER.md) | Website builder & renderer |
| [docs/BOARDING_MODULES.md](docs/BOARDING_MODULES.md) | Modul pondok & Islamic school |
| [docs/OPERATIONS_SECURITY.md](docs/OPERATIONS_SECURITY.md) | Operasional & keamanan |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | Hasil pengujian & verifikasi |
| [docs/PHASE_23_DEFERRED.md](docs/PHASE_23_DEFERRED.md) | Catatan hardware (ditunda) |

## Dependensi eksternal opsional

Google OAuth dan Firebase Cloud Messaging memerlukan konfigurasi proyek sendiri.
Tanpa kredensial tersebut, login password dan notifikasi dalam aplikasi tetap
berjalan — hanya login Google dan push notifikasi ke device yang tidak aktif.

## Lisensi

Proprietary — hak cipta dilindungi.
