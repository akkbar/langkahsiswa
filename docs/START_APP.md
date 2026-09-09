# Menjalankan LangkahSiswa

Panduan ini memakai PowerShell pada Windows. Jalankan semua perintah awal dari
root repository `D:\OpenAIoT\AI\school`.

## 1. Siapkan aplikasi pendukung

Pastikan tersedia:

- Node.js 22 atau lebih baru dan npm.
- Docker Desktop dengan Docker Engine yang sudah berjalan.
- Git untuk pengelolaan source code.
- Flutter, Android SDK, dan emulator/perangkat Android jika aplikasi mobile akan
  dijalankan.

Periksa instalasi:

```powershell
node --version
npm --version
docker --version
docker compose version
```

Untuk mobile, periksa juga:

```powershell
flutter --version
flutter doctor
```

Port lokal yang dipakai adalah `3000` untuk API, `5173` untuk admin, `5174`
untuk website publik, `5432` untuk PostgreSQL, `6379` untuk Redis, serta `9000`
dan `9001` untuk MinIO.

## 2. Buka root repository

```powershell
cd D:\OpenAIoT\AI\school
```

Semua perintah npm berikutnya dijalankan dari folder ini, kecuali bagian
Flutter yang secara khusus berpindah ke `apps/mobile`.

## 3. Instal dependency dan buat konfigurasi lokal

```powershell
npm install
npm run setup
```

`npm run setup` membuat `.env` dari `.env.example` dan menghasilkan
`JWT_SECRET` acak. Jika `.env` sudah ada, file tersebut dipertahankan dan tidak
ditimpa.

Untuk development lokal, pastikan nilai utama dalam `.env` mengarah ke layanan
lokal:

```dotenv
DATABASE_URL=postgresql://langkahsiswa:langkahsiswa_dev@localhost:5432/langkahsiswa
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=filesystem
STORAGE_PATH=.local/uploads
SEED_ADMIN_EMAIL=admin@demo.langkahsiswa.id
SEED_ADMIN_PASSWORD=LangkahSiswa!2026
```

`GOOGLE_CLIENT_ID`, kredensial Firebase, dan MinIO tidak wajib untuk login
password serta fitur inti. Jangan memasukkan `.env` ke Git.

## 4. Jalankan layanan infrastruktur

Pastikan Docker Desktop sudah aktif, lalu jalankan:

```powershell
docker compose up -d postgres redis minio
docker compose ps
```

Tunggu sampai ketiga layanan berstatus `healthy`. Jika masih `starting`, jalankan
`docker compose ps` lagi beberapa detik kemudian.

## 5. Siapkan database

Jalankan seluruh migrasi dan buat data demo:

```powershell
npm run db:migrate
npm run db:seed
```

Kedua perintah aman dijalankan kembali. Migrasi hanya menjalankan versi yang
belum diterapkan, sedangkan seed mempertahankan data demo yang sudah ada.

## 6. Jalankan API, admin, dan website

```powershell
npm run dev
```

Perintah tersebut menjalankan tiga proses sekaligus dan terminal harus tetap
terbuka:

- API: `http://localhost:3000`
- Admin: `http://localhost:5173`
- Website publik: `http://localhost:5174`

Buka terminal PowerShell kedua untuk memeriksa API:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Respons harus menunjukkan API dan dependency yang terhubung. Jika API baru saja
mulai, tunggu sebentar lalu ulangi pemeriksaan.

## 7. Login ke admin

Buka `http://localhost:5173`, kemudian gunakan:

```text
Kode sekolah : demo
Email        : admin@demo.langkahsiswa.id
Password     : LangkahSiswa!2026
```

Jika nilai `SEED_ADMIN_EMAIL` atau `SEED_ADMIN_PASSWORD` di `.env` diubah sebelum
seed pertama, gunakan nilai tersebut. Setelah masuk, semua modul tersedia dari
menu admin sesuai role akun.

Website publik menggunakan alamat berikut setelah halaman dibuat dan diterbitkan
dari menu **Website**:

```text
http://localhost:5174/demo/home
```

Ganti `demo` dengan kode sekolah dan `home` dengan slug halaman yang diterbitkan.

## 8. Jalankan aplikasi Flutter

Biarkan API dan layanan infrastruktur tetap berjalan. Buka terminal baru:

```powershell
cd D:\OpenAIoT\AI\school\apps\mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Alamat `10.0.2.2` digunakan oleh emulator Android untuk mengakses komputer host.
Untuk perangkat Android fisik, gunakan IP LAN komputer, misalnya:

```powershell
flutter run --dart-define=API_URL=http://192.168.1.10:3000/api/v1
```

Komputer dan perangkat harus berada di jaringan yang sama. Izinkan port `3000`
pada Windows Firewall jika diperlukan. Jangan memakai `localhost` sebagai URL
API pada emulator atau perangkat karena alamat itu menunjuk ke perangkatnya
sendiri.

Untuk web/desktop Flutter yang berjalan langsung di komputer, gunakan:

```powershell
flutter run --dart-define=API_URL=http://localhost:3000/api/v1
```

Login mobile memerlukan akun dengan role `PARENT`, `STUDENT`, atau `TEACHER` yang
sudah ditautkan ke data orang tua, siswa, atau guru melalui admin.

## Startup harian

Setelah instalasi dan seed pertama selesai, startup berikutnya cukup memakai dua
terminal.

Terminal pertama:

```powershell
cd D:\OpenAIoT\AI\school
docker compose up -d postgres redis minio
npm run dev
```

Terminal kedua hanya diperlukan jika ingin menjalankan mobile:

```powershell
cd D:\OpenAIoT\AI\school\apps\mobile
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Setelah menarik perubahan source code yang memiliki migrasi baru, jalankan
`npm install` dan `npm run db:migrate` sebelum `npm run dev`.

## Alternatif: jalankan semuanya dengan Docker

Gunakan pilihan ini jika API, admin, dan website juga ingin dijalankan sebagai
container:

```powershell
cd D:\OpenAIoT\AI\school
npm run setup
docker compose up -d --build
docker compose ps
docker compose exec api npm run db:seed
```

Container API menjalankan migrasi otomatis sebelum server dimulai. Pantau log
jika API belum sehat:

```powershell
docker compose logs -f api
```

Tekan `Ctrl+C` untuk berhenti mengikuti log; containernya tetap berjalan. Jangan
jalankan `npm run dev` bersamaan dengan mode Docker penuh karena portnya sama.

## Menghentikan aplikasi

Untuk mode development, tekan `Ctrl+C` pada terminal `npm run dev`, lalu hentikan
layanan infrastrukturnya:

```powershell
docker compose stop postgres redis minio
```

Untuk mode Docker penuh:

```powershell
docker compose stop
```

Perintah `stop` mempertahankan database dan berkas pada Docker volume. Gunakan
`docker compose start` atau perintah startup semula untuk menjalankannya kembali.

## Pemeriksaan jika aplikasi tidak berjalan

1. Jalankan `docker compose ps` dan pastikan PostgreSQL serta Redis `healthy`.
2. Jalankan `Invoke-RestMethod http://localhost:3000/health` untuk memisahkan
   masalah API dari masalah tampilan.
3. Periksa bahwa port tidak sedang dipakai proses lain:

   ```powershell
   Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(3000,5173,5174,5432,6379,9000,9001) }
   ```

4. Lihat log infrastruktur dengan `docker compose logs postgres redis minio`.
5. Pastikan `DATABASE_URL` memakai `localhost` saat API berjalan melalui npm dan
   memakai host `postgres` saat API berjalan di dalam Docker. Docker Compose
   mengatur nilai container secara otomatis.
6. Jika muncul error tabel atau kolom belum tersedia, jalankan
   `npm run db:migrate` lalu restart API.
7. Jika token lama ditolak setelah migrasi phase 24, keluar lalu login kembali.

### Port 3000, 5173, atau 5174 sudah dipakai

Pastikan stack Docker penuh tidak sedang berjalan bersamaan dengan mode npm:

```powershell
docker compose stop api admin website
```

Jika port masih dipakai, tampilkan PID dan command line prosesnya. Contoh untuk
port admin `5173`:

```powershell
$listener = Get-NetTCPConnection -LocalPort 5173 -State Listen
$pidValue = $listener.OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" |
  Select-Object ProcessId, Name, ExecutablePath, CommandLine
```

Jika command line tersebut menunjuk ke repository LangkahSiswa dan merupakan proses
development lama, hentikan pohon prosesnya lalu jalankan ulang aplikasi:

```powershell
taskkill /PID $pidValue /T /F
npm run dev
```

Ganti `5173` dengan `3000` atau `5174` untuk memeriksa port API atau website.
Jangan menghentikan PID jika command line berasal dari aplikasi lain yang masih
dibutuhkan.

Konfigurasi login Google dijelaskan di [GOOGLE_LOGIN.md](GOOGLE_LOGIN.md),
sedangkan Firebase, push notification, dan build APK dijelaskan di
[MOBILE_NOTIFICATIONS.md](MOBILE_NOTIFICATIONS.md).
