# Profil Yayasan dan Identitas Sekolah

Yayasan dimodelkan sebagai badan hukum di atas satu atau lebih sekolah, bukan
sekadar induk teknis dari `school`. Data legal yayasan disimpan pada
`organizations`, sedangkan identitas operasional setiap sekolah tetap berada
pada `schools`.

## Data yayasan

Profil utama mencakup kode yayasan, nama umum dan nama legal, status serta jenis
badan hukum, nomor dan tanggal badan hukum, registrasi AHU, akta dan notaris,
NPWP, NIB, NPYP, tanggal berdiri, alamat administratif, dan kontak.

Data yang memiliki riwayat tidak ditimpa di profil utama:

- `foundation_officials` menyimpan sejarah Pembina, Pengurus, dan Pengawas,
  termasuk jabatan dan masa berlaku.
- `foundation_licenses` menyimpan versi perizinan, penerbit, masa berlaku,
  status, serta dokumen terkait.
- `foundation_documents` menjadi katalog akta dan dokumen legal beserta masa
  berlaku dan tautan berkas.
- `foundation_tax_profiles` menyimpan identitas serta konfigurasi perpajakan.
  Kredensial sistem pajak tidak boleh disimpan di tabel ini.

NPYP adalah identitas yayasan. Halaman **Yayasan > Profil Yayasan** menjadi
tempat pengelolaannya. Hak lihat, tambah, ubah, dan hapus masing-masing dikontrol
oleh `foundation.read`, `foundation.create`, `foundation.update`, dan
`foundation.delete`. Semua formulir dibuka di right drawer.

## Data sekolah

Setiap sekolah mempunyai NPSN, bentuk dan jenjang pendidikan, status
kepemilikan, alamat administratif, SK pendirian, izin operasional, serta
akreditasi. NPSN tetap menjadi identitas sekolah dan tidak dipindahkan ke profil
yayasan.

SK pendirian, izin operasional, dan akreditasi disimpan sebagai riwayat pada
`school_licenses`. Ketika nomor perizinan pada **Yayasan > List Sekolah** diganti,
record aktif sebelumnya diberi status `REVOKED` dan versi baru dibuat. Dengan
demikian histori legal sekolah tidak hilang akibat penyuntingan form.

## Batas keamanan

Endpoint profil yayasan hanya menerima akun dalam realm `OPERATIONAL` dan tetap
memeriksa permission CRUD. Data sekolah tetap terikat tenant sekolah, sedangkan
data yayasan terikat `organization_id`. Pemilihan sekolah aktif dan binding akun
tetap mengikuti model yang dijelaskan dalam [ACCOUNT_REALMS.md](ACCOUNT_REALMS.md).
