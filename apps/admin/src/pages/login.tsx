import React, { useState, useEffect } from "react";
import type {
  Actor,
  Entity,
  Page,
} from "../../../../packages/shared-types/src";
import {
  Catalog,
  can,
  statusLabels,
  label,
  ErrorBox,
  Empty,
  Select,
  FieldInput,
} from "../components";
import { send, setToken } from "../api";
export function Login({ onLogin }: { onLogin: (user: Actor) => void }) {
  const [form, setForm] = useState({
    tenant_slug: "demo",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await send("auth/login", form);
      setToken(data.access_token);
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brandmark">S</span>SchoolApp
        </div>
        <div>
          <span className="eyebrow">RUANG KERJA AKADEMIK</span>
          <h1>
            Administrasi tertata.
            <br />
            Belajar lebih bermakna.
          </h1>
          <p>
            Satu tempat untuk data sekolah, kehadiran, penilaian, dan laporan
            hasil belajar.
          </p>
        </div>
        <p className="story-footer">Sekolah · Guru · Siswa · Orang tua</p>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <span className="eyebrow">SELAMAT DATANG</span>
          <h2>Masuk ke sekolah Anda</h2>
          <p className="muted">
            Gunakan akun yang diberikan administrator sekolah.
          </p>
          <ErrorBox error={error} />
          <label>
            Kode sekolah
            <input
              autoComplete="organization"
              required
              value={form.tenant_slug}
              onChange={(e) =>
                setForm({ ...form, tenant_slug: e.target.value })
              }
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              placeholder="nama@sekolah.sch.id"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Kata sandi
            <input
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Memeriksa akun…" : "Masuk ke SchoolApp →"}
          </button>
        </form>
        <p className="muted small">
          Akses data mengikuti peran dan sekolah Anda.
        </p>
      </section>
    </main>
  );
}
