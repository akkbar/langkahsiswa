import React, { useEffect, useMemo, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { ErrorBox } from "../components";
import { api, send } from "../api";

type Realm = "OPERATIONAL" | "FAMILY" | "TENANT";
type Scope = "SCHOOL" | "FOUNDATION";
type RoleSetting = {
  id: string;
  name: string;
  account_level: Realm;
  scope_level: "PLATFORM" | Scope;
  is_system: boolean;
  permissions?: string[];
  permission_count: number;
  account_count: number;
};
type PermissionSetting = { id: string; realms: Realm[] };
type RoleForm = {
  name: string;
  account_level: Realm;
  scope_level: Scope;
  permissions: string[];
};

const realmLabels: Record<Realm, string> = {
  OPERATIONAL: "Operational",
  FAMILY: "Family",
  TENANT: "Tenant",
};
const scopeLabels: Record<string, string> = {
  PLATFORM: "Platform",
  FOUNDATION: "Yayasan",
  SCHOOL: "Sekolah",
};
const areaLabels: Record<string, string> = {
  academic: "Akademik",
  academic_setup: "Setup akademik",
  admission: "PPDB",
  attendance: "Absensi",
  audit: "Audit & keamanan",
  boarding: "Boarding school",
  domain: "Domain",
  event: "Agenda",
  family: "Keluarga",
  file: "Berkas",
  finance: "Keuangan",
  foundation: "Yayasan",
  grade: "Input nilai",
  library: "Perpustakaan",
  notification: "Notifikasi",
  payment: "Pembayaran",
  people: "Guru & staff",
  pos: "Kasir",
  report: "Raport",
  school: "Sekolah",
  site: "Situs sekolah",
  student: "Siswa",
  user: "Akun pengguna",
  wallet: "Dompet",
  website: "Website",
};
const actionLabels: Record<string, string> = {
  approve: "Setujui",
  calculate: "Hitung",
  create: "Tambah",
  delete: "Hapus",
  manage: "Kelola",
  own: "Data sendiri",
  publish: "Publikasi",
  read: "Lihat",
  review: "Review",
  update: "Ubah",
  verify: "Verifikasi",
  write: "Kelola",
};

const emptyForm = (): RoleForm => ({
  name: "",
  account_level: "OPERATIONAL",
  scope_level: "SCHOOL",
  permissions: [],
});

function permissionLabel(permission: string) {
  if (permission === "*") return "Semua akses";
  const [area, ...rest] = permission.split(".");
  const action = rest.join(".");
  return `${areaLabels[area] || area} — ${actionLabels[action] || action}`;
}

export function UsersPage({
  user,
}: {
  user: Actor;
  catalog?: unknown;
  refresh?: () => Promise<void>;
}) {
  const [roles, setRoles] = useState<RoleSetting[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<
    PermissionSetting[]
  >([]);
  const [editor, setEditor] = useState<RoleSetting | "new" | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const canManage = user.permissions.includes("*");

  async function load() {
    setLoading(true);
    try {
      const result = await api<{
        roles: RoleSetting[];
      }>("roles");
      setRoles(result.roles);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editor) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEditor(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editor, busy]);

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter((role) =>
      [
        role.name,
        realmLabels[role.account_level],
        scopeLabels[role.scope_level],
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [roles, search]);

  const availablePermissions = useMemo(
    () =>
      permissionCatalog.filter((permission) =>
        permission.realms.includes(form.account_level),
      ),
    [permissionCatalog, form.account_level],
  );
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionSetting[]>();
    for (const permission of availablePermissions) {
      const area =
        permission.id === "*" ? "Semua akses" : permission.id.split(".")[0];
      groups.set(area, [...(groups.get(area) || []), permission]);
    }
    return [...groups.entries()];
  }, [availablePermissions]);

  async function openEditor(role?: RoleSetting) {
    setError("");
    setMessage("");
    setDetailLoading(true);
    if (role) {
      setEditor(role);
    } else {
      setEditor("new");
      setForm(emptyForm());
    }
    try {
      if (role) {
        const result = await api<{
          role: RoleSetting & { permissions: string[] };
          permissions: PermissionSetting[];
        }>(`roles/${role.id}`);
        setPermissionCatalog(result.permissions);
        setForm({
          name: result.role.name,
          account_level: result.role.account_level,
          scope_level:
            result.role.scope_level === "FOUNDATION" ? "FOUNDATION" : "SCHOOL",
          permissions: result.role.permissions,
        });
      } else {
        const result = await api<{ permissions: PermissionSetting[] }>(
          "roles/permissions",
        );
        setPermissionCatalog(result.permissions);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDrawer() {
    if (!busy) setEditor(null);
  }

  function changeRealm(account_level: Realm) {
    const allowed = new Set(
      permissionCatalog
        .filter((permission) => permission.realms.includes(account_level))
        .map((permission) => permission.id),
    );
    setForm((current) => ({
      ...current,
      account_level,
      scope_level:
        account_level === "OPERATIONAL" ? current.scope_level : "SCHOOL",
      permissions: current.permissions.filter((permission) =>
        allowed.has(permission),
      ),
    }));
  }

  return (
    <div className="resource-page role-settings-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PENGATURAN</span>
          <h1>Role Setting</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari role"
              placeholder="Cari role…"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {canManage && (
            <button className="primary" onClick={() => void openEditor()}>
              + Tambah role
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={!editor ? error : ""} />
      {message && <p className="notice success">{message}</p>}
      <section className="card">
        <div className="toolbar">
          <div>
            <strong>Daftar role</strong>
            <div className="muted">
              Staff Yayasan dan Guru sama-sama berada di realm Operational,
              tetapi permission masing-masing dapat berbeda.
            </div>
          </div>
          <span className="badge">{filteredRoles.length} role</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role name</th>
                <th>Realm account</th>
                <th>Cakupan</th>
                <th>Permission</th>
                <th>Dipakai</th>
                {canManage && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.id}>
                  <td>
                    {role.name}
                    {role.is_system && (
                      <span className="role-system-label">Bawaan</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">
                      {realmLabels[role.account_level]}
                    </span>
                  </td>
                  <td>{scopeLabels[role.scope_level]}</td>
                  <td>{role.permission_count}</td>
                  <td>{role.account_count} akun</td>
                  {canManage && (
                    <td>
                      <button
                        disabled={role.id === "SUPER_ADMIN"}
                        onClick={() => void openEditor(role)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !filteredRoles.length && (
            <div className="empty">
              {search
                ? "Role tidak ditemukan."
                : "Belum ada role yang tersedia."}
            </div>
          )}
          {loading && <div className="empty">Memuat role…</div>}
        </div>
      </section>

      {editor && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup editor role"
            disabled={busy}
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-setting-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">ROLE SETTING</span>
                <h2 id="role-setting-title">
                  {editor === "new" ? "Tambah role" : `Edit ${editor.name}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Tutup"
                disabled={busy}
                onClick={closeDrawer}
              >
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {detailLoading ? (
              <p className="muted">Memuat data role…</p>
            ) : (
              <form
                className="school-editor-form role-setting-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    if (editor === "new") await send("roles", form);
                    else await send(`roles/${editor.id}`, form, "PATCH");
                    await load();
                    setEditor(null);
                    setMessage(
                      editor === "new"
                        ? "Role berhasil ditambahkan."
                        : "Role dan permission berhasil diperbarui.",
                    );
                  } catch (caught) {
                    setError((caught as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid">
                  <label>
                    Role name *
                    <input
                      required
                      autoFocus
                      disabled={editor !== "new" && editor.is_system}
                      minLength={2}
                      maxLength={80}
                      value={form.name}
                      placeholder="Contoh: Guru Mata Pelajaran"
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Realm account *
                    <select
                      value={form.account_level}
                      disabled={editor !== "new" && editor.is_system}
                      onChange={(event) =>
                        changeRealm(event.target.value as Realm)
                      }
                    >
                      {Object.entries(realmLabels).map(([value, title]) => (
                        <option key={value} value={value}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cakupan akses *
                    <select
                      value={form.scope_level}
                      disabled={
                        form.account_level !== "OPERATIONAL" ||
                        (editor !== "new" && editor.is_system)
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          scope_level: event.target.value as Scope,
                        })
                      }
                    >
                      <option value="SCHOOL">Sekolah</option>
                      <option value="FOUNDATION">Yayasan</option>
                    </select>
                  </label>
                </div>
                <div className="permission-heading">
                  <div>
                    <strong>Permission</strong>
                    <p className="muted small">
                      Hanya permission untuk realm{" "}
                      {realmLabels[form.account_level]} yang ditampilkan.
                    </p>
                  </div>
                  <span className="badge">
                    {form.permissions.length} dipilih
                  </span>
                </div>
                <div className="permission-groups">
                  {groupedPermissions.map(([area, permissions]) => (
                    <fieldset key={area}>
                      <legend>{areaLabels[area] || area}</legend>
                      {permissions.map((permission) => (
                        <label className="check" key={permission.id}>
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(permission.id)}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                permissions: event.target.checked
                                  ? [...current.permissions, permission.id]
                                  : current.permissions.filter(
                                      (item) => item !== permission.id,
                                    ),
                              }))
                            }
                          />
                          {permissionLabel(permission.id)}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                <div className="school-drawer-actions">
                  <button type="button" disabled={busy} onClick={closeDrawer}>
                    Batal
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !form.name.trim()}
                  >
                    {busy ? "Menyimpan…" : "Simpan role"}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
