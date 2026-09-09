import React, { useState } from "react";
import type {
  Actor,
  SiteSummary,
} from "../../../../packages/shared-types/src";
import type { Catalog } from "../components";
import { ErrorBox, can } from "../components";
import { send } from "../api";

export function DashboardPage({
  user,
  catalog,
  sites,
}: {
  user: Actor;
  catalog: Catalog;
  sites: SiteSummary[];
}) {
  const metrics: Array<[string, number]> = [
    ["Siswa aktif", catalog.students?.length || 0],
    ["Guru", catalog.teachers?.length || 0],
    ["Kelas", catalog.classes?.length || 0],
    ["Lokasi", sites.length || 1],
  ];
  const shortcuts = [
    ["Absensi", "attendance", can(user, "attendance.read")],
    ["Input nilai", "grades", can(user, "grade.read")],
    ["Tagihan", "billing", can(user, "finance.read")],
    ["Agenda", "events", can(user, "event.read")],
    ["Data siswa", "students", can(user, "student.read")],
    ["Lokasi sekolah", "sites", can(user, "site.read")],
  ].filter((item) => item[2]);
  return (
    <>
      <div className="page-title dashboard-heading">
        <div>
          <span className="eyebrow">DASHBOARD</span>
          <h1>Selamat datang, {user.name}</h1>
          <p className="muted">
            {user.organization_name} · {user.tenant_name}
          </p>
        </div>
        <span className="site-status">Lokasi aktif</span>
      </div>
      <section className="dashboard-metrics" aria-label="Ringkasan data">
        {metrics.map(([label, value], index) => (
          <article
            className={index === 0 ? "metric accent" : "metric"}
            key={label}
          >
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="card padded">
        <div className="section-title">
          <span className="eyebrow">AKSES CEPAT</span>
          <h2>Pekerjaan utama</h2>
        </div>
        <div className="shortcut-grid">
          {shortcuts.map(([title, route]) => (
            <a href={`#${route}`} key={String(route)}>
              <span>{title}</span>
              <strong>→</strong>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

export function SitesPage({
  user,
  sites,
  reload,
  switchSite,
}: {
  user: Actor;
  sites: SiteSummary[];
  reload: () => Promise<void>;
  switchSite: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    school_name: "",
    address: "",
    phone: "",
    principal_name: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = can(user, "site.write");
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">DATA SEKOLAH</span>
          <h1>Lokasi sekolah</h1>
          <p className="muted">
            Kelola seluruh lokasi di bawah {user.organization_name} dengan satu
            akun.
          </p>
        </div>
      </div>
      <ErrorBox error={error} />
      {message && <p className="notice success">{message}</p>}
      <section className="site-list">
        {sites.map((site) => (
          <article
            className={site.current ? "card site-card current" : "card site-card"}
            key={site.id}
          >
            <div>
              <span className="eyebrow">
                {site.is_primary ? "LOKASI UTAMA" : "LOKASI"}
              </span>
              <h2>{site.name}</h2>
              <p className="muted">Kode: {site.slug}</p>
              <span className="badge">{site.roles.join(" · ")}</span>
            </div>
            {site.current ? (
              <span className="site-status">Sedang digunakan</span>
            ) : (
              <button disabled={busy} onClick={() => void switchSite(site.id)}>
                Buka lokasi
              </button>
            )}
          </article>
        ))}
      </section>
      {editable && (
        <section className="card padded">
          <div className="section-title">
            <span className="eyebrow">LOKASI BARU</span>
            <h2>Tambahkan sekolah atau cabang</h2>
          </div>
          <form
            className="ops-form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setMessage("");
              try {
                await send("sites", form);
                await reload();
                setForm({
                  name: "",
                  slug: "",
                  school_name: "",
                  address: "",
                  phone: "",
                  principal_name: "",
                });
                setMessage(
                  "Lokasi baru dibuat dan akun Anda sudah mendapat akses admin.",
                );
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nama lokasi *
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Kampus Utama"
              />
            </label>
            <label>
              Kode lokasi *
              <input
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: event.target.value.toLowerCase() })
                }
                placeholder="kampus-utama"
              />
            </label>
            <label>
              Nama sekolah
              <input
                value={form.school_name}
                onChange={(event) =>
                  setForm({ ...form, school_name: event.target.value })
                }
                placeholder="SMP Langkah Bangsa"
              />
            </label>
            <label>
              Kepala sekolah
              <input
                value={form.principal_name}
                onChange={(event) =>
                  setForm({ ...form, principal_name: event.target.value })
                }
              />
            </label>
            <label>
              Telepon
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </label>
            <label className="form-wide">
              Alamat
              <input
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Membuat lokasi…" : "Tambah lokasi"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
