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

## Data simulasi SMP (150 siswa dan 150 orang tua)

Jalankan setelah migrasi:

```powershell
npm run db:migrate
npm run db:seed:simulation
```

Seed membuat yayasan terpisah berkode `simulasi`, satu SMP, tahun ajaran
2026/2027, dan enam rombel: 7-Putra, 7-Putri, 8-Putra, 8-Putri, 9-Putra,
9-Putri. Setiap rombel berisi 25 siswa; setiap siswa mempunyai satu akun
orang tua/wali yang terhubung. Tersedia 11 guru, 11 mata pelajaran, kompetensi
per tingkat, binding kelas, ruang kelas, dan jadwal Semester 1.

| Akun | Email |
| --- | --- |
| Admin | `admin@simulasi.example.test` |
| Siswa | `siswa001@simulasi.example.test` sampai `siswa150@simulasi.example.test` |
| Orang tua | `ortu001@simulasi.example.test` sampai `ortu150@simulasi.example.test` |
| Guru | `guru01@simulasi.example.test` sampai `guru11@simulasi.example.test` |

Kode yayasan semua akun: `simulasi`. Kata sandi awal: `Simulasi!2026`.
Untuk menggantinya sebelum seed pertama, isi `SEED_SIMULATION_PASSWORD`.
Menjalankan seed kembali tidak menggandakan atau mereset data yang sudah ada.
Data yayasan `demo` tetap tersedia dengan login sebelumnya.

### Mengatur pelajaran dan jadwal

1. Buka **Yayasan > Mata Pelajaran**, lalu **Pengaturan bobot** untuk menentukan
   menit per bobot (awal 40 menit). Klik **Tingkat & bobot** pada mata pelajaran
   untuk mengatur kebutuhan tiap tingkat per pekan; 0 berarti tidak diberikan.
2. Atur kompetensi mata pelajaran dan tingkat melalui **Yayasan > Guru dan Staff**.
   Binding guru ke rombel dapat ditentukan melalui **Administrasi > Pelajaran Kelas**.
3. Buka **Administrasi > Jadwal Pelajaran**, pilih semester, lalu **Susun otomatis**.
   Tentukan hari belajar, maksimum bobot per hari, jam mulai, dan waktu istirahat.
4. Klik **Buat pratinjau**. Binding kelas yang sudah ada dipertahankan; binding yang
   belum ada dipilih berdasarkan kompetensi dan beban guru. Sistem memeriksa
   bentrok kelas, guru, dan ruang termasuk semester lain yang tanggalnya bertumpang tindih.
5. Klik **Simpan jadwal** untuk mengganti seluruh jadwal semester pilihan.
   Jika kapasitas tidak cukup atau guru belum tersedia, jadwal lama tetap tersimpan.
6. Pilih tampilan **Beban guru** untuk melihat bobot, target menit, menit terjadwal,
   serta jam mengajar per pekan. **Per hari** menampilkan agenda mingguan.

Perubahan durasi bobot tidak menggeser jadwal tersimpan secara langsung.
Susun dan simpan ulang jadwal untuk menerapkan durasi baru. Bobot simulasi
berjumlah 35 per kelas per pekan (1.400 menit); ini contoh data, bukan klaim
ketentuan kurikulum resmi.
