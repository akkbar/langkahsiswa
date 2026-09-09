Kalau LangkahSiswa mau punya **ERP sekolah/yayasan**, saya sarankan jangan sekadar bikin “cash in / cash out”. Untuk sekolah swasta, terutama yang berada di bawah **yayasan**, model akuntansinya sebaiknya mengikuti **entitas yayasan sebagai legal/accounting entity**, lalu sekolah menjadi unit/cost center di bawahnya.

Secara pajak, yayasan pendidikan **bukan otomatis bebas pajak seluruhnya**. Ada beberapa perlakuan khusus yang penting untuk kita jadikan dasar desain ERP.

### Gambaran pajaknya

**1. Jasa pendidikan formal/nonformal tertentu dibebaskan dari PPN.** PP 49/2022 mencakup jasa pendidikan formal seperti PAUD, pendidikan dasar, menengah, dan tinggi yang diselenggarakan satuan pendidikan berizin, serta pendidikan nonformal tertentu. Jadi SPP/layanan pendidikan inti umumnya masuk fasilitas pembebasan PPN apabila memenuhi ketentuannya. Tetapi fasilitas tersebut tidak otomatis mencakup barang/jasa komersial lain yang terpisah dari jasa pendidikan. ([Directorate General of Taxes][1])

Artinya di ERP jangan anggap:

```text
Semua penerimaan sekolah
= bebas PPN
```

Lebih tepat:

```text
Penerimaan
├── Jasa pendidikan
│   └── PPN dibebaskan
│
├── Sumbangan / hibah
│   └── perlakuan tersendiri
│
└── Kegiatan usaha lainnya
    ├── kantin
    ├── sewa gedung
    ├── koperasi
    └── lainnya
        → tax treatment masing-masing
```

---

### 2. Yayasan tetap merupakan Wajib Pajak Badan

Tarif umum PPh Badan saat ini adalah **22% dari Penghasilan Kena Pajak**, dengan fasilitas tertentu untuk badan berperedaran bruto sampai Rp50 miliar. DJP pada 2026 juga menjelaskan bahwa badan dengan omzet tertentu dapat memperoleh fasilitas Pasal 31E sehingga sebagian PKP efektif dikenai tarif 11%. ([Directorate General of Taxes][2])

Tetapi yayasan pendidikan punya ketentuan khusus soal **sisa lebih**.

Misalnya:

```text
Pendapatan       Rp5 M
Biaya            Rp4 M
────────────────────
Sisa lebih       Rp1 M
```

Tidak berarti otomatis:

```text
Rp1 M × 22%
```

Untuk badan/lembaga nirlaba bidang pendidikan, sisa lebih dapat dikecualikan dari objek PPh apabila digunakan kembali untuk pembangunan/pengadaan sarana dan prasarana pendidikan atau memenuhi ketentuan dana abadi, dalam jangka waktu maksimal **4 tahun**, berikut persyaratan pencatatan dan pelaporannya. ([Pajak Stats][3])

Ini justru bisa menjadi **fitur ERP yang sangat menarik**.

---

## 3. Buat `Sisa Lebih Tracking`

Misalnya yayasan punya:

```text
Sisa Lebih

2026     Rp500 jt
2027     Rp600 jt
2028     Rp400 jt
```

Sistem bisa mencatat alokasinya:

```text
Sisa Lebih FY2026
Rp500.000.000

├── Lab komputer       Rp150 jt
├── Renovasi kelas     Rp200 jt
├── Perpustakaan       Rp100 jt
└── Belum dialokasikan Rp50 jt

Deadline penggunaan:
31 Dec 2030
```

Kalau mendekati batas empat tahun:

```text
⚠ Rp50.000.000 sisa lebih FY2026
belum digunakan sesuai alokasi.
```

DJP mensyaratkan adanya pencatatan penggunaan serta bukti pendukung untuk fasilitas ini. ([Directorate General of Taxes][4])

Menurut saya ini bisa jadi fitur yang cukup khas untuk ERP pendidikan.

---

# 4. PPh 21 guru dan karyawan

Yayasan sebagai pemberi kerja dapat menjadi pemotong PPh 21 atas:

* guru
* kepala sekolah
* pegawai TU
* staff yayasan
* pegawai tetap lainnya
* tenaga tidak tetap
* honor tertentu

Sejak 2024 mekanismenya menggunakan ketentuan PP 58/2023 dan PMK 168/2023. Untuk pegawai tetap, masa pajak selain masa terakhir menggunakan **Tarif Efektif Rata-rata (TER) bulanan**, lalu pada masa pajak terakhir dilakukan penghitungan dengan tarif Pasal 17. ([Directorate General of Taxes][5])

Maka payroll LangkahSiswa sebaiknya punya:

```text
Employee
├── employment type
├── NPWP/NIK
├── PTKP status
├── base salary
├── allowance
├── honor
├── deduction
├── BPJS
└── PPh 21
```

Payroll:

```text
Gross Salary
+ Allowances
+ Honor
────────────
Gross Income

- Employee deductions
- PPh 21
────────────
Take Home Pay
```

Dan tax engine-nya jangan hardcoded ke satu angka.

Buat:

```text
tax_rules
tax_rule_versions
tax_brackets
```

supaya kalau aturan pajak berubah, kamu tidak perlu bongkar payroll.

---

# 5. Honor guru tidak tetap

Ini juga penting di sekolah.

Contohnya:

```text
Guru tetap
Guru honorer
Guru tamu
Pelatih ekstrakurikuler
Pembicara seminar
Penguji
```

Tax treatment-nya bisa berbeda tergantung status penerima penghasilan.

PMK 168/2023 membedakan antara pegawai tetap, pegawai tidak tetap, bukan pegawai, peserta kegiatan, dan lainnya. ([Directorate General of Taxes][6])

Jadi employee/payee sebaiknya punya:

```text
tax_subject_type

PERMANENT_EMPLOYEE
NON_PERMANENT_EMPLOYEE
NON_EMPLOYEE
ACTIVITY_PARTICIPANT
```

---

# 6. Pembayaran Vendor & PPh 23

Sekolah/yayasan sering memakai vendor:

```text
IT consultant
Cleaning service
Security service
Maintenance
Software
Management consultant
Rental equipment
```

Untuk pembayaran jasa tertentu kepada WP badan, dapat timbul kewajiban pemotongan **PPh 23**, umumnya **2% dari jumlah bruto** untuk jasa/sewa tertentu yang termasuk objek PPh 23. ([Directorate General of Taxes][7])

Contoh:

```text
Vendor Invoice

Maintenance AC
Rp10.000.000

PPh 23 2%
Rp200.000
────────────

Payment vendor
Rp9.800.000
```

ERP harus menyimpan:

```text
Gross amount       10,000,000
Withholding tax       200,000
Net payment         9,800,000
```

Jangan hanya:

```text
payment = 9.8jt
```

karena nanti rekonsiliasinya sulit.

---

# 7. Chart of Accounts khusus sekolah

Saya akan buat template COA seperti:

```text
1000 ASSET
├── 1100 Cash & Bank
│   ├── Cash
│   ├── Bank Operational
│   ├── Bank SPP
│   └── Student Wallet Clearing
│
├── 1200 Receivable
│   ├── SPP Receivable
│   ├── Admission Receivable
│   └── Other Receivable
│
└── 1500 Fixed Asset
    ├── Land
    ├── Building
    ├── Computer
    ├── Furniture
    └── Laboratory Equipment


2000 LIABILITY
├── Accounts Payable
├── Tax Payable
│   ├── PPh 21 Payable
│   ├── PPh 23 Payable
│   └── Other Tax Payable
│
└── Student Wallet Liability
```

Yang terakhir sangat penting.

---

# 8. Student Wallet jangan dianggap revenue

Ini terkait fitur kantin yang tadi kita bahas.

Parent top-up:

```text
Parent → Rp500.000
```

**bukan otomatis pendapatan sekolah**.

Secara sistem saya akan mencatat:

```text
Bank/Cash              +500k
Student Wallet Liability +500k
```

Karena uang itu pada dasarnya masih saldo milik santri untuk digunakan.

Kemudian saat santri membeli:

```text
Wallet                 -20k
        ↓
Kantin transaction
```

Baru sistem menentukan settlement/revenue sesuai model operasional kantinnya.

Ini alasan wallet perlu ledger terpisah dari accounting ERP.

---

# 9. Kantin perlu dibedakan

Ada dua kemungkinan.

### Kantin milik sekolah/yayasan

```text
Yayasan
  ↓
Kantin
  ↓
Sales
```

Maka ERP mencatat penjualan kantin sebagai kegiatan usaha tersendiri.

### Kantin vendor eksternal

```text
Parent wallet
     ↓
Student buys
     ↓
Merchant balance
     ↓
Settlement vendor
```

LangkahSiswa hanya memegang ledger:

```text
Wallet Liability
Merchant Payable
Platform Fee
```

Ini jauh berbeda secara accounting dan pajak.

Karena itu merchant harus punya:

```text
merchant_type

SCHOOL_OWNED
THIRD_PARTY
```

---

# 10. Jangan campurkan SPP dengan sumbangan

Sistem harus punya revenue/fund classification.

Misalnya:

```text
INCOME TYPE

TUITION
ADMISSION_FEE
DEVELOPMENT_FEE
DONATION
GRANT
GOVERNMENT_ASSISTANCE
CANTEEN
RENT
OTHER
```

Bantuan, sumbangan atau hibah kepada badan pendidikan/yayasan dapat memiliki perlakuan PPh khusus apabila memenuhi persyaratan ketentuan perpajakan. Aturan terbaru juga mengatur kondisi pengecualian sebagai objek penghasilan. ([Directorate General of Taxes][8])

Ini berarti:

> kategori transaksi harus punya arti accounting + tax, bukan cuma nama invoice.

---

# 11. ERP sebaiknya punya tiga dimensi

Ini yang menurut saya akan membuat LangkahSiswa jauh lebih matang.

Jangan cuma:

```text
Account
Amount
```

Tapi:

```text
Account
Legal Entity
Business Unit
Cost Center
Fund
```

Misalnya Yayasan ABC:

```text
YAYASAN ABC
│
├── SD ABC
│   ├── Academic
│   ├── Facility
│   └── Administration
│
├── SMP ABC
│
├── SMA ABC
│
└── Pondok
    ├── Dormitory
    ├── Canteen
    └── Laundry
```

Transaksi:

```text
Rp5.000.000

Account:
Electricity Expense

Entity:
Yayasan ABC

Unit:
SMA ABC

Cost Center:
Facility

Fund:
Operational
```

Jadi bisa keluar laporan:

```text
Profit/Loss Yayasan
Profit/Loss SMA
Expense per sekolah
Expense per department
Expense per funding source
```

---

# 12. Multi-school menjadi sangat masuk akal

Ini juga memperkuat alasan paket **multi-school = Enterprise**.

Contoh satu yayasan:

```text
Yayasan Al Hikmah
│
├── TK
├── SD
├── SMP
├── SMA
└── Pesantren
```

Untuk akademik mereka tenant/unit berbeda.

Tetapi financial consolidation:

```text
                    Yayasan
                       │
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
        SD            SMP           SMA
         │             │             │
         └─────────────┼─────────────┘
                       ↓
             Consolidated Report
```

Ini sudah benar-benar **School ERP**, bukan SIS biasa.

---

# 13. Modul ERP LangkahSiswa

Saya akan tambahkan domain besar:

```text
ERP
│
├── General Ledger
│
├── Accounts Receivable
│   └── Student Billing
│
├── Accounts Payable
│   └── Vendor Invoice
│
├── Cash & Bank
│
├── Budgeting
│
├── Purchasing
│   ├── PR
│   ├── PO
│   └── Receiving
│
├── Fixed Assets
│
├── Inventory
│
├── Payroll
│
├── Tax
│   ├── PPh 21
│   ├── PPh 23
│   ├── PPh Final / other taxes
│   └── Tax Reconciliation
│
└── Financial Report
```

Kemudian Student Finance terhubung ke ERP:

```text
Student Billing
      ↓
Accounts Receivable
      ↓
Payment
      ↓
Cash / Bank
      ↓
General Ledger
```

Bukan dua sistem terpisah.

---

# 14. Automatic journal

Ini yang saya sarankan sejak awal.

Finance user **tidak perlu membuat jurnal manual untuk transaksi rutin**.

Misalnya generate SPP:

```text
SPP September
Rp500.000
```

otomatis:

```text
DR Student Receivable    500.000
CR Tuition Income        500.000
```

Parent bayar:

```text
DR Bank                  500.000
CR Student Receivable    500.000
```

Vendor maintenance:

```text
DR Maintenance Expense  10.000.000
CR PPh 23 Payable          200.000
CR Account Payable       9.800.000
```

Jurnal manual tetap ada untuk accountant, tetapi transaksi operasional harus otomatis.

---

# 15. Struktur database tambahannya

Dari arsitektur awal LangkahSiswa, saya akan tambahkan:

```text
erp/

legal_entities
business_units
cost_centers

chart_of_accounts

fiscal_years
accounting_periods

journal_entries
journal_lines

customers
vendors

accounts_receivable
accounts_payable

bank_accounts
bank_transactions

budgets
budget_lines

purchase_requests
purchase_orders
goods_receipts
vendor_invoices

fixed_assets
asset_depreciations

tax_codes
tax_rules
tax_transactions

funds
fund_transactions

surplus_allocations
surplus_usages
```

`journal_lines` misalnya:

```text
id
tenant_id
legal_entity_id
journal_id
account_id

debit
credit

business_unit_id
cost_center_id
fund_id

reference_type
reference_id
```

Dengan struktur ini ERP bisa berkembang jauh tanpa merombak database.

---

## Yang menarik untuk LangkahSiswa

Menurut saya jangan menjualnya sebagai:

> “Ada fitur accounting.”

Lebih kuat kalau:

> **Academic + Finance + Accounting dalam satu transaksi.**

Contohnya kepala yayasan melihat:

```text
YAYASAN DASHBOARD

Students                 3,821
Attendance                95.2%

Tuition billed           Rp1.82B
Collected                Rp1.65B
Receivable               Rp170M

Operating expense        Rp1.21B
Payroll                  Rp680M

Surplus FY2026           Rp440M
Allocated to facility    Rp300M
Unallocated              Rp140M
```

Ini level informasinya sudah berbeda dari aplikasi sekolah yang hanya menyediakan pembayaran SPP.

Untuk roadmap kita, saya **tidak akan membuat seluruh ERP sekarang**. Saya akan desain `billing`, `payment`, `wallet`, dan `vendor` dari awal agar accounting-ready, lalu setelah core LangkahSiswa selesai baru masuk **General Ledger → AP/AR → Purchasing → Asset → Payroll → Tax**. Dengan begitu kita tidak perlu bongkar model finance ketika LangkahSiswa mulai dipakai yayasan besar.

[1]: https://pajak.go.id/id/peraturan/pajak-pertambahan-nilai-dibebaskan-dan-pajak-pertambahan-nilai-atau-pajak-pertambahan?utm_source=chatgpt.com "PAJAK PERTAMBAHAN NILAI DIBEBASKAN DAN PAJAK PERTAMBAHAN NILAI ATAU PAJAK PERTAMBAHAN NILAI DAN PAJAK PENJUALAN ATAS BARANG MEWAH TIDAK DIPUNGUT ATAS IMPOR DAN/ATAU PENYERAHAN BARANG KENA PAJAK TERTENTU DAN/ATAU PENYERAHAN JASA KENA PAJAK TERTENTU DAN/ATAU PEMANFAATAN JASA KENA PAJAK TERTENTU DARI LUAR DAERAH PABEAN | Direktorat Jenderal Pajak"
[2]: https://www.pajak.go.id/id/artikel/badan-usaha-justru-tidak-terbebani-dengan-pp-202026-ini-penjelasannya?utm_source=chatgpt.com "Badan Usaha Justru Tidak Terbebani dengan PP 20/2026, Ini Penjelasannya | Direktorat Jenderal Pajak"
[3]: https://stats.pajak.go.id/id/peraturan/penyesuaian-pengaturan-di-bidang-pajak-penghasilan?utm_source=chatgpt.com "PENYESUAIAN PENGATURAN DI BIDANG PAJAK PENGHASILAN | Direktorat Jenderal Pajak"
[4]: https://pajak.go.id/en/node/57972?utm_source=chatgpt.com "PERLAKUAN PAJAK PENGHASILAN ATAS BEASISWA YANG MEMENUHI PERSYARATAN TERTENTU DAN SISA LEBIH YANG DITERIMA ATAU DIPEROLEH BADAN ATAU LEMBAGA NIRLABA YANG BERGERAK DALAM BIDANG PENDIDIKAN DAN/ATAU BIDANG PENELITIAN DAN PENGEMBANGAN | Direktorat Jenderal Pajak"
[5]: https://pajak.go.id/index.php/id/peraturan/tarif-pemotongan-pajak-penghasiian-pasal-21-atas-penghasilan-sehubungan-dengan-pekerjaan?utm_source=chatgpt.com "TARIF PEMOTONGAN PAJAK PENGHASII.AN PASAL 21 ATAS PENGHASILAN SEHUBUNGAN DENGAN PEKERJAAN, JASA, ATAU KEGIATANWAJIB PAJAK ORANG PRIBADI | Direktorat Jenderal Pajak"
[6]: https://www.pajak.go.id/sites/default/files/2024-02/PMK%20168%20Tahun%202023%20Tentang%20PPh%20Pasal%2021%20TER.pdf?utm_source=chatgpt.com "PowerPoint Presentation"
[7]: https://www.pajak.go.id/id/pph-pasal-2326?utm_source=chatgpt.com "PPh Pasal 23/26 | Direktorat Jenderal Pajak"
[8]: https://www.pajak.go.id/index.php/id/peraturan/perlakuan-atas-bantuan-atau-sumbangan-termasuk-zakat-atau-sumbangan-keagamaan-yang?utm_source=chatgpt.com "PERLAKUAN ATAS BANTUAN ATAU SUMBANGAN TERMASUK ZAKAT ATAU SUMBANGAN KEAGAMAAN YANG SIFATNYA WAJIB, SERTA HARTA HIBAHAN DALAM PAJAK PENGHASILAN | Direktorat Jenderal Pajak"
