# Realm, role, dan permission

Kontrol akses LangkahSiswa mempunyai empat lapisan:

```text
Identity
  └── Binding yayasan/sekolah
        └── Role dalam realm
              └── Permission per area dan aksi
```

## Realm role

Realm adalah pengelompokan utama role, bukan halaman login yang berbeda.

| Realm | Pengguna |
| --- | --- |
| `OPERATIONAL` | Yayasan, sekolah, guru, staf, dan keuangan |
| `FAMILY` | Siswa dan wali |
| `TENANT` | Kantin atau vendor sekolah |

Satu identity tetap login dari halaman yang sama dan dapat mempunyai beberapa
binding atau role. Realm membantu mengelompokkan role dan pengalaman aplikasi;
role serta permission menentukan akses nyatanya.

Contoh dua akun yang sama-sama berada di area yayasan dapat mempunyai role dan
permission berbeda:

```text
FOUNDATION_HEAD  -> seluruh laporan dan pengaturan yayasan
FOUNDATION_STAFF -> hanya data dan laporan yang diberikan
```

Scope role tetap dibedakan menjadi `PLATFORM`, `FOUNDATION`, dan `SCHOOL`.
Binding foundation berlaku ke semua sekolah di bawah yayasan, sedangkan binding
school hanya berlaku pada sekolah terkait.

## Permission CRUD

Format permission standar adalah:

```text
<area>.create
<area>.read
<area>.update
<area>.delete
```

Contoh:

```text
student.create
student.read
student.update
student.delete
```

Makna setiap aksi:

- `create`: menampilkan aksi tambah dan mengizinkan endpoint pembuatan.
- `read`: menampilkan menu/sidebar dan mengizinkan daftar serta detail.
- `update`: menampilkan aksi edit dan mengizinkan perubahan.
- `delete`: menampilkan aksi hapus dan mengizinkan penghapusan.

Jika pengguna tidak memiliki `<area>.read`, area tersebut tidak boleh terlihat
di sidebar. Penyembunyian menu hanya perilaku UI; backend tetap wajib memeriksa
permission pada setiap endpoint.

Permission lama `<area>.write` dipertahankan selama masa transisi. Saat role
diinisialisasi atau migrasi dijalankan, grant `write` diturunkan menjadi
`create`, `read`, `update`, dan `delete` agar integrasi lama tidak langsung
kehilangan akses.

## Request context

Setelah token diverifikasi, backend membentuk actor context dari database:

```text
account_id
organization_id
active tenant/school
active bindings
effective roles
effective permissions
```

Frontend tidak menentukan permission melalui request. Pergantian kartu sekolah
di sidebar menerbitkan session baru, lalu role dan permission dihitung kembali
dari binding yang berlaku pada sekolah target.
