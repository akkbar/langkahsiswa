# Catatan Pengembangan Mobile (LangkahSiswa)

## Kustomisasi di masa depan
- Tambahkan `assets/images/splash_logo.png` lalu uncomment di `pubspec.yaml` (bagian `assets`).
- Tambahkan file font **DM Sans** dan **Manrope** (`.ttf`) ke `assets/fonts/` lalu uncomment bagian `fonts` di `pubspec.yaml`.

## Detail Implementasi Saat Ini
- **Navigasi berbasis peran** menggunakan `NavigationBar` (Material 3) + `IndexedStack` agar state tab terjaga.
- Setiap tab merupakan `Scaffold` placeholder dengan judul dan teks tengah **"Halaman belum diimplementasikan"**.
- Tab **Lainnya** menampilkan grid ikon (`_LainnyaPage`) yang siap dipakai untuk deep-link ke halaman lain.
- Prioritas peran (pertama yang cocok dipakai):
  1. **PARENT** (orang tua)
  2. **STUDENT** (siswa)
  3. **TEACHER** (guru)
  4. **SCHOOL_ADMIN / SUPER_ADMIN** (admin operasional)
- Semua test existing masih lulus (`flutter test`) dan `flutter analyze` bersih.