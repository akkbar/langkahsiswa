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
import { send } from "../api";
export function UsersPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roles: ["STAFF"],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PENGATURAN AKSES</span>
          <h1>Permission dan Role Setting</h1>
          <p className="muted">
            Satu akun dapat memiliki beberapa peranan. Permission pengguna
            mengikuti seluruh role yang dipilih.
          </p>
        </div>
      </div>
      <ErrorBox error={error} />
      {message && <p className="notice success">{message}</p>}
      <form
        className="card padded"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await send("users", form);
            await refresh();
            setMessage("Akun dibuat.");
            setForm({
              name: "",
              email: "",
              password: "",
              roles: ["STAFF"],
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Nama
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Kata sandi awal
            <input
              required
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Peran dan permission awal</legend>
            {[
              ["STAFF", "Staff"],
              ["TEACHER", "Guru"],
              ["PRINCIPAL", "Kepala Sekolah"],
              ["FINANCE", "Keuangan"],
              ...(user.roles.some((role) =>
                ["SUPER_ADMIN", "FOUNDATION_HEAD"].includes(role),
              )
                ? [
                    ["FOUNDATION_STAFF", "Staff Yayasan"],
                    ["FOUNDATION_HEAD", "Kepala Yayasan"],
                  ]
                : []),
              ["PARENT", "Orang Tua / Wali"],
              ["STUDENT", "Siswa"],
              ["CANTEEN_ADMIN", "Administrator Kantin"],
            ].map(([role, title]) => (
              <label className="check" key={role}>
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      roles: e.target.checked
                        ? [...form.roles, role]
                        : form.roles.filter((r) => r !== role),
                    })
                  }
                />
                {title}
              </label>
            ))}
          </fieldset>
        </div>
        <button className="primary" disabled={busy || !form.roles.length}>
          {busy ? "Menyimpan…" : "Buat akun"}
        </button>
      </form>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {catalog.users?.map((u) => (
                <tr key={u.id}>
                  <td>{String(u.name)}</td>
                  <td>{String(u.email)}</td>
                  <td>{Array.isArray(u.roles) ? u.roles.join(", ") : "—"}</td>
                  <td>
                    {String(u.status || (u.active ? "ACTIVE" : "LOCKED"))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
