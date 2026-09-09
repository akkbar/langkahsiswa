# Isolasi tiga ruang akun

LangkahSiswa membagi autentikasi menjadi tiga ruang akun yang dipilih sebelum
email dan kata sandi divalidasi.

| Pilihan login | Realm data | Store identitas | Ruang aplikasi |
| --- | --- | --- | --- |
| Admin Sekolah | `OPERATIONAL` | `operational_accounts` | Yayasan, staf, guru, dan supervisi sekolah |
| Siswa / Wali | `FAMILY` | `family_accounts` | Data milik keluarga, siswa, PPDB, tagihan, dan informasi sekolah |
| Tenant Sekolah | `TENANT` | `tenant_accounts` | Kantin dan layanan komersial sekolah |

`accounts` hanya menjadi registry identitas global. Login selalu dimulai dari
jenis akun yang dipilih dan hanya boleh membaca store realm tersebut. Sesi juga
memuat kembali realm dari database pada setiap request sehingga perubahan role
tidak dapat memindahkan akun ke ruang lain.

Kode yang dimasukkan pada halaman login adalah `organizations.slug`, yaitu kode
yayasan. Kode tersebut memilih sekolah utama sebagai konteks awal. Akun Admin
Sekolah kemudian dapat berpindah lokasi di dalam yayasan yang sama sesuai
membership dan permission.

Role adalah lapisan kedua setelah realm. Tabel `roles` menyimpan
`account_level`; setiap role, termasuk role buatan pengguna, hanya dapat diberikan
kepada akun dalam realm yang sama. Permission tetap berasal dari
`role_permissions`. Role bawaan Tenant Sekolah adalah `CANTEEN_ADMIN`.

Ketiga store saat ini berada di database PostgreSQL platform yang sama agar
transaksi membership tetap atomik, tetapi dipisahkan oleh tabel, constraint, dan
validator. Pemindahan ke tiga server/database fisik dapat dilakukan kemudian
melalui adapter identity-store tanpa mengubah kontrak login atau token.
