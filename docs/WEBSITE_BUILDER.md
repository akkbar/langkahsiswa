# Website Builder — Phase 19

Phase 19 menyediakan CMS berbasis blok di admin dan renderer website publik yang
terpisah. Konten disimpan sebagai JSON terstruktur; HTML mentah tidak diterima
atau dirender. Admin dan situs publik memakai registry komponen React yang sama
di `packages/website-renderer`.

## Menjalankan

```powershell
npm install
npm run db:migrate
npm run dev
```

- Editor admin: `http://localhost:5173/#website`
- Website publik: `http://localhost:5174/{kode-sekolah}/{slug}`
- Contoh setelah halaman `home` tenant demo diterbitkan:
  `http://localhost:5174/demo/home`

School admin dapat mengubah dan menerbitkan. Principal memiliki akses baca dan
pratinjau. Halaman publik tidak memerlukan login dan hanya mengembalikan versi
yang sedang diterbitkan. Pengunjung dapat memilih tema terang atau gelap;
preferensinya disimpan pada perangkat, dengan warna utama default `#004aad`.

## Alur editor

1. Simpan nama website, tagline, sekolah, dan warna utama.
2. Unggah gambar PNG/JPEG ke pustaka aset. File tetap privat selama belum dipakai
   oleh halaman yang diterbitkan.
3. Buat halaman dengan judul dan slug URL.
4. Tambahkan, isi, urutkan, atau hapus blok melalui form.
5. Isi judul dan deskripsi SEO, lalu **Simpan versi**. Setiap penyimpanan membuat
   baris versi baru dan tidak mengubah histori.
6. Pilih versi dari histori dan tekan **Terbitkan versi ini**. Versi draft baru
   tidak mengubah tampilan publik sampai diterbitkan.
7. **Tarik publikasi** menutup halaman dan aset yang tidak lagi dipakai oleh
   halaman publik lain.

Blok yang tersedia: Hero, Teks, Gambar, Galeri, Berita, Pengumuman, Agenda, Guru
dan Staf, Kontak, Peta Google, dan Footer. Maksimal 30 blok per halaman. URL
tautan dibatasi ke path internal, HTTPS, email, atau telepon. Peta hanya menerima
URL embed Google Maps.

## Model dan endpoint

Migrasi `007_website_builder.sql` menambahkan `website_settings`,
`website_pages`, `website_page_versions`, dan `website_assets`. Metadata berada
di PostgreSQL; byte gambar memakai provider file yang sama dengan modul berkas,
yaitu MinIO pada Docker atau filesystem pada pengembangan/pengujian.

| Endpoint                                          | Akses                | Kegunaan                       |
| ------------------------------------------------- | -------------------- | ------------------------------ |
| `GET/PUT /api/v1/website/settings`                | `website.read/write` | Identitas website              |
| `GET/POST /api/v1/website/pages`                  | `website.read/write` | Daftar dan halaman baru        |
| `GET /api/v1/website/pages/:id`                   | `website.read`       | Detail dan semua versi         |
| `POST /api/v1/website/pages/:id/versions`         | `website.write`      | Simpan versi immutable         |
| `POST /api/v1/website/pages/:id/publish`          | `website.write`      | Terbitkan versi terpilih       |
| `POST /api/v1/website/pages/:id/unpublish`        | `website.write`      | Tarik publikasi                |
| `GET/POST /api/v1/website/assets`                 | `website.read/write` | Pustaka gambar                 |
| `GET /api/v1/public/websites/:tenant/pages/:slug` | Publik               | Konten yang diterbitkan        |
| `GET /api/v1/public/websites/:tenant/assets/:id`  | Publik bersyarat     | Aset yang dipakai versi publik |

Isolasi tenant diterapkan pada query dan foreign key komposit. Payload blok
divalidasi ketat oleh Zod, React melakukan escaping teks, checksum file diperiksa
saat dibaca, dan endpoint aset publik menolak file draft.

Custom domain, verifikasi DNS, dan SSL termasuk phase 20. Renderer phase 19
menggunakan rute tenant/slug pada port publik lokal.
