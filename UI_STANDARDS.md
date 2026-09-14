# Standar Tampilan Halaman LangkahSiswa

- Halaman data menyediakan sedikitnya dua mode tampilan jika struktur datanya memungkinkan.
- Pilihan mode disimpan di browser agar tetap sama saat pengguna kembali ke halaman.
- Form tambah, detail, dan edit memakai editor yang sama agar validasi dan perilakunya konsisten.

## Template wajib semua halaman

Halaman **Yayasan — List Sekolah** adalah referensi utama untuk struktur
halaman data. Standar ini berlaku untuk semua halaman lama dan baru, termasuk
halaman **Semua Akun**, saat halaman tersebut dibuat atau direview kembali.

- Daftar, tabel, kartu, filter, pencarian, tab, dan ringkasan tetap berada pada
  area konten utama.
- Seluruh form `create`, `detail`, `edit`, pengaturan, dan mapping dibuka di
  **right drawer**. Form tidak ditampilkan inline di atas atau di bawah daftar.
- Tombol aksi pada header, kartu, atau baris tabel hanya bertugas membuka drawer
  yang relevan.
- Data detail dan kebutuhan form dimuat ketika drawer dibuka agar halaman daftar
  tetap ringan.
- Satu komponen form dipakai bersama untuk mode tambah, detail, dan edit jika
  field-nya sama.
- Drawer memakai lebar 600 px pada desktop dan memenuhi lebar layar pada mobile.
- Drawer mempunyai header yang jelas, judul sesuai aksi, tombol tutup, backdrop,
  dan area aksi simpan yang konsisten.
- Drawer dapat ditutup melalui tombol tutup, backdrop, atau tombol `Escape`,
  kecuali ketika proses simpan sedang berlangsung.
- Setelah penyimpanan berhasil, daftar utama dimuat ulang dan drawer ditutup.
  Error validasi tetap ditampilkan di dalam konteks drawer.
- Jangan memperkenalkan modal tengah atau pola form baru apabila kebutuhan dapat
  diselesaikan dengan template right drawer ini.

Referensi implementasi saat ini adalah `SitesPage` di
`apps/admin/src/pages/dashboard.tsx`, dengan struktur `school-drawer-layer`,
`school-drawer-backdrop`, dan `school-drawer`.

## Header halaman

- Header halaman hanya memuat eyebrow/konteks, judul halaman, filter toolbar,
  pemilih mode tampilan bila diperlukan, dan tombol aksi utama.
- Jangan menampilkan deskripsi singkat atau paragraf penjelasan tepat di bawah
  judul halaman.
- Jika penjelasan benar-benar diperlukan untuk menyelesaikan tugas, letakkan
  sebagai notice, helper text pada field, empty state, atau bagian konten yang
  relevan—bukan sebagai subjudul deskriptif pada header.

## Standar tabel dan filter toolbar

Standar berikut wajib dipakai pada **List Sekolah**, **Semua Akun**, dan seluruh
halaman lain yang mempunyai mode tabel:

1. Area tabel mengisi seluruh sisa tinggi halaman sampai batas footer dengan
   menyisakan gap padding. Tabel panjang tidak boleh menambah tinggi halaman.
2. Scroll vertikal dan horizontal terjadi di dalam table viewport. Header tabel
   tetap terlihat (`sticky`) ketika body di-scroll.
3. Baris atau data dimuat bertahap. Gunakan lazy load saat mendekati bagian bawah
   viewport, atau pagination server-side untuk dataset yang berasal dari API.
4. Filter toolbar berada di bagian atas halaman dan sejajar dengan tombol data
   baru serta pemilih mode tampilan. Setiap halaman minimal mempunyai pencarian.
5. State pencarian atau filter mereset posisi pagination/lazy load ke batch
   pertama.
6. Halaman yang hanya memerlukan tabel, seperti **Semua Akun**, tidak perlu
   menampilkan pemilih mode tampilan.

## Yayasan — List Sekolah

- `big-thumbnail`: kartu sekolah dengan foto utama dan ringkasan identitas.
- `table`: tabel ringkas untuk membandingkan banyak sekolah.
- Tombol aksi pada kedua mode membuka drawer editor yang sama, selebar 600 px pada desktop.

## Yayasan — Kelas

- Menu **Kelas** pada area Yayasan adalah master ruang fisik sekolah, bukan rombongan belajar tahunan.
- Data ruang mencakup nama, kode, gedung, lantai/posisi, kapasitas, dan status ketersediaan.
- Ruang kelas wajib dimiliki satu sekolah. Pemakaian ruang, tingkat, nama rombel, wali kelas, dan formasi siswa dibuat per sekolah dan per tahun ajaran melalui **Setup Tahun Ajaran**.
- Daftar menggunakan satu tabel dan form tambah, detail, serta edit memakai right drawer standar.

## Setup Tahun Ajaran

- Tahun ajaran baru disiapkan melalui wizard 12 langkah pada menu **Administrasi → Setup Tahun Ajaran** sebelum diaktifkan.
- Urutannya adalah salin konfigurasi tahun sebelumnya (opsional), review seluruh langkah, lalu konfirmasi aktivasi.
- Data master seperti sekolah, akun, guru, siswa, mata pelajaran, dan ruangan tidak dibuat ulang. Kelas, penempatan siswa, penugasan guru, kalender, kurikulum, jadwal, penilaian, dan biaya disimpan sebagai data tahunan.
- Setup dibagi menjadi tiga level: `FOUNDATION`, `SCHOOL`, dan `OPERATIONAL`. Halaman hanya tersedia untuk realm akun `OPERATIONAL`, dan visibility maupun aksi mengikuti permission CRUD `academic_setup.create/read/update/delete`; permission `read` mengatur visibility menu.
- Aktivasi hanya tersedia setelah seluruh langkah persiapan selesai dan pemeriksaan kritis lolos. Aktivasi menutup tahun ajaran aktif sebelumnya pada sekolah yang sama.
- Seluruh menu dalam grup **Administrasi** hanya ditampilkan dan dapat diakses oleh akun realm `OPERATIONAL`, kemudian tetap dibatasi lagi oleh permission masing-masing halaman.
- **Administrasi** adalah area operasional tahunan. Setup tahun ajaran, semester, kalender akademik, pelajaran kelas, anggota kelas, jadwal, dan kategori penilaian ditempatkan di area ini karena datanya mengikuti konteks tahun ajaran.
- Kompetensi guru tidak menjadi menu mandiri. Binding guru ke mata pelajaran dan tingkat kelas dikelola melalui **Yayasan → Guru dan Staff**, sedangkan akun dan role dikelola melalui **Pengaturan → Semua Akun** dan **Pengaturan → Role Setting**.
- Grup **Guru** menampung pekerjaan harian guru: **Input Nilai**, **Penilaian**, dan **Absensi**. Grup beserta submenunya tidak memakai tanda `*`, hanya tersedia untuk realm akun `OPERATIONAL`, dan tetap mengikuti permission setiap halaman.
- Grup menu **Komunikasi** dan submenu mandirinya tidak digunakan. Agenda sekolah, pengumuman, pertemuan wali, rapat guru/staf, kegiatan siswa, tenggat, dan pengingat dikelola sebagai klasifikasi event pada **Kalender Akademik**. Layanan notifikasi tetap menjadi mekanisme backend, bukan halaman menu tersendiri.
