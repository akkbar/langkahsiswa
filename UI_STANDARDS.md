# Standar Tampilan Halaman LangkahSiswa

- Halaman data menyediakan sedikitnya dua mode tampilan jika struktur datanya memungkinkan.
- Pilihan mode disimpan di browser agar tetap sama saat pengguna kembali ke halaman.
- Form tambah, detail, dan edit memakai editor yang sama agar validasi dan perilakunya konsisten.

## Data Sekolah — List Sekolah

- `big-thumbnail`: kartu sekolah dengan foto utama dan ringkasan identitas.
- `table`: tabel ringkas untuk membandingkan banyak sekolah.
- Tombol aksi pada kedua mode membuka drawer editor yang sama, selebar 600 px pada desktop.

## Data Sekolah — Kelas

- `big-thumbnail`: kartu kelas berisi tingkat, tahun ajaran, wali kelas, dan jumlah siswa.
- `table`: tabel ringkas untuk membandingkan dan mengelola banyak kelas.
- Satu tingkat dapat memiliki beberapa kelas, misalnya 7A, 7B, dan 7C.
- Form tambah dan edit memakai drawer kanan yang sama, selebar 600 px pada desktop.
