import { SortableTable } from "../sortable-table";
import React, { useEffect, useMemo, useState } from "react";
import type { Actor, Entity } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Catalog, Empty, ErrorBox } from "../components";

type RoleOption = {
  id: string;
  name: string;
  account_level: "OPERATIONAL" | "FAMILY" | "TENANT";
  scope_level: "PLATFORM" | "FOUNDATION" | "SCHOOL";
};

const realmLabels = {
  OPERATIONAL: "Operational",
  FAMILY: "Family",
  TENANT: "Tenant",
};

function rolesOf(account: Entity) {
  return Array.isArray(account.roles) ? account.roles.map(String) : [];
}

export function SchoolAccountsPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [drawer, setDrawer] = useState<"create" | "roles" | null>(null);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const accounts = catalog.users || [];
  const editable = can(user, "user.update");

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!query) return accounts;
    return accounts.filter((account) =>
      [account.name, account.email, rolesOf(account).join(" ")]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(query),
    );
  }, [accounts, search]);
  const visible = filtered.slice(0, visibleLimit);

  useEffect(() => setVisibleLimit(30), [search]);
  useEffect(() => {
    if (!drawer) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeDrawer();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawer, busy]);

  function closeDrawer() {
    if (busy) return;
    setDrawer(null);
    setSelected(null);
    setError("");
  }

  async function loadRoles() {
    setLoadingDetail(true);
    try {
      const result = await api<{ roles: RoleOption[] }>("roles");
      setRoleOptions(
        result.roles.filter(
          (role) =>
            role.id !== "SUPER_ADMIN" || user.roles.includes("SUPER_ADMIN"),
        ),
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }

  function openCreate() {
    setDrawer("create");
    setSelected(null);
    setSelectedRoles([]);
    setForm({ name: "", email: "", password: "" });
    setError("");
    void loadRoles();
  }

  function openRoles(account: Entity) {
    setDrawer("roles");
    setSelected(account);
    setSelectedRoles(rolesOf(account));
    setError("");
    void loadRoles();
  }

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoles((current) => {
      if (!checked) return current.filter((id) => id !== roleId);
      const realm = roleOptions.find(
        (role) => role.id === roleId,
      )?.account_level;
      const sameRealm = current.filter(
        (id) =>
          roleOptions.find((role) => role.id === id)?.account_level === realm,
      );
      return [...new Set([...sameRealm, roleId])];
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedRoles.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (drawer === "create")
        await send("users", { ...form, roles: selectedRoles });
      else if (selected)
        await send(
          `users/${selected.id}/roles`,
          { set: selectedRoles },
          "PATCH",
        );
      await refresh();
      setMessage(
        drawer === "create"
          ? "Akun berhasil dibuat dan diberi role."
          : "Role akun berhasil diperbarui.",
      );
      setDrawer(null);
      setSelected(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="resource-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PENGATURAN</span>
          <h1>Semua Akun</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              type="search"
              aria-label="Cari akun"
              placeholder="Cari nama, email, atau role…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {can(user, "user.create") && (
            <button className="primary" onClick={openCreate}>
              + Tambah akun
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={drawer ? "" : error} />
      {message && <p className="notice success">{message}</p>}
      <section className="card">
        {!visible.length ? (
          <Empty text={search ? "Akun tidak ditemukan." : "Belum ada akun."} />
        ) : (
          <div
            className="table-wrap"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (
                element.scrollTop + element.clientHeight >=
                  element.scrollHeight - 80 &&
                visibleLimit < filtered.length
              )
                setVisibleLimit((current) => current + 30);
            }}
          >
            <SortableTable
              rowLimit={visibleLimit}
              onSortChange={() => setVisibleLimit(30)}
            >
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Role</th>
                  <th>Status</th>
                  {editable && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => {
                  const assigned = rolesOf(account);
                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{String(account.name)}</strong>
                        <br />
                        <span className="muted">{String(account.email)}</span>
                      </td>
                      <td>{assigned.join(", ") || "—"}</td>
                      <td>{String(account.status || "ACTIVE")}</td>
                      {editable && (
                        <td>
                          <button
                            disabled={account.id === user.id}
                            onClick={() => openRoles(account)}
                          >
                            Atur role
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </SortableTable>
            {visible.length < filtered.length && (
              <div className="table-lazy-status" role="status">
                Scroll untuk memuat akun berikutnya…
              </div>
            )}
          </div>
        )}
      </section>

      {drawer && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup editor akun"
            disabled={busy}
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-role-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {drawer === "create" ? "AKUN BARU" : "ROLE AKUN"}
                </span>
                <h2 id="account-role-title">
                  {drawer === "create" ? "Tambah akun" : String(selected?.name)}
                </h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={closeDrawer}>
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {loadingDetail ? (
              <p className="muted">Memuat pilihan role…</p>
            ) : (
              <form
                className="school-editor-form account-role-form"
                onSubmit={save}
              >
                {drawer === "create" && (
                  <div className="form-grid">
                    <label>
                      Nama *
                      <input
                        required
                        autoFocus
                        value={form.name}
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email *
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm({ ...form, email: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Kata sandi awal *
                      <input
                        required
                        type="password"
                        minLength={12}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(event) =>
                          setForm({ ...form, password: event.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                <fieldset>
                  <legend>Role dan realm account</legend>
                  <p className="muted small">
                    Satu akun dapat memiliki beberapa role selama seluruhnya
                    berada dalam realm yang sama.
                  </p>
                  {!roleOptions.length && (
                    <span className="muted">Belum ada role.</span>
                  )}
                  {roleOptions.map((role) => (
                    <label className="account-role-option" key={role.id}>
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.id)}
                        onChange={(event) =>
                          toggleRole(role.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>
                          {realmLabels[role.account_level]} · {role.scope_level}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="school-drawer-actions">
                  <button type="button" disabled={busy} onClick={closeDrawer}>
                    Batal
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !selectedRoles.length}
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
