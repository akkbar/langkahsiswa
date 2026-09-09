# Flutter, event, dan push — Phase 14–16

`apps/mobile` adalah aplikasi Flutter Android/iOS untuk wali, siswa, dan guru.
Kode memakai API sekolah yang sama dengan web; tidak ada database siswa kedua.
POS tetap di admin React pada menu **Kasir Kantin** (`#pos`).

## Menjalankan mobile

Prasyarat: Flutter/Dart sesuai `pubspec.yaml`, Android SDK/JDK untuk Android,
atau macOS/Xcode untuk iOS. Jalankan API dan migrasi dari root terlebih dahulu.

```powershell
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

`10.0.2.2` adalah alamat host untuk emulator Android. Untuk perangkat fisik,
gunakan alamat API yang dapat dijangkau perangkat. Build debug mengizinkan HTTP
lokal; deployment release memakai HTTPS. Jangan memakai `localhost` perangkat
untuk menunjuk server pada komputer.

```powershell
flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Hasil APK berada di `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`.
Build release memerlukan identitas aplikasi dan signing milik sekolah; template
signing debug bawaan bukan konfigurasi distribusi Play Store.

## Akun dan layar

Administrator membuat akun dari web dan menautkan `user_id` pada master orang
tua/siswa/guru. Wali ditautkan melalui **Wali Siswa**; guru melalui penugasan
pelajaran dan wali kelas. Akun tanpa tautan mendapat keadaan kosong yang jelas.

- Login password dan Google, pemulihan sesi, logout, serta tema dark/light.
- Home dengan siswa yang terhubung. Wali/siswa melihat kehadiran, jadwal semester
  berjalan, nilai, dan raport terbit; PDF diunduh dengan otorisasi sebelum dibuka.
- Guru mendapat **Ruang guru** untuk kelas/pelajaran yang ditugaskan, input lima
  status kehadiran dan nilai penilaian yang sudah dibuat lewat admin web.
- Tagihan, detail pembayaran, unggah bukti PNG/JPEG/PDF maksimal 2 MiB.
- Wallet: saldo, belanja hari/bulan, transaksi, pengajuan topup; wali mengatur
  batas harian/bulanan. Pengaturan kategori/merchant tersedia di dashboard web
  dan tetap ditegakkan backend. Siswa tidak dapat mengubah batas.
- Event yang ditujukan ke pengguna, kotak notifikasi, tanda baca, aktivasi push.

Access token hanya di memori. Refresh token disimpan dengan
`flutter_secure_storage`, dirotasi ketika kedaluwarsa, dan dicabut pada logout.
Device token dilepas saat logout agar perangkat tidak menerima notifikasi akun
sebelumnya. Saat offline, aplikasi menampilkan error dan retry; belum ada antrean
edit offline atau sinkronisasi latar belakang data sekolah.

## Login Google di perangkat

Konfigurasi backend mengikuti [GOOGLE_LOGIN.md](GOOGLE_LOGIN.md). Android
application ID bawaan `id.schoolapp.schoolapp_mobile`; daftarkan package dan
fingerprint SHA sertifikat debug/release pada Google Cloud/Firebase. Google
Sign-In memakai web client ID backend sebagai `serverClientId`.

Untuk iOS, buat OAuth iOS client sesuai bundle ID; tambahkan URL scheme
`REVERSED_CLIENT_ID` dari konfigurasi Google ke `Runner/Info.plist` melalui Xcode,
dan berikan `--dart-define=GOOGLE_IOS_CLIENT_ID=<ios-client-id>`.
Google login di perangkat memerlukan konfigurasi proyek sungguhan; unit test
memeriksa pertukaran ID token, bukan dialog akun Google langsung.
Jika backend meminta penautan email pihak ketiga, isi kata sandi akun sekolah
pada halaman login lalu pilih Google kembali untuk konfirmasi pertama kali.

## Event dan kotak notifikasi

Admin/principal membuat event dengan jenis EXAM, HOLIDAY, SCHOOL_EVENT,
PARENT_MEETING, PAYMENT_DEADLINE, REPORT_PUBLICATION, atau ANNOUNCEMENT.
Target dapat berupa ALL (seluruh tenant), SCHOOL, GRADE, CLASS, STUDENT,
TEACHER, atau PARENT. Target spesifik harus milik tenant yang sama.

Event baru DRAFT. Saat dipublikasikan, penerima aktif dihitung dan notifikasi
dibuat satu kali per pengguna. Sasaran siswa/kelas/tingkat/sekolah menyertakan
wali yang mengaktifkan `receive_notification`; sasaran kelas juga mencakup guru
yang ditugaskan. Daftar penerima merupakan snapshot pada publikasi: akun atau
wali yang baru ditautkan tidak otomatis menerima event lama.

| Endpoint `/api/v1` | Operasi |
| --- | --- |
| `/events` | GET event terlihat, POST draft dengan `targets` |
| `/events/:id/publish` | POST, publikasi idempoten |
| `/notifications?limit=100` | GET inbox sendiri, jumlah total/unread |
| `/notifications/:id/read` | PATCH, tandai baca |
| `/device-tokens` | POST `{token,platform:"ANDROID"|"IOS"|"WEB"}` |
| `/device-tokens/:id` | DELETE, nonaktifkan perangkat sendiri |
| `/notifications/deliveries` | GET status pengiriman tenant, admin/principal |
| `/notifications/dispatch` | POST, coba proses antrean tenant |
| `/notifications/deliveries/:id/retry` | POST, retry pengiriman FAILED |
| `/portal/students` | GET siswa milik/penugasan pengguna |
| `/portal/overview?student_id=...` | GET kehadiran/jadwal/nilai/raport sesuai akses |
| `/portal/teaching` | GET pelajaran, roster, assessment untuk guru |

## Firebase Cloud Messaging

Backend memakai FCM HTTP v1 dan service-account OAuth JWT bertanda tangan RSA.
Aktifkan Firebase Cloud Messaging API dan berikan role pengiriman FCM kepada
service account. Di `.env`, isi salah satu:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=D:/private/firebase-service-account.json
# Alternatif pada secret manager deployment:
# FIREBASE_SERVICE_ACCOUNT_JSON={...service account JSON...}
NOTIFICATION_WORKER_ENABLED=true
```

File tersebut privat dan tidak disertakan dalam repository. Pada Docker,
mount file read-only ke container dan pakai path container, atau gunakan secret
environment JSON. Jangan memasukkan service-account private key ke Flutter.

Untuk Flutter, daftarkan aplikasi Android/iOS pada Firebase. Berikan konfigurasi
publik aplikasi yang sesuai platform, misalnya melalui berkas lokal
`firebase.local.json` yang diabaikan Git:

Jalankan `flutterfire configure` pada project Firebase milik sekolah untuk
menyiapkan konfigurasi native Android/iOS (termasuk resource Google Services).
Pastikan konfigurasi native dan dart defines berikut berasal dari aplikasi
Firebase yang sama. Konfigurasi proyek tidak dibuat otomatis karena project ID,
OAuth client, dan identitas signing berbeda untuk setiap sekolah/deployment.

```json
{
  "API_URL": "https://api.sekolah.example/api/v1",
  "FIREBASE_ENABLED": true,
  "FIREBASE_API_KEY": "api-key-aplikasi",
  "FIREBASE_APP_ID": "app-id-aplikasi",
  "FIREBASE_SENDER_ID": "project-number",
  "FIREBASE_PROJECT_ID": "project-id"
}
```

```powershell
flutter run --dart-define-from-file=firebase.local.json
```

Di iOS tambahkan `FIREBASE_IOS_BUNDLE_ID`, aktifkan Push Notifications serta
Background Modes/Remote notifications, dan upload APNs key pada Firebase.
Saat menjalankan aplikasi, masuk lalu pilih **Aktifkan push** di inbox dan
berikan izin sistem. Token diperbarui ketika Firebase merotasinya. Notifikasi
foreground muncul di aplikasi; membuka push mengarahkan ke inbox.

Notifikasi alpa, nilai baru, raport terbit, invoice, verifikasi pembayaran/topup,
pembelian wallet, refund, serta event ditulis bersama transaksi bisnis. Worker
memproses outbox setiap 15 detik dengan klaim row, retry bertahap (maksimal lima
percobaan), dan penanganan token tidak terdaftar. Token tidak valid dinonaktifkan.
Tenant suspended tidak dikirimi push dan tidak menghabiskan jatah retry.

Tanpa kredensial Firebase, notifikasi dalam aplikasi tetap tersedia dan antrean
tetap PENDING. Status SENT hanya dicatat setelah FCM memberikan message ID.
Delivery bersifat at-least-once: gangguan setelah FCM menerima pesan tetapi
sebelum pencatatan database dapat menyebabkan pengiriman ulang. `notification_id`
disertakan untuk identifikasi.

## Verifikasi dan batas aktivasi

`npm test` memeriksa validasi event serta kontrak HTTP FCM dan tanda tangan OAuth
dengan transport simulasi. `npm run test:integration` menggunakan PostgreSQL
terisolasi untuk targeting, ownership portal, hook akademik, deduplikasi,
outbox, retry, token invalid, device pindah akun, dan tenant suspended.
`flutter test` memeriksa sesi, role UI, input guru, tema, dan form bukti.

Login Google sungguhan dan penerimaan push di perangkat membutuhkan akun Google,
proyek Firebase, serta perangkat terkonfigurasi. Pengujian transport simulasi
tidak membuktikan penerimaan push di perangkat tersebut. iOS membutuhkan
verifikasi build dan signing melalui macOS/Xcode.

Referensi: [FCM server authentication](https://firebase.google.com/docs/cloud-messaging/auth-server),
[Flutter FCM setup](https://firebase.google.com/docs/cloud-messaging/flutter/client),
[Flutter Google Sign-In](https://pub.dev/packages/google_sign_in).
