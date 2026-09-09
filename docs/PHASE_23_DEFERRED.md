# Phase 23 — Ditunda

Integrasi hardware sengaja dilewati pada iterasi ini sesuai keputusan proyek.
Belum ada service `device-gateway`, broker MQTT, provisioning perangkat, atau
endpoint event RFID yang ditambahkan.

Saat phase ini dilanjutkan, batas implementasinya adalah:

- service `device-gateway` terpisah dari API utama;
- identitas perangkat, rotasi kredensial, heartbeat, dan status koneksi;
- MQTT dengan TLS dan topik per tenant/perangkat;
- deduplikasi event serta idempotency key dari perangkat;
- mapping kartu siswa untuk absensi, wallet, library, dan asrama;
- antrean offline dan replay aman ketika koneksi kembali;
- audit perintah serta event perangkat.

Schema dan route phase 23 belum dibuat agar protokol perangkat tidak dikunci
sebelum spesifikasi hardware, broker, dan model deployment disepakati.
