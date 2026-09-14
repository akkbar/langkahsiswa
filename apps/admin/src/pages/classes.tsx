import { SortableTable } from "../sortable-table";
import React, { useMemo, useState } from "react";
import type { Actor, Entity } from "../../../../packages/shared-types/src";
import type { Catalog } from "../components";
import { can, Empty, ErrorBox, label } from "../components";
import { send } from "../api";

type ClassView = "big-thumbnail" | "table";
type ClassForm = {
  academic_year_id: string;
  grade_level_id: string;
  name: string;
  homeroom_teacher_id: string;
};

const viewStorageKey = "langkahsiswa:classes:view";

function initialView(): ClassView {
  return localStorage.getItem(viewStorageKey) === "table"
    ? "table"
    : "big-thumbnail";
}

function byLevel(a: Entity, b: Entity) {
  return (
    Number(a.level || 0) - Number(b.level || 0) ||
    String(a.name).localeCompare(String(b.name), "id")
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 4v16" />
    </svg>
  );
}

export function ClassesPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const years = catalog["academic-years"] || [];
  const levels = useMemo(
    () => [...(catalog["grade-levels"] || [])].sort(byLevel),
    [catalog],
  );
  const teachers = catalog.teachers || [];
  const classes = catalog.classes || [];
  const enrollments = catalog["class-students"] || [];
  const [view, setView] = useState<ClassView>(initialView);
  const [yearFilter, setYearFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [editor, setEditor] = useState<Entity | "new" | null>(null);
  const [form, setForm] = useState<ClassForm>({
    academic_year_id: String(
      years.find((year) => year.is_active)?.id || years[0]?.id || "",
    ),
    grade_level_id: String(levels[0]?.id || ""),
    name: "",
    homeroom_teacher_id: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = can(user, "school.write");

  const visibleClasses = useMemo(
    () =>
      classes
        .filter(
          (row) =>
            (!yearFilter || row.academic_year_id === yearFilter) &&
            (!levelFilter || row.grade_level_id === levelFilter),
        )
        .sort((a, b) => {
          const aLevel = levels.find((item) => item.id === a.grade_level_id);
          const bLevel = levels.find((item) => item.id === b.grade_level_id);
          return (
            byLevel(aLevel || a, bLevel || b) ||
            String(a.name).localeCompare(String(b.name), "id", {
              numeric: true,
            })
          );
        }),
    [classes, levels, levelFilter, yearFilter],
  );

  function chooseView(next: ClassView) {
    setView(next);
    localStorage.setItem(viewStorageKey, next);
  }

  function openNew() {
    const preferredYear =
      yearFilter ||
      years.find((year) => year.is_active)?.id ||
      years[0]?.id ||
      "";
    setForm({
      academic_year_id: String(preferredYear),
      grade_level_id: String(levelFilter || levels[0]?.id || ""),
      name: "",
      homeroom_teacher_id: "",
    });
    setError("");
    setEditor("new");
  }

  function openEdit(row: Entity) {
    setForm({
      academic_year_id: String(row.academic_year_id || ""),
      grade_level_id: String(row.grade_level_id || ""),
      name: String(row.name || ""),
      homeroom_teacher_id: String(row.homeroom_teacher_id || ""),
    });
    setError("");
    setEditor(row);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const editing = editor !== "new" && editor !== null;
      const payload = editing
        ? {
            name: form.name.trim(),
            homeroom_teacher_id: form.homeroom_teacher_id || null,
          }
        : {
            ...form,
            name: form.name.trim(),
            homeroom_teacher_id: form.homeroom_teacher_id || null,
          };
      await send(
        `classes${editing ? `/${editor.id}` : ""}`,
        payload,
        editing ? "PATCH" : "POST",
      );
      await refresh();
      setEditor(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const levelName = (row: Entity) =>
    String(
      levels.find((item) => item.id === row.grade_level_id)?.name ||
        "Tingkat belum tersedia",
    );
  const yearName = (row: Entity) =>
    label(
      years.find((item) => item.id === row.academic_year_id),
      "academic-years",
      catalog,
    );
  const teacherName = (row: Entity) =>
    row.homeroom_teacher_id
      ? label(
          teachers.find((item) => item.id === row.homeroom_teacher_id),
          "teachers",
          catalog,
        )
      : "Belum ditentukan";
  const studentCount = (row: Entity) =>
    enrollments.filter((item) => item.class_id === row.id).length;

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YAYASAN</span>
          <h1>Kelas</h1>
          <p className="muted">
            Atur beberapa kelas dalam tingkat yang sama, seperti 7A, 7B, dan 7C.
          </p>
        </div>
        <div className="page-actions">
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            <button
              className={view === "big-thumbnail" ? "active" : ""}
              aria-label="Tampilan kartu"
              title="Tampilan kartu"
              onClick={() => chooseView("big-thumbnail")}
            >
              <GridIcon />
            </button>
            <button
              className={view === "table" ? "active" : ""}
              aria-label="Tampilan tabel"
              title="Tampilan tabel"
              onClick={() => chooseView("table")}
            >
              <TableIcon />
            </button>
          </div>
          {writable && (
            <button className="primary" onClick={openNew}>
              + Tambah kelas
            </button>
          )}
        </div>
      </div>

      <ErrorBox error={!editor ? error : ""} />
      <section className="class-filter-bar card">
        <label>
          Tahun ajaran
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="">Semua tahun ajaran</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {String(year.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tingkat kelas
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">Semua tingkat</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {String(level.name)}
              </option>
            ))}
          </select>
        </label>
        <strong>{visibleClasses.length} kelas</strong>
      </section>

      {!visibleClasses.length ? (
        <section className="card">
          <Empty text="Belum ada kelas pada pilihan ini. Tambahkan kelas pertama untuk tingkat tersebut." />
        </section>
      ) : view === "big-thumbnail" ? (
        <section className="class-list" aria-label="Daftar kelas">
          {visibleClasses.map((row) => (
            <article className="class-card card" key={row.id}>
              {writable && (
                <button
                  className="thumbnail-menu-button class-card-menu"
                  aria-label={`Edit kelas ${String(row.name)}`}
                  title="Edit kelas"
                  onClick={() => openEdit(row)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M5 12h14M5 17h14" />
                  </svg>
                </button>
              )}
              <div className="class-card-mark" aria-hidden="true">
                {String(row.name).slice(0, 3).toUpperCase()}
              </div>
              <div className="class-card-body">
                <span className="eyebrow">{levelName(row)}</span>
                <h2>{String(row.name)}</h2>
                <dl className="class-card-meta">
                  <div>
                    <dt>Tahun ajaran</dt>
                    <dd>{yearName(row)}</dd>
                  </div>
                  <div>
                    <dt>Wali kelas</dt>
                    <dd>{teacherName(row)}</dd>
                  </div>
                  <div>
                    <dt>Siswa</dt>
                    <dd>{studentCount(row)} siswa</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="card class-table">
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Nama kelas</th>
                  <th>Tingkat</th>
                  <th>Tahun ajaran</th>
                  <th>Wali kelas</th>
                  <th>Siswa</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{String(row.name)}</strong>
                    </td>
                    <td>{levelName(row)}</td>
                    <td>{yearName(row)}</td>
                    <td>{teacherName(row)}</td>
                    <td>{studentCount(row)}</td>
                    <td>
                      {writable && (
                        <button onClick={() => openEdit(row)}>Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </section>
      )}

      {editor && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup editor kelas"
            disabled={busy}
            onClick={() => setEditor(null)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-editor-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">KELAS</span>
                <h2 id="class-editor-title">
                  {editor === "new" ? "Tambah kelas" : "Edit kelas"}
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
            <form
              className="school-editor-form class-editor-form"
              onSubmit={save}
            >
              <label>
                Tahun ajaran *
                <select
                  required
                  disabled={editor !== "new"}
                  value={form.academic_year_id}
                  onChange={(e) =>
                    setForm({ ...form, academic_year_id: e.target.value })
                  }
                >
                  <option value="">Pilih tahun ajaran</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {String(year.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tingkat kelas *
                <select
                  required
                  disabled={editor !== "new"}
                  value={form.grade_level_id}
                  onChange={(e) =>
                    setForm({ ...form, grade_level_id: e.target.value })
                  }
                >
                  <option value="">Pilih tingkat kelas</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {String(level.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nama kelas *
                <input
                  required
                  autoFocus
                  maxLength={120}
                  placeholder="Contoh: 7A"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Wali kelas
                <select
                  value={form.homeroom_teacher_id}
                  onChange={(e) =>
                    setForm({ ...form, homeroom_teacher_id: e.target.value })
                  }
                >
                  <option value="">Belum ditentukan</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {String(teacher.name)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="notice class-form-note">
                Satu tingkat dapat memiliki banyak kelas. Gunakan nama yang
                berbeda, misalnya 7A, 7B, dan 7C.
              </p>
              <div className="school-drawer-actions">
                <button className="primary" disabled={busy} type="submit">
                  {busy ? "Menyimpan…" : "Simpan kelas"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
