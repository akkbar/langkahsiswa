# Menjalankan LangkahSiswa untuk Development

Panduan ini ditujukan untuk Windows PowerShell dan dijalankan dari root
repository.

## Prasyarat

- Node.js 22 atau lebih baru
- npm
- Docker Desktop dengan Docker Engine aktif

Periksa instalasi:

```powershell
node --version
npm --version
docker compose version
```

## Setup pertama kali

```powershell
cd D:\OpenAIoT\AI\school
npm install
npm run setup
docker compose up -d postgres redis minio
docker compose ps
npm run db:migrate
npm run db:seed
npm run dev
```

Tunggu sampai `postgres`, `redis`, dan `minio` berstatus `healthy` sebelum
menjalankan migrasi. Perintah `npm run setup` membuat `.env` dari
`.env.example` jika file tersebut belum ada.

`npm run dev` menjalankan tiga aplikasi sekaligus:

| Aplikasi | URL |
| --- | --- |
| Admin | http://localhost:5173 |
| API | http://localhost:3000 |
| Website publik | http://localhost:5174 |
| MinIO Console | http://localhost:9001 |

## Login demo

Buka http://localhost:5173 dan masukkan:

```text
Kode yayasan : demo
Email         : admin@demo.langkahsiswa.id
Kata sandi    : LangkahSiswa!2026
```

LangkahSiswa menggunakan satu halaman login untuk semua role. Admin, guru,
siswa, wali, dan pengelola kantin tidak perlu memilih jenis akun sebelum masuk.

Jika nilai `SEED_ADMIN_EMAIL` atau `SEED_ADMIN_PASSWORD` telah diubah di `.env`,
gunakan nilai tersebut.

## Startup harian

Setelah setup pertama selesai:

```powershell
cd D:\OpenAIoT\AI\school
docker compose up -d postgres redis minio
npm run db:migrate
npm run dev
```

Migrasi aman dijalankan kembali karena hanya file migrasi yang belum tercatat
yang akan diterapkan.

## Pemeriksaan cepat

Buka terminal PowerShell lain:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Pemeriksaan source code:

```powershell
npm run typecheck
npm test
npm run build
```

Integration test membutuhkan PostgreSQL yang sedang berjalan:

```powershell
npm run test:integration
```

## Menghentikan development

Tekan `Ctrl+C` pada terminal yang menjalankan `npm run dev`, kemudian:

```powershell
docker compose stop postgres redis minio
```

Perintah `stop` mempertahankan database dan file dalam Docker volume.

## Jika aplikasi tidak dapat berjalan

Periksa container dan log:

```powershell
docker compose ps
docker compose logs postgres redis minio
```

Periksa port yang digunakan:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in @(3000, 5173, 5174, 5432, 6379, 9000, 9001) }
```

Masalah umum:

- `ECONNREFUSED` pada port `5432`: aktifkan Docker Desktop dan jalankan
  `docker compose up -d postgres`.
- Error tabel atau kolom tidak ditemukan: jalankan `npm run db:migrate`.
- Port `3000`, `5173`, atau `5174` sudah dipakai: pastikan mode Docker penuh
  tidak berjalan bersamaan dengan `npm run dev`.
- Login demo gagal: pastikan `npm run db:seed` sudah dijalankan dan cocokkan
  kredensial dengan `.env`.

Panduan lengkap, termasuk Flutter dan mode Docker penuh, tersedia di
[docs/START_APP.md](docs/START_APP.md).
