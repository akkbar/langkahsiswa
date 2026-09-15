# Arsitektur backend

Backend memakai NestJS. Fitur dikelompokkan di `src/modules/<fitur>` agar
route, business logic, dan registrasi dependency dapat ditemukan di satu tempat.

## Struktur

```text
src/
  main.ts                       # menjalankan HTTP server
  app.ts                        # bootstrap, CORS, middleware, filter, interceptor
  app.module.ts                 # komposisi module fitur
  config.ts                     # environment dan validasi JWT secret
  database/
    database.module.ts          # menyediakan satu Database untuk seluruh aplikasi
    database.service.ts         # pool PostgreSQL dan transaksi per tenant
  common/
    filters/api-error.filter.ts # format error HTTP yang konsisten
    request-policy.middleware.ts
    redis.connection.ts
    storage/file-storage.ts
  modules/
    attendance/
      attendance.module.ts
      attendance.controller.ts
      attendance.service.ts
      attendance.repository.ts
      attendance.types.ts
    academics/
      academic-policy.ts        # akses kelas, keanggotaan, semester, kunci raport
      resource-policy.ts        # aturan perubahan master data akademik
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts           # identitas, resolusi tenant, penerbitan token
      auth-sessions.service.ts  # login, refresh, logout, pembatasan percobaan
      users.service.ts
      auth.guard.ts
      permissions.ts
      tenant-provisioning.ts
    notifications/
      notifications.module.ts
      notifications.controller.ts
      notifications.service.ts
      events.service.ts
      device-tokens.service.ts
      notification.dispatcher.ts
      notification-delivery.ts
    security/
      audit.interceptor.ts
      security.controller.ts
      security.service.ts
      security.module.ts
    ...
```

## Pembagian tanggung jawab

- **Controller:** path, metode HTTP, guard, parameter request, dan delegasi ke
  service. Hindari SQL dan aturan domain di sini.
- **Service:** validasi input, permission, aturan bisnis, dan koordinasi
  transaksi. Operasi biasa menerima `Actor`, bukan seluruh Express request.
- **Repository:** query untuk satu fitur. Absensi menggunakan repository terpisah;
  fitur lain masih memiliki query di service. Pisahkan query ke repository ketika
  fitur tersebut dikembangkan agar perubahan tetap mudah ditinjau.
- **Module:** mendaftarkan controller dan provider milik fitur; mengimpor module
  yang menyediakan dependency. Export hanya provider yang dipakai fitur lain.
- **Guard, middleware, interceptor, filter:** autentikasi, kebijakan origin/cache,
  audit, dan pemetaan error. Error Zod tetap menghasilkan HTTP 400 dengan field
  error; validasi schema tetap memakai paket `packages/validation`.

Alur cookie/session dan unduhan berkas masih menggunakan Express request/response
di service terkait. Ini mempertahankan perilaku header, cookie, dan pengiriman
binary yang sudah ada; jangan gunakan pola tersebut untuk operasi domain biasa.

## Menambah atau mengubah fitur

1. Tambahkan endpoint di controller fitur dan operasi bisnis di service.
2. Gunakan schema Zod yang sesuai; jangan percaya `tenant_id` dari request body.
3. Ambil tenant dari `Actor`. Terapkan permission sebelum mengakses data.
4. Untuk mutasi, gunakan `Database.transaction(actor.tenant_id, async (sql) => ...)`.
   Semua query repository, policy akademik, dan notifikasi dalam transaksi harus
   menggunakan objek `sql` yang sama. Jangan memakai pool terpisah di tengah
   transaksi: itu dapat membuat perubahan lolos saat operasi utama di-rollback.
5. Daftarkan provider di module fitur. Import `DatabaseModule` dan, jika diperlukan,
   `AuthModule`; jangan mendaftarkan ulang `Database` atau `AuthService` per fitur.
6. Import module baru di `AppModule` sebelum `ResourcesModule`. Route generik
   `:resource` harus didaftarkan terakhir agar route fitur tidak tertutup.
7. Tambahkan pengujian perilaku yang relevan, terutama permission, isolasi tenant,
   transaksi, dan respons HTTP yang digunakan frontend.

## Verifikasi

Jalankan dari root repository:

```powershell
npm test
npm run typecheck
npm run build -w @langkahsiswa/api
npm run test:integration
```

Unit test mencakup smoke test bootstrap module, route terlindungi, kebijakan
origin, dan health check tanpa database eksternal. Integration test memerlukan
PostgreSQL yang dapat diakses melalui `DATABASE_URL` dan membuat schema sementara
untuk setiap suite. Gunakan database pengujian khusus.

Perintah development, URL endpoint, payload, schema database, dan dependency npm
tetap sama. Detail startup tersedia di [RUN.md](../../RUN.md).
