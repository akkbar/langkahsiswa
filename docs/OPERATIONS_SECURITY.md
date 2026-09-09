# LangkahSiswa V1.0 — Phase 20–22 dan 24

Dokumen ini menjelaskan custom domain, operasional pondok, perpustakaan, serta
audit dan keamanan. Phase 23 ditunda secara eksplisit di
[PHASE_23_DEFERRED.md](PHASE_23_DEFERRED.md).

## Phase 20 — Custom domain

Menu **Custom Domain** tersedia untuk school admin dan dapat dibaca principal.
Admin memasukkan domain, lalu sistem memberikan dua pilihan bukti:

- CNAME domain ke nilai `CUSTOM_DOMAIN_CNAME_TARGET`.
- TXT `_langkahsiswa-verification.<domain>` dengan token kepemilikan unik.

Tombol verifikasi menjalankan lookup DNS nyata. Domain yang terverifikasi dapat
menjadi domain utama dan langsung dipakai resolver tenant serta renderer publik.
Pada domain khusus, slug halaman tersedia sebagai `https://domain-sekolah/slug`.

Sertifikat merupakan batas integrasi edge/reverse proxy. Set
`CUSTOM_DOMAIN_AUTO_SSL=true` hanya ketika ingress produksi memang menerbitkan
sertifikat otomatis. Jika nilainya `false`, status SSL tetap `PENDING` sampai
infrastruktur edge menyelesaikannya; ini tidak membuat klaim sertifikat palsu.

## Phase 21 — Boarding school

Menu **Boarding School** mencakup:

- asrama, kamar, kapasitas, tempat tidur, dan histori penempatan siswa;
- izin keluar dengan review serta pencatatan kepulangan;
- jadwal kunjungan wali;
- catatan kedisiplinan dan tindak lanjut;
- setoran tahfidz beserta rentang ayat dan nilai;
- aktivitas harian per asrama;
- laundry, status pengerjaan, dan pembayaran dari wallet siswa.

Tempat tidur dan siswa hanya boleh memiliki satu penempatan aktif. Kapasitas
kamar serta kesesuaian gender diperiksa dalam transaksi. Pembayaran laundry
mengunci saldo, menghasilkan transaksi wallet immutable, dan aman dari penagihan
ulang menggunakan idempotency key per pesanan.

Parent/student memiliki endpoint ringkasan milik sendiri di
`GET /api/v1/boarding/portal`. Data siswa lain tidak ikut dikembalikan.

## Phase 22 — Perpustakaan

Menu **Perpustakaan** menyediakan katalog buku, barcode eksemplar, peminjaman,
pengembalian, kondisi buku, serta denda keterlambatan/kerusakan/kehilangan.

- Satu eksemplar hanya dapat memiliki satu peminjaman aktif.
- Siswa aktif dapat meminjam maksimal lima eksemplar sekaligus.
- Pengembalian membuat record terpisah di `library_returns`.
- Tarif terlambat membaca `LIBRARY_DAILY_PENALTY`, default Rp1.000 per hari.
- Denda dapat dibebaskan atau dibayar melalui wallet secara transaksional.
- Parent/student membaca pinjaman miliknya melalui
  `GET /api/v1/library/portal`.

## Phase 24 — Audit dan keamanan

Setiap mutasi API terautentikasi dicatat ke `audit_logs` setelah berhasil tanpa
menyimpan body atau kredensial. Log menyimpan pengguna, aksi, endpoint, entitas,
IP, user-agent, dan waktu. `audit_logs` serta `login_history` dilindungi trigger
append-only agar update/delete ditolak database.

Login password, Google, dan rotasi refresh yang berhasil tercatat. Percobaan
password salah juga tercatat tanpa menyimpan kata sandi. Setiap login membuat
`user_sessions`; refresh token berotasi di sesi yang sama, sedangkan pencabutan
sesi mematikan access token dan refresh token terkait. Menu **Audit & Keamanan**
menampilkan audit, login, dan sesi perangkat serta menyediakan pencabutan sesi.
Konfigurasi Nginx admin dan website juga mengirim CSP, `nosniff`, referrer
policy, permissions policy, dan proteksi `frame-ancestors`.

Deployment yang sudah berjalan perlu meminta pengguna login kembali setelah
migrasi 011 diterapkan. Access token lama tidak memiliki claim sesi (`sid`) dan
sengaja ditolak oleh guard baru.

Endpoint utama:

| Modul   | Endpoint                                                       |
| ------- | -------------------------------------------------------------- |
| Domain  | `/api/v1/domains`, `/:id/verify`, `/:id/primary`               |
| Pondok  | `/api/v1/boarding/overview`, `/portal`, dan workflow per fitur |
| Library | `/api/v1/library/overview`, `/portal`, borrow/return/penalty   |
| Audit   | `/api/v1/security/audit-logs`, `/login-history`                |
| Sesi    | `/api/v1/security/sessions`, `/:id/revoke`                     |

Seluruh query operasional membawa `tenant_id`; foreign key komposit dan
pengujian lintas tenant mencegah referensi data sekolah lain.
