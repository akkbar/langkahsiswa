# Login Google

Login email/password tetap tersedia. Login Google memakai Google Identity Services
di web dan ID token Google yang diverifikasi backend dengan `google-auth-library`.
Tidak membuat tenant, akun, atau role baru secara otomatis.

## Konfigurasi

1. Buat atau pilih project Google Cloud dan konfigurasi OAuth consent screen.
2. Buat OAuth client bertipe **Web application**. Tambahkan Authorized JavaScript
   origins `http://localhost:5173` dan `http://127.0.0.1:5173` untuk development;
   tambahkan origin HTTPS aplikasi untuk deployment.
3. Isi `GOOGLE_CLIENT_ID` di `.env` dengan client ID tersebut, lalu restart API.
   Frontend membaca ID publik dari `GET /api/v1/auth/google/config`.
   Client secret tidak diperlukan untuk alur ID token ini.
4. Jalankan `npm run db:migrate`. Administrator membuat akun pengguna dengan email
   Google yang sama, role yang benar, dan menghubungkannya ke guru/wali/siswa.
5. Isi kode sekolah di halaman masuk lalu gunakan tombol Google. Bila OAuth app
   masih Testing, tambahkan pengguna sebagai test user di Google Cloud.

Untuk Flutter, ikuti [panduan mobile](MOBILE_NOTIFICATIONS.md). Native OAuth client
Android/iOS memakai konfigurasi package/bundle ID serta fingerprint yang benar;
server client ID pada Google Sign-In menggunakan ID web yang diterima backend.
`GOOGLE_CLIENT_ID` dapat berupa daftar ID terpercaya dipisahkan koma; ID pertama
digunakan tombol web. Jangan memasukkan client ID milik aplikasi lain.

## Perilaku akun dan sesi

- `POST /api/v1/auth/google` menerima JSON
  `{tenant_slug, credential, account_password?}`; hasil sama dengan `/auth/login`.
- Backend memverifikasi signature, issuer, audience, expiry, dan email terverifikasi.
  Identitas permanen disimpan dengan Google `sub` dalam `user_identities` per tenant.
- Penautan pertama hanya untuk akun sekolah aktif dengan email cocok. Gmail dan
  Workspace dapat ditautkan langsung; email pihak ketiga memerlukan password akun
  sekolah untuk membuktikan penguasaan akun (`GOOGLE_LINK_REQUIRED`).
- Akun yang sudah ditautkan memakai `sub` pada login berikutnya, termasuk ketika
  alamat email Google berubah. Identitas Google lain tidak dapat menggantikannya.
- Tenant/domain/header harus konsisten. Akun atau tenant nonaktif tetap ditolak.
  Hak akses selalu berasal dari database sekolah, bukan klaim role dari Google.
- Request web harus JSON dan origin harus berada dalam `CORS_ORIGIN`. Refresh token
  web memakai cookie HttpOnly; token akses berada di memori.
- Native client menyimpan refresh token secara aman. `POST /auth/logout` menerima
  `{refresh_token}` untuk mencabut sesi native; web dapat memakai cookie seperti biasa.

## Verifikasi

`npm test` memeriksa kebijakan email; `npm run test:integration` memeriksa penautan,
isolasi tenant, role, perubahan email, origin, refresh rotation, logout native,
serta penolakan akun nonaktif. Integration test mensimulasikan batas verifikasi
Google dan menggunakan HTTP/database nyata. Login Google sungguhan memerlukan
OAuth client ID dan pengguna Google; kredensial tersebut tidak disertakan di repo.

Referensi resmi:
[verifikasi ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
dan [konfigurasi client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
