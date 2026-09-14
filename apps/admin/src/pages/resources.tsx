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
import { api, send } from "../api";
import { resources, Field } from "../../../../packages/validation/src";
export function ResourcePage({
  resource,
  user,
  catalog,
  refresh,
  headerActions,
  extraColumn,
  rowActions,
}: {
  headerActions?: React.ReactNode;
  extraColumn?: { title: string; render: (row: Entity) => React.ReactNode };
  rowActions?: (row: Entity) => React.ReactNode;
  resource: string;
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const definition = resources[resource];
  const [result, setResult] = useState<Page<Entity>>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<{
    row: Entity | null;
    mode: "create" | "edit" | "detail";
  } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const gradeLevelsLocked =
    resource === "grade-levels" &&
    (catalog.schools || []).some((school) =>
      ["SD", "SMP", "SMA"].includes(String(school.school_level)),
    );
  const creatable =
    !gradeLevelsLocked && can(user, `${definition.permission}.create`);
  const editable =
    !gradeLevelsLocked && can(user, `${definition.permission}.update`);
  const deletable =
    !gradeLevelsLocked && can(user, `${definition.permission}.delete`);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<Page<Entity>>(
      `${resource}?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
    )
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resource, page, search, version]);
  useEffect(() => {
    if (!editor) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEditor(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editor, busy]);
  function open(row: Entity | null, mode: "create" | "edit" | "detail") {
    const initial: Record<string, unknown> = {};
    for (const f of definition.fields)
      initial[f.key] =
        (f.type === "time" && row?.[f.key]
          ? String(row[f.key]).slice(0, 5)
          : row?.[f.key]) ??
        (f.type === "checkbox" ? false : f.options?.[0] || "");
    setForm(initial);
    setEditor({ row, mode });
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data: Record<string, any> = {};
      for (const f of definition.fields) {
        let value = form[f.key];
        if (editor?.mode === "edit" && definition.immutable?.includes(f.key))
          continue;
        if (value === "" && f.optional) value = null;
        data[f.key] = value;
      }
      await send(
        `${resource}${editor?.row ? `/${editor.row.id}` : ""}`,
        data,
        editor?.row ? "PATCH" : "POST",
      );
      await refresh();
      setVersion((v) => v + 1);
      setEditor(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Entity) {
    if (!window.confirm(`Hapus ${definition.title.toLowerCase()} ini?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`${resource}/${row.id}`, { method: "DELETE" });
      await refresh();
      setVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function display(row: Entity, f: Field) {
    const value = row[f.key];
    if (value === null || value === undefined) return "—";
    if (f.resource)
      return label(
        catalog[f.resource]?.find((r) => r.id === value),
        f.resource,
        catalog,
      );
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (typeof value === "string" && statusLabels[value])
      return statusLabels[value];
    return String(value);
  }
  return (
    <div className="resource-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{definition.group}</span>
          <h1>{definition.title}</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label={`Cari ${definition.title}`}
              placeholder="Cari data…"
              type="search"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <span className="muted">{result.total} data</span>
          </div>
          {headerActions}
          {creatable && (
            <button className="primary" onClick={() => open(null, "create")}>
              + Tambah{" "}
              {definition.title === "Pengaturan Sekolah"
                ? "sekolah"
                : definition.title.toLowerCase()}
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={!editor ? error : ""} />
      {gradeLevelsLocked && (
        <p className="notice">
          Tingkat kelas dibuat otomatis berdasarkan jenjang sekolah dan tidak
          dapat diubah manual.
        </p>
      )}
      <section className="card">
        {loading ? (
          <div className="empty" role="status">
            Memuat data…
          </div>
        ) : result.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {definition.fields.slice(0, 5).map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  {extraColumn && <th>{extraColumn.title}</th>}
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr key={row.id}>
                    {definition.fields.slice(0, 5).map((f) => (
                      <td key={f.key}>{display(row, f)}</td>
                    ))}
                    {extraColumn && <td>{extraColumn.render(row)}</td>}
                    <td className="actions">
                      {rowActions?.(row)}
                      <button onClick={() => open(row, "detail")}>
                        Detail
                      </button>
                      {editable && (
                        <button onClick={() => open(row, "edit")}>Edit</button>
                      )}
                      {deletable && (
                        <button
                          disabled={busy}
                          onClick={() => void remove(row)}
                        >
                          Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <div className="pagination">
          <span>
            Halaman {page} dari {Math.max(1, Math.ceil(result.total / 20))}
          </span>
          <div>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Sebelumnya
            </button>
            <button
              disabled={page * 20 >= result.total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya →
            </button>
          </div>
        </div>
      </section>
      {editor && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label={`Tutup editor ${definition.title}`}
            disabled={busy}
            onClick={() => setEditor(null)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${editor.mode === "create" ? "Tambah" : editor.mode === "edit" ? "Edit" : "Detail"} ${definition.title}`}
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {editor.mode === "create"
                    ? "DATA BARU"
                    : editor.mode === "edit"
                      ? "EDIT DATA"
                      : "DETAIL DATA"}
                </span>
                <h2>
                  {editor.mode === "create"
                    ? "Tambah"
                    : editor.mode === "edit"
                      ? "Edit"
                      : "Detail"}{" "}
                  {definition.title}
                </h2>
              </div>
              <button
                aria-label="Tutup"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {editor.mode === "detail" ? (
              <>
                <dl className="detail-list">
                  {definition.fields.map((f) => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>{display(editor.row!, f)}</dd>
                    </div>
                  ))}
                </dl>
                <button onClick={() => setEditor(null)}>Tutup</button>
              </>
            ) : (
              <form className="school-editor-form" onSubmit={save}>
                <div className="form-grid">
                  {definition.fields.map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      value={form[f.key]}
                      onChange={(v) => setForm({ ...form, [f.key]: v })}
                      catalog={catalog}
                      disabled={
                        busy ||
                        (editor.mode === "edit" &&
                          definition.immutable?.includes(f.key))
                      }
                    />
                  ))}
                </div>
                <div className="school-drawer-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    Batal
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan data"}
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
