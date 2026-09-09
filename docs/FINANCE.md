# Billing, dompet siswa, dan POS — Phase 10–13

Semua endpoint di bawah memakai prefix `/api/v1`, bearer access token, dan tenant
dari sesi. `SUPER_ADMIN`, `SCHOOL_ADMIN`, dan `FINANCE` mengelola keuangan/POS.
Orang tua hanya dapat melihat dan membayar tagihan/topup anak yang terhubung
melalui `student_guardians`; siswa hanya melihat miliknya sendiri. Guru tidak
mendapat akses keuangan. Pengaturan batas belanja memerlukan wali yang terhubung
atau petugas keuangan; siswa tidak dapat melonggarkan batas sendiri.

Nilai uang memakai **integer rupiah**, tanpa pecahan. Nominal setiap permintaan
maksimal Rp1.000.000.000. Semua daftar mendukung respons `{data,total,page,limit}`;
daftar invoice, pembayaran, topup, siswa, dompet, produk, dan riwayat transaksi
mendukung `page`/`limit` (maksimal 100, bawaan 50).

## Alur pembayaran manual

1. Petugas membuat `POST /fee-types` dengan `{name,description?,amount,active?}`.
2. Petugas membuat `POST /invoices` dengan
   `{student_id,title,due_date:"YYYY-MM-DD",items:[{fee_type_id?,description,quantity?,unit_amount}]}`.
   Server menghitung total; jenis biaya yang disebut harus aktif pada tenant sama.
3. Wali membuka `GET /invoices?student_id=...`, kemudian `GET /invoices/:id`.
   Detail berisi `items` dan `payments`, termasuk hasil verifikasi.
4. Setelah transfer, unggah `POST /payment-proofs`:
   `{student_id,file_name,mime_type,data_base64}`. Simpan `id` hasil unggahan.
5. Kirim `POST /invoices/:id/payments` dengan `{amount,proof_id,reference?}`.
6. Petugas memeriksa `GET /payments?status=PENDING`, mengunduh bukti melalui
   `GET /payment-proofs/:id/file`, lalu mengirim
   `POST /payments/:id/verify` dengan `{decision:"APPROVED"|"REJECTED",notes?}`.

Status invoice bergerak dari `UNPAID` ke `PARTIAL` dan `PAID` menurut pembayaran
yang disetujui. Pembayaran menunggu verifikasi ikut mencadangkan sisa tagihan
agar unggahan paralel tidak menimbulkan kelebihan pembayaran. Penolakan
membebaskan cadangan tersebut. Verifikasi berulang dengan keputusan sama
mengembalikan hasil sebelumnya; keputusan berbeda mendapat 409. Riwayat
verifikasi menyimpan petugas, keputusan, alasan, dan waktu, serta tidak dapat
diubah/dihapus. Bukti hanya boleh dipakai sekali, termasuk lintas tagihan/topup.
Untuk percobaan baru setelah penolakan, unggah bukti baru.

## Berkas bukti

PNG, JPEG, dan PDF didukung dengan maksimum **2 MiB setelah decoding**. Server
memeriksa base64 kanonis dan magic bytes jenis berkas. Kirim base64 mentah,
bukan awalan `data:...;base64,`. Batas JSON API 3 MiB menampung encoding base64.

Berkas disimpan di `STORAGE_PATH` (bawaan `.local/uploads`) dengan kunci
`<tenant UUID>/<file UUID>.<extension>`. PostgreSQL hanya menyimpan metadata,
ukuran, hash SHA-256, dan kunci penyimpanan. Nama dari pengguna tidak dipakai
sebagai path. Unduhan membutuhkan login dan hubungan siswa yang sesuai,
serta dikirim sebagai attachment dengan `nosniff` dan CSP sandbox.

Pada Docker, gunakan `STORAGE_PATH=/app/storage` dan volume persisten ke lokasi
tersebut. Backup volume ini bersama PostgreSQL. Deployment dengan beberapa
instance API harus memakai filesystem bersama; penyimpanan S3/MinIO dan UI
manajemen berkas umum belum termasuk fase ini. Jangan melayani direktori
storage sebagai static public folder. Unggahan yang belum dilampirkan ke
pembayaran tetap disimpan; penghapusan/retensi otomatis merupakan pekerjaan
operasional lanjutan. Magic bytes merupakan validasi tipe, bukan pemindai malware.

## Dompet dan topup

- `GET /finance/students?search=...`: siswa yang boleh diakses, beserta saldo.
- `GET /wallets?student_id=...`: saldo untuk setiap siswa yang boleh diakses.
- `GET /wallets/:student_id`: saldo, `today_spending`, `month_spending`, 100
  transaksi terbaru, dan `limits`.
- `GET /wallets/:student_id/transactions?page=1&limit=50`: riwayat terpaginasikan.
- `POST /wallet-topups`: `{student_id,amount,proof_id,reference?}`.
- `GET /wallet-topups?status=PENDING&student_id=...`: antrean topup terfilter.
- `POST /wallet-topups/:id/verify`: `{decision:"APPROVED"|"REJECTED",notes?}`.
- `POST /wallets/:student_id/adjustments`: petugas mengirim
  `{amount,reason,idempotency_key}`; nominal dapat positif atau negatif, wajib
  nonnol, dan hasil tidak boleh membuat saldo negatif.

Topup menunggu verifikasi belum menambah saldo. Akun dibuat ketika diperlukan.
Setiap perubahan saldo menulis transaksi `TOPUP`, `PURCHASE`, `REFUND`, atau
`ADJUSTMENT` dengan nominal bertanda, saldo sesudahnya, pelaku, dan waktu.
Ledger dan item pembelian menolak UPDATE/DELETE di PostgreSQL.

## POS

- `GET/POST /wallet-merchants`: `{name,category,active?}`.
- `PATCH /wallet-merchants/:id`: perubahan sebagian nama/kategori/status.
- `GET /products?merchant_id=...`, `POST /products`:
  `{merchant_id,name,price,stock:null|integer,active?}`.
- `PATCH /products/:id`: ubah nama/harga/stok/status. Merchant produk tidak
  dapat dipindahkan karena struk lama harus tetap valid.
- `GET /pos/students?search=...`: pencarian nama atau NIS bagi kasir.
- `POST /pos/checkout`:
  `{student_id,merchant_id,items:[{product_id,quantity}],idempotency_key}`.
- `POST /wallet-transactions/:id/refund`: `{reason,idempotency_key}`.

Frontend membuat UUID untuk `idempotency_key` dan **memakai kembali kunci yang
sama saat retry permintaan yang sama**. Server mengambil harga dan stok dari
database. Pembelian dari merchant berbeda, produk nonaktif, siswa nonaktif,
saldo kurang, stok kurang, atau batas belanja terlampaui ditolak. Satu keranjang
hanya berisi satu merchant. `stock:null` berarti stok tidak dilacak.

Saldo, ledger, stok, struk, dan notifikasi ditulis dalam satu transaksi database.
Mutasi tenant diserialisasi melalui advisory lock, ditambah row lock akun/produk,
sehingga request konkuren tidak dapat membelanjakan saldo yang sama. Kunci
idempotensi unik dalam tenant dan terikat payload/pelaku; pemakaian ulang untuk
permintaan berbeda menghasilkan 409. Refund V1 adalah **refund penuh satu kali**,
menambah saldo, mengembalikan stok yang dilacak, dan mengacu pada pembelian asli.

## Batas belanja dan monitoring

`PUT /wallets/:student_id/limits` menerima:

```json
{
  "daily_limit": 50000,
  "monthly_limit": 500000,
  "category_limits": { "FOOD": 300000, "LAUNDRY": 100000 },
  "blocked_merchant_ids": []
}
```

`null` menghapus batas harian/bulanan, `0` memblokir belanja dalam batas tersebut.
`category_limits` adalah batas **bulanan** berdasarkan nilai kategori merchant
yang tersimpan pada struk. Daftar merchant dibatasi memakai UUID tenant yang
sama. Kalender hari/bulan V1 memakai **Asia/Jakarta**, termasuk query statistik.
Pembelian yang telah direfund tidak lagi dihitung pada periode pembelian asli;
refund pembelian bulan lalu tidak menambah jatah bulan sekarang.

Tagihan baru, hasil verifikasi pembayaran/topup, pembelian, dan refund menghasilkan
notifikasi siswa/wali dalam transaksi yang sama melalui event/notification
service. Pengiriman push memakai konfigurasi FCM pada panduan notifikasi.

## Verifikasi

Dengan PostgreSQL lokal aktif dan `.env` terisi:

```powershell
npx tsx --test apps/api/test/integration/finance.test.ts
```

Test memakai schema PostgreSQL unik dan direktori bukti sementara, menjalankan
semua migrasi, lalu membersihkannya. Cakupan meliputi unduhan byte asli,
penolakan tipe palsu, unggahan di atas batas parser lama, otorisasi wali/siswa,
FK lintas tenant, pembayaran parsial/ditolak, verifikasi paralel, deduplikasi,
saldo dan stok saat checkout bersamaan, batas harian/bulanan/kategori/merchant,
refund satu kali, integritas ledger, serta notifikasi deduplikasi.
