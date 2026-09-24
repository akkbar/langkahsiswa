# PHASE 1 — Foundation & PPDB Setup

Implement **PPDB / Penerimaan Peserta Didik Baru** pada existing project.

Sebelum coding:

1. Baca `/UI_STANDARDS.md`.
2. Inspect module existing yang paling mirip.
3. Pelajari:

   * navigation/menu
   * routing
   * RBAC/permission
   * CRUD
   * DataTable
   * form validation
   * API
   * database/migration
   * file upload jika tersedia
4. Reuse existing architecture. Jangan membuat architecture baru.

## Target

Buat foundation PPDB:

```text
PPDB
├── Dashboard
├── Gelombang
├── Pendaftaran
├── Verifikasi
├── Seleksi
├── Daftar Ulang
├── Pembayaran
├── Laporan
└── Pengaturan
```

Sesuaikan struktur dengan pola menu existing.

## Core concept

PPDB harus memiliki:

```text
Academic Year
Admission Wave
Applicant
Application
Registration Status
```

Jangan membuat master siswa baru jika setelah diterima peserta akan masuk ke existing Student/User system.

Applicant yang belum diterima harus tetap dapat dikelola sebagai data PPDB.

## Foundation

Implement:

* menu
* routes
* permission mengikuti existing RBAC
* database foundation/migration jika diperlukan
* basic PPDB layout

Jangan implementasikan seluruh proses PPDB dalam phase ini.

Jangan membuat Member/User architecture baru.

Jangan melakukan refactor unrelated.

Run lint/typecheck/test/build yang tersedia.

Di akhir berikan summary:

* files changed
* routes
* permissions
* database changes
* verification result

Jangan mengerjakan phase berikutnya.

````

---

# PHASE 2 — Gelombang + Pendaftaran

Implement **Gelombang PPDB dan proses Pendaftaran**.

Sebelum coding, inspect hasil Phase 1 dan existing project. Tetap gunakan `/UI_STANDARDS.md`.

## Gelombang

CRUD:

```text
Nama Gelombang
Tahun Ajaran
Tanggal Mulai
Tanggal Selesai
Status
Kuota
Deskripsi
````

Status minimal:

```text
Draft
Open
Closed
```

Validasi tanggal dan status.

## Pendaftaran

Buat proses pendaftaran calon peserta didik.

Data minimal:

```text
Nomor Pendaftaran
Gelombang
Tanggal Daftar

Nama Lengkap
NIK
NISN jika ada
Tempat Lahir
Tanggal Lahir
Jenis Kelamin
Alamat
Nomor HP
Email

Asal Sekolah
Nama Orang Tua/Wali
Nomor HP Orang Tua/Wali

Program/Jurusan/Pilihan
```

Sesuaikan dengan data yang sudah tersedia di project.

## Dokumen

Jika existing project sudah memiliki file upload:

support dokumen seperti:

```text
KK
Akta Kelahiran
Ijazah/SKL
KTP Orang Tua
Dokumen lain
```

Jangan membuat file storage architecture baru.

## Status pendaftaran

Minimal:

```text
Draft
Submitted
Under Review
Verified
Rejected
Accepted
Registered
```

Gunakan existing enum/status convention jika ada.

## UI

Implement:

* list
* search
* filter
* create
* detail
* edit
* submit
* status

Gunakan existing DataTable/form/modal/drawer.

Permission harus mengikuti existing RBAC.

Jangan implementasikan proses seleksi dan daftar ulang dulu.

Run lint/typecheck/test/build.

Jangan mengerjakan Phase 3.

````

---

# PHASE 3 — Verifikasi + Seleksi

Implement **Verifikasi dan Seleksi PPDB**.

Gunakan hasil Phase 1–2 dan existing architecture.

## Verifikasi

Petugas dapat memeriksa pendaftaran.

Tampilkan:

```text
Data Calon Siswa
Dokumen
Pilihan Program
Data Orang Tua
Status Pendaftaran
````

Action:

```text
Verify
Reject
Request Revision
```

Jika reject/revision, simpan:

```text
Reason
Verified By
Verified At
```

Jangan hanya mengubah status tanpa history jika existing application memiliki audit/history pattern.

## Seleksi

Implement proses seleksi berdasarkan rule yang dapat dikonfigurasi.

Minimal data:

```text
Applicant
Selection Score
Ranking
Selection Status
Notes
```

Support:

```text
Selected
Not Selected
Waiting List
```

Jangan membuat ranking secara hard-coded berdasarkan asumsi tertentu.

Jika project membutuhkan beberapa jalur seleksi, buat architecture yang dapat menangani:

```text
Jalur/Program
Kuota
Criteria
```

## Important

Jangan membuat keputusan seleksi berdasarkan data yang tidak ada.

Gunakan existing database transaction jika proses seleksi mengubah banyak record.

Permission:

```text
View Verification
Verify
Reject
Run Selection
Publish Result
```

sesuaikan dengan existing RBAC naming.

Run lint/typecheck/test/build.

Jangan mengerjakan Phase 4.

````

---

# PHASE 4 — Pembayaran + Daftar Ulang

Implement **Pembayaran dan Daftar Ulang PPDB**.

Sebelum coding, cari apakah project sudah memiliki payment/transaction module. Reuse jika tersedia.

## Pembayaran

Data:

```text
Applicant
Registration
Invoice/Payment Number
Amount
Payment Date
Payment Method
Status
Proof
````

Status:

```text
Pending
Paid
Cancelled
Expired
```

Jika sudah ada payment architecture, jangan membuat payment system kedua.

## Daftar Ulang

Flow:

```text
Accepted
→ Registration
→ Payment
→ Re-registration
→ Become Student
```

Data daftar ulang:

```text
Registration Date
Final Program/Class
Parent Confirmation
Documents
Notes
Status
```

Status:

```text
Pending
Completed
Cancelled
```

## Integrasi Student

Jika applicant berhasil daftar ulang:

* gunakan existing Student/User architecture
* jangan membuat tabel siswa duplicate
* jika existing project memiliki service untuk membuat student/user, gunakan service tersebut

Pastikan proses idempotent sehingga klik daftar ulang dua kali tidak membuat dua student.

## Important

Gunakan DB transaction untuk proses yang mengubah beberapa entity.

Validasi:

```text
Applicant must be accepted
Required documents complete
Required payment completed
```

sesuai rule yang tersedia.

Run lint/typecheck/test/build.

Jangan mengerjakan Phase 5.

````

---

# PHASE 5 — Dashboard + Laporan

Implement **Dashboard dan Laporan PPDB**.

Gunakan UI/reporting pattern existing.

## Dashboard

KPI:

```text
Total Pendaftar
Draft
Submitted
Under Review
Verified
Rejected
Accepted
Waiting List
Registered
````

Tambahkan:

```text
Total Kuota
Kuota Terisi
Kuota Tersisa
```

Statistik:

```text
Pendaftar per Gelombang
Pendaftar per Program/Jurusan
Pendaftar per Status
Pendaftar per Periode
```

Gunakan data real dari database.

Jangan hard-code angka.

## Laporan

Implement minimal:

```text
Laporan Pendaftar
Laporan Verifikasi
Laporan Seleksi
Laporan Diterima
Laporan Daftar Ulang
Laporan Pembayaran
```

Support filter:

```text
Tahun Ajaran
Gelombang
Tanggal
Program/Jurusan
Status
```

Gunakan existing:

* DataTable
* filter
* pagination
* export

Jika project sudah memiliki export mechanism, reuse.

Jangan membuat reporting framework baru.

Permission laporan mengikuti existing RBAC.

Run lint/typecheck/test/build.

Jangan mengerjakan Phase 6.

````

---

# PHASE 6 — Pengaturan + Final QA

Implement **Pengaturan PPDB** dan lakukan final QA.

## Pengaturan

Buat konfigurasi sesuai kebutuhan existing project:

```text
Tahun Ajaran
Gelombang Default
Nomor Pendaftaran
Program/Jurusan
Kuota
Biaya Pendaftaran
Biaya Daftar Ulang
Dokumen Wajib
Status/Workflow
````

Jangan duplicate master yang sudah ada.

Jika Program/Jurusan sudah tersedia di master akademik, gunakan existing entity.

## Permission Audit

Periksa semua permission PPDB:

```text
View
Create
Update
Delete
Verify
Reject
Selection
Publish
Payment
Re-registration
Report
Settings
```

Pastikan authorization tidak hanya dilakukan di frontend.

Backend/API juga harus melakukan authorization.

## Workflow Audit

Test end-to-end:

```text
Create Wave
→ Open Wave
→ Create Applicant
→ Submit
→ Verify
→ Selection
→ Accepted
→ Payment
→ Re-registration
→ Create/Link Student
```

Test juga:

```text
Rejected
Waiting List
Revision
Payment Failed
Duplicate Registration
Duplicate Re-registration
Expired Wave
```

## Data Integrity

Periksa relasi:

```text
Academic Year
↓
Admission Wave
↓
Applicant
↓
Application
↓
Verification
↓
Selection
↓
Payment
↓
Re-registration
↓
Student/User
```

Pastikan tidak membuat duplicate Student/User.

## Final UI QA

Bandingkan semua halaman dengan:

```text
/UI_STANDARDS.md
```

Periksa:

* responsive
* loading
* empty state
* error state
* validation
* permission
* confirmation
* toast
* pagination
* search/filter

## Verification

Run:

```text
lint
typecheck
unit test
integration test
build
```

sesuai script yang tersedia.

Perbaiki error yang disebabkan oleh PPDB.

Jangan melakukan unrelated refactor.

Berikan final report:

```text
Features implemented
Files changed
Routes
Permissions
Database changes
API changes
Tests
Build result
Known issues
```

Jangan mengklaim test/build berhasil jika sebenarnya gagal.

```


Dengan pola ini, **PPDB cukup 6 kali prompt**. Menurut saya ini lebih cocok untuk Hermes daripada memecah sampai setiap CRUD menjadi task sendiri.

Pola umumnya juga bisa kita pakai untuk modul besar lain: **Foundation → Core Transaction → Process → Financial/Integration → Report → QA**, jadi nanti misalnya **Keuangan, Akademik, Inventaris, HR, atau CMS** tidak perlu dibuat puluhan prompt.
```
