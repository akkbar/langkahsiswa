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
  catalog,
  refresh,
}: {
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roles: ["STAFF"],
  });
  const [level, setLevel] = useState<"OPERATIONAL" | "FAMILY">("OPERATIONAL");
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
            Atur level akun dan role awal. Permission pengguna mengikuti role
            yang dipilih.
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
            setForm({ name: "", email: "", password: "", roles: ["STAFF"] });
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
            <legend>Level akun</legend>
            {(["OPERATIONAL", "FAMILY"] as const).map((value) => (
              <label className="check" key={value}>
                <input
                  type="radio"
                  name="account-level"
                  checked={level === value}
                  onChange={() => {
                    setLevel(value);
                    setForm({
                      ...form,
                      roles: [value === "OPERATIONAL" ? "STAFF" : "PARENT"],
                    });
                  }}
                />
                {value === "OPERATIONAL" ? "Operational" : "Siswa & wali"}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Peran dan permission awal</legend>
            {(level === "OPERATIONAL"
              ? [
                  ["STAFF", "Staff"],
                  ["TEACHER", "Guru"],
                  ["PRINCIPAL", "Kepala Sekolah"],
                  ["FOUNDATION_STAFF", "Staff Yayasan"],
                  ["FOUNDATION_HEAD", "Kepala Yayasan"],
                ]
              : [
                  ["PARENT", "Orang Tua / Wali"],
                  ["STUDENT", "Siswa"],
                ]
            ).map(([role, title]) => (
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
                <th>Level</th>
                <th>Peran</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {catalog.users?.map((u) => (
                <tr key={u.id}>
                  <td>{String(u.name)}</td>
                  <td>{String(u.email)}</td>
                  <td>
                    {u.account_level === "FAMILY"
                      ? "Siswa & wali"
                      : "Operational"}
                  </td>
                  <td>{Array.isArray(u.roles) ? u.roles.join(", ") : "—"}</td>
                  <td>{u.active ? "Aktif" : "Nonaktif"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
