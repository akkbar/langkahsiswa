# Verifikasi LangkahSiswa V1.0

Pemeriksaan lokal selesai pada 9 September 2026 untuk phase 0–22 dan 24.

| Pemeriksaan                          | Hasil                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| `npm run typecheck`                  | Lulus                                                                 |
| `npm run build`                      | API NestJS, admin React, dan renderer website React berhasil dibangun |
| `npm test`                           | 12/12 lulus                                                           |
| `npm run test:integration`           | 44/44 lulus, HTTP nyata dan PostgreSQL dengan schema uji terisolasi   |
| `npm run test:ui`                    | 5/5 lulus di Chromium                                                 |
| `npm run format:check`               | Lulus                                                                 |
| `npm audit --omit=dev`               | 0 kerentanan yang diketahui                                           |
| `flutter analyze --no-pub`           | Tidak ada masalah                                                     |
| `flutter test --no-pub`              | 12/12 lulus                                                           |
| `flutter build apk --debug --no-pub` | APK Android debug berhasil dibangun                                   |

Jalankan perintah npm dari root repository dan perintah Flutter dari `apps/mobile`.
Integration test memerlukan PostgreSQL sesuai konfigurasi lokal; pengujian web
memerlukan API/admin berjalan dan data demo yang telah di-seed. Gunakan database
pengembangan karena pengujian web membuat data dan menjalankan transaksi demo.

Cakupan mencakup regresi akademik phase 0–9, isolasi tenant dan peran, bukti
pembayaran, verifikasi idempoten, saldo/ledger, checkout bersamaan, refund,
pembatasan belanja, target event, portal siswa/wali/guru, penautan Google,
refresh/logout, serta outbox notifikasi dan retry. Tampilan login light/dark,
dompet wali pada layar mobile, POS light, PPDB publik, workflow enrollment,
isolasi/validasi pustaka berkas, arsip/pemulihan, validasi 11 blok website,
versi immutable, penerbitan, aset publik, dan isolasi website antar-tenant juga diperiksa.
Custom domain, hunian pondok, izin/kunjungan, tahfidz, laundry-wallet,
sirkulasi perpustakaan, return/denda-wallet, audit append-only, rotasi refresh,
serta pencabutan sesi juga diuji. Cakupan baru memeriksa yayasan multi-lokasi,
pemisahan akun operasional/keluarga, jalur PPDB berbiaya, registrasi wali,
unggah dokumen terautentikasi, enrollment, dan pembuatan akun siswa. Phase 23
dikecualikan karena ditunda.

Resolusi dependency memaksa Multer 2.3.0 untuk menggantikan versi transitif
NestJS yang terkena advisory denial-of-service. Aplikasi mengirim unggahan
sebagai JSON base64 dan tetap membatasi tipe serta ukuran file di API.

APK tersedia di `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`.
Ini build debug untuk pengujian, bukan paket rilis yang ditandatangani untuk toko.

## Batas verifikasi

- Verifikasi identitas Google dan pengiriman FCM menggunakan pengganti layanan
  eksternal dalam test. Login Google sungguhan dan push ke perangkat masih perlu
  OAuth client ID, konfigurasi Firebase, serta pemeriksaan dengan akun/perangkat.
  Panduan: [Google login](GOOGLE_LOGIN.md) dan [mobile/notifikasi](MOBILE_NOTIFICATIONS.md).
- Build Android diuji dengan Flutter 3.35.6. Build iOS belum diuji karena lingkungan
  ini Windows; build dan konfigurasi signing iOS memerlukan macOS/Xcode.
- PostgreSQL 14 lokal dan penyimpanan filesystem digunakan untuk integration test.
  Konfigurasi Docker Compose lulus validasi; Redis dan MinIO berjalan sehat saat
  pemeriksaan. Deployment semua aplikasi sebagai container tetap belum diuji.
  Bukti pembayaran memakai penyimpanan file privat API.
- Batas harian/bulanan dapat diubah di mobile. Pengaturan kategori dan merchant
  tersedia di web, dan semua batas tetap ditegakkan API untuk setiap checkout.
