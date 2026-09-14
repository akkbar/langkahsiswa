import { SortableTable } from "../sortable-table";
import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { can, ErrorBox, type Catalog } from "../components";
import { api, send } from "../api";
import { PlanningDrawer } from "./subjects";
import "./planning.css";
import { ScheduleCalendar } from "./schedule-calendar";
const days = [
  "",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];
type Result = { rows: any[]; loads: any[] };
export function TimetablesPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [semester, setSemester] = useState(
    String(catalog.semesters?.[0]?.id || ""),
  );
  const [data, setData] = useState<Result>({ rows: [], loads: [] }),
    [preview, setPreview] = useState<Result | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [view, setView] = useState(
    () => localStorage.getItem("lesson-view") || "table",
  );
  const [form, setForm] = useState({
    days: [1, 2, 3, 4, 5],
    periods: 8,
    start: "07:00",
    break_after: 4,
    break_minutes: 30,
  });
  const [classFilter, setClassFilter] = useState("");
  useEffect(() => {
    if (!semester && catalog.semesters?.length)
      setSemester(catalog.semesters[0].id);
  }, [catalog.semesters, semester]);
  useEffect(() => {
    let active = true;
    setPreview(null);
    setData({ rows: [], loads: [] });
    setError("");
    if (semester)
      void api(`lesson-planning/schedule?semester_id=${semester}`)
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [semester]);
  useEffect(() => {
    setPage(1);
  }, [search, classFilter, view, semester]);
  const rows = data.rows.filter(
    (r) =>
      (!classFilter || r.class_id === classFilter) &&
      `${r.class_name} ${r.subject_name} ${r.teacher_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const loads = data.loads.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function generate(apply: boolean) {
    setBusy(true);
    setError("");
    try {
      const d = await send("lesson-planning/generate", {
        ...form,
        semester_id: semester,
        apply,
      });
      if (apply) {
        setData(await api(`lesson-planning/schedule?semester_id=${semester}`));
        setOpen(false);
        setPreview(null);
        setPage(1);
      } else setPreview(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="resource-page planning-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">ADMINISTRASI</span>
          <h1>Jadwal Pelajaran</h1>
        </div>
        <div className="page-actions">
          <input
            aria-label="Cari jadwal atau guru"
            placeholder="Cari kelas, pelajaran, guru"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="">Pilih semester</option>
            {catalog.semesters?.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.name)} -{" "}
                {String(
                  catalog["academic-years"]?.find(
                    (y) => y.id === s.academic_year_id,
                  )?.name || "",
                )}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter kelas"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">Semua kelas</option>
            {catalog.classes
              ?.filter(
                (c) =>
                  c.academic_year_id ===
                  catalog.semesters?.find((s) => s.id === semester)
                    ?.academic_year_id,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
          </select>
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            {[
              {
                value: "table",
                label: "Tabel jadwal",
                icon: (
                  <>
                    <rect x="3" y="4" width="18" height="16" rx="1" />
                    <path d="M3 9h18M3 14h18M9 4v16" />
                  </>
                ),
              },
              {
                value: "week",
                label: "Per hari",
                icon: (
                  <>
                    <rect x="3" y="4" width="18" height="16" rx="1" />
                    <path d="M9 4v16M15 4v16M3 9h18" />
                  </>
                ),
              },
              {
                value: "calendar",
                label: "Kalender",
                icon: (
                  <>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2M7 18h2" />
                  </>
                ),
              },
              {
                value: "load",
                label: "Beban guru",
                icon: (
                  <>
                    <path d="M4 3v18h17M8 17v-5M13 17V8M18 17V5" />
                  </>
                ),
              },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={view === mode.value ? "active" : ""}
                aria-label={mode.label}
                title={mode.label}
                aria-pressed={view === mode.value}
                onClick={() => {
                  setView(mode.value);
                  localStorage.setItem("lesson-view", mode.value);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {mode.icon}
                </svg>
              </button>
            ))}
          </div>
          {can(user, "academic.create") && (
            <button
              className="primary"
              disabled={!semester}
              onClick={() => {
                setOpen(true);
                setPreview(null);
                setError("");
              }}
            >
              Susun otomatis
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={!open ? error : ""} />
      <section className="card">
        <div className="table-wrap">
          {view === "calendar" ? (
            <ScheduleCalendar rows={rows} />
          ) : view === "load" ? (
            <SortableTable
              rowOffset={(page - 1) * 30}
              rowLimit={30}
              onSortChange={() => setPage(1)}
            >
              <thead>
                <tr>
                  <th>Guru</th>
                  <th>Bobot/pekan</th>
                  <th>Target menit</th>
                  <th>Terjadwal (menit)</th>
                  <th>Jam mengajar/pekan</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.weekly_weight}</td>
                    <td>{r.target_minutes}</td>
                    <td>{r.scheduled_minutes}</td>
                    <td>{(r.scheduled_minutes / 60).toFixed(1)} jam</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          ) : view === "week" ? (
            <div className="planning-week">
              {days.slice(1).map((day, i) => (
                <section key={day}>
                  <h3>{day}</h3>
                  {rows
                    .filter((r) => r.day_of_week === i + 1)
                    .slice(0, page * 12)
                    .map((r, j) => (
                      <article key={j}>
                        <strong>
                          {r.start_time.slice(0, 5)} - {r.end_time.slice(0, 5)}{" "}
                          | {r.class_name}
                        </strong>
                        <div>{r.subject_name}</div>
                        <small>{r.teacher_name}</small>
                      </article>
                    ))}
                </section>
              ))}
            </div>
          ) : (
            <SortableTable
              rowOffset={(page - 1) * 30}
              rowLimit={30}
              onSortChange={() => setPage(1)}
            >
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>Jam</th>
                  <th>Kelas</th>
                  <th>Mata pelajaran</th>
                  <th>Guru</th>
                  <th>Ruang</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>{days[r.day_of_week]}</td>
                    <td>
                      {r.start_time.slice(0, 5)} - {r.end_time.slice(0, 5)}
                    </td>
                    <td>{r.class_name}</td>
                    <td>{r.subject_name}</td>
                    <td>{r.teacher_name}</td>
                    <td>{r.room}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          )}
          {!(view === "load" ? loads : rows).length && (
            <div className="empty">
              {semester
                ? "Belum ada data yang sesuai. Gunakan Susun otomatis untuk membuat jadwal."
                : "Pilih semester terlebih dahulu."}
            </div>
          )}
        </div>
        {view === "week" && (
          <div className="pagination">
            <span>{rows.length} sesi per pekan</span>
            <button
              disabled={
                !days.some(
                  (_, i) =>
                    rows.filter((r) => r.day_of_week === i).length > page * 12,
                )
              }
              onClick={() => setPage(page + 1)}
            >
              Muat lebih banyak
            </button>
          </div>
        )}
        {view === "calendar" && (
          <div className="pagination">
            <span>{rows.length} sesi per pekan</span>
            <span>Pilih kelas untuk fokus. Klik pelajaran untuk detail.</span>
          </div>
        )}
        {view !== "week" && view !== "calendar" && (
          <div className="pagination">
            <span>{(view === "load" ? loads : rows).length} data</span>
            <div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <span> {page} </span>
              <button
                disabled={page * 30 >= (view === "load" ? loads : rows).length}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </section>
      {open && (
        <PlanningDrawer
          title="Susun jadwal otomatis"
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
        >
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void generate(false);
            }}
          >
            <p>
              Bobot mengikuti Mata Pelajaran di Yayasan. Guru mengikuti binding
              kelas yang sudah ada; kelas tanpa binding dipilih otomatis
              berdasarkan kompetensi tingkat dan beban guru.
            </p>
            <fieldset disabled={busy} onChange={() => setPreview(null)}>
              <legend>Waktu belajar</legend>
              <div className="planning-days">
                {days.slice(1).map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      checked={form.days.includes(i + 1)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          days: e.target.checked
                            ? [...form.days, i + 1].sort()
                            : form.days.filter((v) => v !== i + 1),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
              <label>
                Bobot maksimum per hari
                <input
                  type="number"
                  min={1}
                  max={16}
                  required
                  value={form.periods}
                  onChange={(e) =>
                    setForm({ ...form, periods: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Mulai belajar
                <input
                  type="time"
                  required
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </label>
              <label>
                Istirahat setelah bobot ke
                <input
                  type="number"
                  min={1}
                  max={16}
                  required
                  value={form.break_after}
                  onChange={(e) =>
                    setForm({ ...form, break_after: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Durasi istirahat (menit)
                <input
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={form.break_minutes}
                  onChange={(e) =>
                    setForm({ ...form, break_minutes: Number(e.target.value) })
                  }
                />
              </label>
            </fieldset>
            <button disabled={busy || !form.days.length}>Buat pratinjau</button>
          </form>
          {preview && (
            <>
              <div className="notice">
                {preview.rows.length} sesi siap. Menyimpan akan mengganti
                seluruh jadwal semester yang dipilih.
              </div>
              <div className="planning-preview">
                {preview.loads.map((r) => (
                  <p key={r.id}>
                    {r.name}: {r.weekly_weight} bobot / {r.target_minutes} menit
                    per pekan
                  </p>
                ))}
                <SortableTable>
                  <thead>
                    <tr>
                      <th>Hari/jam</th>
                      <th>Kelas/pelajaran</th>
                      <th>Guru</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {days[r.day_of_week]} {r.start_time}
                        </td>
                        <td>
                          {r.class_name}
                          <br />
                          {r.subject_name}
                        </td>
                        <td>{r.teacher_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </SortableTable>
              </div>
              <div className="school-drawer-actions">
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !can(user, "academic.update") ||
                    !can(user, "academic.delete")
                  }
                  onClick={() => void generate(true)}
                >
                  Simpan jadwal
                </button>
              </div>
            </>
          )}
        </PlanningDrawer>
      )}
    </div>
  );
}
