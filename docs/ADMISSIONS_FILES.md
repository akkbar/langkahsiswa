# PPDB dan Manajemen Berkas

Phase 17–18 tersedia sejak SchoolApp V0.5. Admin sekolah dan principal mengakses
menu **PPDB**. Pustaka **Manajemen Berkas** dapat dibaca principal/finance dan
dikelola school admin.

## Alur PPDB

1. Admin membuat periode untuk sekolah dan tahun ajaran, menetapkan tanggal dan
   kuota, lalu membuka periode.
2. Calon wali membuka tautan **Pendaftaran siswa baru (PPDB)** pada halaman login,
   memasukkan kode sekolah, memilih periode/tingkat, dan mengirim data calon siswa.
3. Sistem memberikan nomor pendaftaran dan kode akses acak. Kode hanya ditampilkan
   setelah pendaftaran; pemohon harus menyimpannya untuk status dan unggah dokumen.
4. Petugas memverifikasi dokumen, lalu mencatat hasil review dokumen, tes, dan
   wawancara. Tahap tidak dapat dilompati. Kuota dikunci saat keputusan diterima.
5. Pendaftar berstatus `ACCEPTED` dapat dikonversi menjadi siswa. Pembuatan siswa,
   pengaitan kelas opsional, dan perubahan status `ENROLLED` berjalan atomik.

Data calon siswa tetap berada di `applicants`/`applications` sampai enrollment,
sehingga data pendaftar yang gagal atau mengundurkan diri tidak mencemari master
siswa. Nomor pendaftaran dan hash kode akses unik per tenant. Endpoint publik
hanya mengembalikan periode `OPEN` pada rentang tanggal aktif; status/dokumen
memerlukan kode akses.

Endpoint utama:

- `GET /api/v1/public/admissions/:tenant/periods`
- `POST /api/v1/public/admissions/:tenant/applications`
- `POST /api/v1/public/admissions/:tenant/applications/:number/status`
- `POST /api/v1/public/admissions/:tenant/applications/:id/documents`
- `GET|POST /api/v1/admission-periods`
- `GET|POST /api/v1/admissions/applications`
- `POST /api/v1/admissions/applications/:id/reviews`
- `POST /api/v1/admissions/applications/:id/enroll`

## Pustaka berkas

Berkas disimpan privat dan hanya dapat diunduh melalui endpoint berautentikasi.
Isi PNG/JPEG/PDF diperiksa dengan signature, base64 harus kanonik, dan batas file
adalah 5 MB. Metadata mencatat tenant, kategori, MIME, ukuran, SHA-256, uploader,
provider, serta tautan ke siswa/aplikasi/sekolah/raport. Query dan foreign key
menjaga pemisahan tenant. Berkas operasional dapat diarsipkan dan dipulihkan;
dokumen PPDB serta bukti transaksi yang masih menjadi audit tidak dapat dihapus.

Mode penyimpanan:

- `STORAGE_DRIVER=filesystem` menggunakan `STORAGE_PATH`, cocok untuk development
  lokal dan test.
- Docker Compose mengatur `STORAGE_DRIVER=minio`, endpoint internal MinIO, dan
  bucket `schoolapp`. Bucket dibuat otomatis saat unggahan pertama.
- Bukti pembayaran lama tetap dibaca dari filesystem. Migrasi 005 memasukkannya
  ke katalog berkas tanpa memindahkan atau menggandakan isi file.

Jangan mengekspos bucket MinIO untuk akses publik. Untuk production, ganti
credential default, gunakan secret manager, backup bucket/database bersama-sama,
dan batasi endpoint MinIO pada jaringan internal.

Migrasi `005_admissions_files.sql` menambah data PPDB dan katalog berkas. Migrasi
`006_file_storage_provider.sql` mencatat provider penyimpanan agar deployment dapat
membaca berkas filesystem lama dan objek MinIO baru secara bersamaan.
