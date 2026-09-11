# Akun dan login terpadu

LangkahSiswa menggunakan satu halaman dan satu proses login untuk admin, guru,
siswa, wali, serta pengelola kantin. Pengguna memasukkan kode yayasan, email,
dan kata sandi; backend menemukan membership aktif lalu memuat seluruh role dan
permission pengguna tersebut. Jenis pengguna tidak pernah diminta sebelum
kredensial diverifikasi.

## Model penyimpanan

```text
organizations                    yayasan / tenant boundary utama
  └── organization_sites         sekolah / operational scope

accounts                         identity global
  ├── user_bindings              binding yayasan atau sekolah + role
  └── users                      session membership pada sekolah aktif
        ├── teachers             profil domain guru (opsional)
        ├── students             profil domain siswa (opsional)
        └── parents              profil domain wali (opsional)
```

`accounts` menyimpan identitas global. `user_bindings` adalah sumber kebenaran
akses dan role, sedangkan `users` menyediakan membership untuk session pada
sekolah yang sedang aktif. Permission efektif berasal dari binding aktif dan
`role_permissions`.

Role terlebih dahulu dikelompokkan ke realm `OPERATIONAL`, `FAMILY`, atau
`TENANT`. Di dalam realm tersebut setiap role dapat memiliki set permission yang
berbeda. Aturan CRUD dan visibilitas menu dijelaskan di
[PERMISSIONS.md](PERMISSIONS.md).

Yayasan merupakan badan hukum di atas sekolah, dengan data legal, pengurus,
perizinan, dokumen, dan perpajakan yang terpisah dari identitas operasional
sekolah. Rincian modelnya dijelaskan di
[FOUNDATION_PROFILE.md](FOUNDATION_PROFILE.md).

Binding dengan `tenant_id = NULL` berlaku untuk seluruh sekolah di bawah
yayasan. Binding dengan `tenant_id` tertentu hanya berlaku pada sekolah/site
tersebut. Kolom ini merepresentasikan school security scope karena pada model
database saat ini satu `tenant` operasional adalah satu sekolah/site.

Record domain tidak bergantung pada tersedianya akun. Siswa, guru, atau wali
dapat dibuat dan dioperasikan terlebih dahulu; kolom `user_id` baru diisi saat
akses login diaktifkan. Karena itu impor siswa tidak otomatis memperbesar tabel
akun login.

Satu akun boleh memiliki banyak binding dan role. Contohnya, satu orang dapat
menjadi pengurus yayasan pada seluruh sekolah, `TEACHER` di SMP, dan `PARENT` di
SD tanpa membuat akun kedua. Menu yang tampil merupakan gabungan permission
dalam konteks sekolah aktif.

## Pemilihan sekolah dan session

Login hanya meminta kode yayasan dan kredensial. Backend memilih membership
aktif yang dapat diakses melalui binding. Daftar sekolah di kartu sidebar juga
dibentuk dari binding, bukan dari data yang dikirim bebas oleh frontend.

Saat kartu sekolah dipilih, `POST /api/v1/sites/:id/switch` memverifikasi bahwa
target masih berada di yayasan yang sama dan tercakup binding aktif. Backend
kemudian menerbitkan access token dan refresh token baru untuk sekolah tersebut.
Jika pengurus yayasan belum mempunyai membership teknis pada target, membership
dibuat saat switch tanpa memperluas binding aksesnya.

Area navigasi **Yayasan** dan **Pengaturan** hanya tersedia untuk realm
`OPERATIONAL`. Setiap submenu tetap membutuhkan permission `read` miliknya;
permission CRUD terkait menentukan tombol dan endpoint mutasi yang tersedia.
Halaman **Semua Akun** menjadi pusat mapping membership akun pada sekolah aktif,
profil orang tua/wali, guru, atau staff, serta kepemilikan siswa. Satu akun guru
atau staff dapat sekaligus mempunyai profil wali dan relasi ke anak tanpa
membuat identity login kedua. Saat relasi anak ditambahkan, role `PARENT`
ditambahkan pada binding sekolah secara aditif tanpa menghapus role operational.

## Status akun

Status membership adalah `PENDING`, `ACTIVE`, `LOCKED`, `SUSPENDED`, atau
`ARCHIVED`. Hanya `ACTIVE` yang dapat login. Menonaktifkan login tidak menghapus
profil domain maupun data historis seperti nilai, absensi, tagihan, dan
transaksi.

## Kompatibilitas migrasi

Kolom `accounts.account_level` dan tabel `operational_accounts`,
`family_accounts`, serta `tenant_accounts` masih dipertahankan sementara agar
data dan integrasi lama tidak rusak. Sejak migrasi `021_unified_accounts.sql`,
semuanya hanya metadata kompatibilitas dan bukan lagi batas login atau
otorisasi. Klien lama masih boleh mengirim `account_type`, tetapi nilainya
diabaikan oleh proses autentikasi.
