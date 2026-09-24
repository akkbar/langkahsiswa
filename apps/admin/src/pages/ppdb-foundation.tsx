import React from "react";

export const ppdbFoundationNavigation = [
  ["ppdb-dashboard", "Dashboard"],
  ["ppdb-gelombang", "Gelombang"],
  ["ppdb-pendaftaran", "Pendaftaran"],
  ["ppdb-verifikasi", "Verifikasi"],
  ["ppdb-seleksi", "Seleksi"],
  ["ppdb-daftar-ulang", "Daftar Ulang"],
  ["ppdb-pembayaran", "Pembayaran"],
  ["ppdb-laporan", "Laporan"],
  ["ppdb-pengaturan", "Pengaturan"],
] as const;

export function PpdbFoundationPage({ route }: { route: string }) {
  const title = ppdbFoundationNavigation.find(([key]) => key === route)?.[1] || "PPDB";

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PPDB</span>
          <h1>{title}</h1>
        </div>
      </div>
      <section className="card padded" aria-label={`PPDB ${title}`}>
        <div className="empty">
          <span className="empty-icon" aria-hidden="true">▤</span>
          <p>Fondasi PPDB siap. Fitur operasional tersedia pada fase berikutnya.</p>
        </div>
      </section>
    </>
  );
}
