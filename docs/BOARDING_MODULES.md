# Modul Pondok dan Islamic School

Fitur pondok tidak ditentukan dari jenis tenant. Setiap sekolah memilih modul yang
digunakan melalui **Boarding School > Aktivasi Modul**. Karena itu, satu yayasan
dapat mengelola sekolah umum, madrasah, dan pondok dalam tenant yang sama tanpa
memaksakan fitur yang tidak relevan ke semua sekolah.

## Aktivasi per sekolah

Konfigurasi disimpan di `school_modules`. Modul inti `ACADEMIC`, `ATTENDANCE`, dan
`FINANCE` aktif secara default. Sekolah dengan otoritas Kemenag memperoleh default
aktif untuk Tahfidz, Tahsin, Mutabaah, Diniyah, Disiplin, dan Kegiatan Pondok.
Semua pilihan tetap dapat diubah oleh akun operational yang memiliki permission
`boarding.write`.

Modul opsional yang tersedia:

- Tahfidz, Tahsin, dan Murajaah
- Mutabaah ibadah
- Pelajaran Diniyah
- Asrama serta kamar/tempat tidur
- Perizinan santri
- Kesehatan/UKS
- Disiplin serta adab/akhlak
- Kegiatan pondok
- Wallet santri, kantin, dan laundry

## Alur operasional

### Tahfidz dan pembinaan

Target tahunan dihubungkan ke siswa dan tahun ajaran. Setoran harian dapat berupa
Tahfidz, Tahsin, atau Murajaah, dengan nilai kelancaran, tajwid, makhraj, adab, dan
status hafalan. Catatan adab dapat berupa apresiasi, kebutuhan pembinaan, atau
pelanggaran beserta poin, tingkat, tindak lanjut, dan status persetujuan.

### Mutabaah

Sekolah menentukan checklist ibadah/kebiasaan sendiri. Petugas mencatat status
harian `DONE`, `MISSED`, atau `EXCUSED`. Riwayat ini ikut tersedia pada portal
siswa/wali untuk kebutuhan rekap.

### Hunian dan izin

Struktur hunian tetap memakai asrama, kamar, tempat tidur, dan penempatan siswa.
Kamar dapat memiliki pembina, jadwal piket, fasilitas, dan riwayat inspeksi.
Izin dibedakan menjadi keluar sementara, pulang, atau sakit. Setelah disetujui,
token gerbang dipakai untuk mencatat keluar dan kembali. Dashboard menurunkan
status posisi santri menjadi `IN`, `OUT`, atau `OVERDUE`.

### Kesehatan dan Diniyah

Catatan UKS menyimpan keluhan, diagnosis, tindakan, obat, rujukan, alergi, serta
dispensasi aktivitas. Diniyah menyimpan mata pelajaran, kitab/buku, pengajar, dan
progres bab per siswa.

## Fitur yang dipertahankan

Implementasi lama tidak diduplikasi: wallet dan limit belanja tetap berada di
Keuangan, transaksi kantin tetap memakai POS, laundry tetap memakai alur order
dan pembayaran wallet, sedangkan jadwal kegiatan pondok tetap memakai Aktivitas
Harian. API lama untuk hunian, kunjungan wali, disiplin, tahfidz dasar, dan izin
tetap kompatibel.

