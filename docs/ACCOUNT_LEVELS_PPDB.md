# Akun, multi-lokasi, dan PPDB LangkahSiswa

## Organisasi dan lokasi sekolah

Satu yayasan disimpan sebagai `organizations` dan dapat menaungi beberapa lokasi
di `organization_sites`. Setiap lokasi tetap memakai tenant terpisah agar data
siswa, keuangan, akademik, dan berkas tidak tercampur. Akun yayasan memperoleh
membership pada lokasi yang boleh dikelola dan dapat berpindah lokasi dari
pemilih sekolah di sidebar.

Role `Kepala Yayasan` dapat membuat lokasi baru. Lokasi baru otomatis mempunyai
tenant, pengaturan, data sekolah awal, dan membership untuk pembuatnya.

## Dua kategori akun

Identitas utama dicatat di `accounts`, sedangkan detail kategori disimpan pada
dua tabel terpisah:

- `operational_accounts`: akun staf sekolah/yayasan dan guru.
- `family_accounts`: akun orang tua/wali dan siswa.

Database menolak role keluarga pada akun operasional serta menolak role
operasional pada akun keluarga. Satu user juga tidak dapat mencampur kedua
kategori role.

Template role operasional awal adalah `Staff`, `Guru`, `Kepala Sekolah`,
`Staff Yayasan`, dan `Kepala Yayasan`. Hak akses tetap berasal dari permission,
sehingga template dapat dikembangkan tanpa mengubah kategori akun.

## Alur orang tua dan PPDB

1. Orang tua memilih **Daftar sebagai orang tua** pada halaman login, lalu
   memasukkan kode sekolah, identitas, dan kata sandi.
2. Sistem membuat akun `FAMILY` dengan role `PARENT`. Bila belum ada siswa yang
   terhubung, pengguna langsung masuk ke ruang PPDB.
3. Form pendaftaran hanya tersedia ketika periode sekolah berstatus `OPEN` dan
   tanggal saat ini berada dalam rentang periode.
4. Sekolah membuat jalur pendaftaran sendiri per periode. Setiap jalur mempunyai
   kode, nama, biaya, kuota opsional, dan status aktif. Contohnya Internal 1,
   Internal 2, External 1, dan External 2.
5. Orang tua mengirim pendaftaran dan mengunggah PDF/JPG/PNG dari ruang keluarga.
   Staf memverifikasi dokumen serta menyelesaikan tahap dokumen, tes, wawancara,
   dan keputusan akhir.
6. Saat pendaftaran dienroll, sistem membuat siswa dan relasi wali secara atomik.
7. Setelah siswa terhubung, orang tua dapat membuat login anak menggunakan email
   yang berbeda dan kata sandi minimal 12 karakter.

Orang tua menjadi pengelola akun anak melalui relasi wali. Staf sekolah dengan
permission pengguna dan data keluarga tetap dapat mengelola akun orang tua dan
siswa dari area operasional.

## Endpoint utama

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/v1/public/family/register` | Registrasi mandiri orang tua |
| `GET /api/v1/family/overview` | Siswa, pendaftaran, dokumen, dan periode terbuka |
| `POST /api/v1/family/applications` | Mengirim pendaftaran pada periode/jalur terbuka |
| `POST /api/v1/family/applications/:id/documents` | Mengunggah dokumen milik pendaftaran keluarga |
| `POST /api/v1/family/students/:id/account` | Membuat akun login siswa setelah enrollment |
| `GET /api/v1/sites` | Daftar lokasi yang dapat diakses akun |
| `POST /api/v1/sites` | Membuat lokasi baru dalam yayasan |
| `POST /api/v1/sites/:id/switch` | Berpindah lokasi dan menerbitkan sesi tenant tujuan |

Pemisahan ini bersifat logis di satu PostgreSQL agar transaksi, foreign key, dan
proses enrollment tetap atomik. Bila kelak diperlukan database fisik terpisah,
`operational_accounts` dan `family_accounts` menjadi batas migrasi yang jelas.
