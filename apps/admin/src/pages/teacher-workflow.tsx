import React, { useEffect, useMemo, useState } from "react";
import type { Actor, Entity } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Empty, ErrorBox } from "../components";
import { SortableTable } from "../sortable-table";

type PlanItem = {
  id?: string;
  meeting_number: number;
  topic: string;
  learning_objective?: string;
  teacher_notes?: string;
  status?: string;
};
type Plan = Partial<Entity> & {
  academic_year_id: string;
  semester_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  title: string;
  description?: string;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string;
  items?: PlanItem[];
};
type TeachingLog = Partial<Entity> & {
  teacher_id: string;
  class_id: string;
  subject_id: string;
  semester_id: string;
  date: string;
  planned_topic?: string;
  actually_taught: string;
  completion_status?: string;
  teacher_notes?: string;
  next_meeting_note?: string;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string;
};

type Editor =
  | { kind: "plan"; mode: "new" | "edit" | "detail"; value: Plan }
  | { kind: "log"; mode: "new" | "detail"; value: TeachingLog };

const today = () => new Date().toLocaleDateString("en-CA");
const blankPlan = (): Plan => ({
  academic_year_id: "",
  semester_id: "",
  teacher_id: "",
  class_id: "",
  subject_id: "",
  title: "",
  description: "",
  items: [],
});
const blankLog = (): TeachingLog => ({
  teacher_id: "",
  class_id: "",
  subject_id: "",
  semester_id: "",
  date: today(),
  planned_topic: "",
  actually_taught: "",
  completion_status: "COMPLETED",
  teacher_notes: "",
  next_meeting_note: "",
});
function rows(data: unknown): any[] {
  return Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.data)
      ? (data as any).data
      : [];
}
function labelFor(items: Entity[], id: string) {
  const item = items.find((row) => row.id === id);
  return String(item?.name || item?.title || id || "—");
}
function ViewToggle({
  value,
  onChange,
  storageKey,
}: {
  value: string;
  onChange: (value: "table" | "cards") => void;
  storageKey: string;
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Mode tampilan">
      {[
        ["table", "Tabel", "M3 4h18v16H3zM3 9h18M9 4v16"],
        [
          "cards",
          "Kartu",
          "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
        ],
      ].map(([mode, title, path]) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          onClick={() => {
            onChange(mode as "table" | "cards");
            localStorage.setItem(storageKey, mode);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={path} />
          </svg>
        </button>
      ))}
    </div>
  );
}
function Drawer({
  editor,
  setEditor,
  busy,
  onSave,
  catalog,
}: {
  editor: Editor;
  setEditor: (editor: Editor | null) => void;
  busy: boolean;
  onSave: () => Promise<void>;
  catalog: Record<string, Entity[]>;
}) {
  const readOnly = editor.mode === "detail";
  const plan = editor.kind === "plan" ? editor.value : null;
  const log = editor.kind === "log" ? editor.value : null;
  useEffect(() => {
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && !busy && setEditor(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, setEditor]);
  const update = (field: string, value: unknown) =>
    setEditor({
      ...editor,
      value: { ...editor.value, [field]: value },
    } as Editor);
  return (
    <div className="school-drawer-layer">
      <button
        type="button"
        className="school-drawer-backdrop"
        aria-label="Tutup editor"
        disabled={busy}
        onClick={() => setEditor(null)}
      />
      <section
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={
          editor.kind === "plan"
            ? `${editor.mode === "new" ? "Tambah" : editor.mode === "edit" ? "Edit" : "Detail"} rencana mengajar`
            : `${editor.mode === "new" ? "Tambah" : "Detail"} jurnal mengajar`
        }
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">GURU</span>
            <h2>
              {editor.kind === "plan" ? "Rencana mengajar" : "Jurnal mengajar"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            disabled={busy}
            onClick={() => setEditor(null)}
          >
            ×
          </button>
        </div>
        <form
          className="school-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
        >
          {plan && (
            <>
              <label>
                Judul *
                <input
                  required
                  disabled={readOnly}
                  value={plan.title}
                  onChange={(e) => update("title", e.target.value)}
                />
              </label>
              <SelectField
                title="Tahun ajaran *"
                rows={catalog["academic-years"] || []}
                value={plan.academic_year_id}
                disabled={readOnly}
                onChange={(value) => update("academic_year_id", value)}
              />
              <SelectField
                title="Semester *"
                rows={catalog.semesters || []}
                value={plan.semester_id}
                disabled={readOnly}
                onChange={(value) => update("semester_id", value)}
              />
              <SelectField
                title="Guru *"
                rows={catalog.teachers || []}
                value={plan.teacher_id}
                disabled={readOnly}
                onChange={(value) => update("teacher_id", value)}
              />
              <SelectField
                title="Kelas *"
                rows={catalog.classes || []}
                value={plan.class_id}
                disabled={readOnly}
                onChange={(value) => update("class_id", value)}
              />
              <SelectField
                title="Mata pelajaran *"
                rows={catalog.subjects || []}
                value={plan.subject_id}
                disabled={readOnly}
                onChange={(value) => update("subject_id", value)}
              />
              <label>
                Deskripsi
                <textarea
                  disabled={readOnly}
                  value={plan.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
              <PlanItems
                items={plan.items || []}
                disabled={readOnly}
                onChange={(items) => update("items", items)}
              />
            </>
          )}
          {log && (
            <>
              <label>
                Tanggal *
                <input
                  type="date"
                  required
                  disabled={readOnly}
                  value={log.date}
                  onChange={(e) => update("date", e.target.value)}
                />
              </label>
              <SelectField
                title="Guru *"
                rows={catalog.teachers || []}
                value={log.teacher_id}
                disabled={readOnly}
                onChange={(value) => update("teacher_id", value)}
              />
              <SelectField
                title="Kelas *"
                rows={catalog.classes || []}
                value={log.class_id}
                disabled={readOnly}
                onChange={(value) => update("class_id", value)}
              />
              <SelectField
                title="Mata pelajaran *"
                rows={catalog.subjects || []}
                value={log.subject_id}
                disabled={readOnly}
                onChange={(value) => update("subject_id", value)}
              />
              <SelectField
                title="Semester *"
                rows={catalog.semesters || []}
                value={log.semester_id}
                disabled={readOnly}
                onChange={(value) => update("semester_id", value)}
              />
              <label>
                Topik rencana
                <input
                  disabled={readOnly}
                  value={log.planned_topic || ""}
                  onChange={(e) => update("planned_topic", e.target.value)}
                />
              </label>
              <label>
                Materi yang diajarkan *
                <textarea
                  required
                  disabled={readOnly}
                  value={log.actually_taught}
                  onChange={(e) => update("actually_taught", e.target.value)}
                />
              </label>
              <label>
                Status penyelesaian
                <select
                  disabled={readOnly}
                  value={log.completion_status || "COMPLETED"}
                  onChange={(e) => update("completion_status", e.target.value)}
                >
                  <option value="COMPLETED">Selesai</option>
                  <option value="PARTIAL">Sebagian</option>
                  <option value="NOT_COVERED">Belum terlaksana</option>
                </select>
              </label>
              <label>
                Catatan guru
                <textarea
                  disabled={readOnly}
                  value={log.teacher_notes || ""}
                  onChange={(e) => update("teacher_notes", e.target.value)}
                />
              </label>
              <label>
                Catatan pertemuan berikutnya
                <textarea
                  disabled={readOnly}
                  value={log.next_meeting_note || ""}
                  onChange={(e) => update("next_meeting_note", e.target.value)}
                />
              </label>
            </>
          )}
          <div className="school-drawer-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              {readOnly ? "Tutup" : "Batal"}
            </button>
            {!readOnly && (
              <button className="primary" disabled={busy} type="submit">
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
function SelectField({
  title,
  rows,
  value,
  disabled,
  onChange,
}: {
  title: string;
  rows: Entity[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {title}
      <select
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Pilih {title.replace(" *", "").toLowerCase()}</option>
        {rows.map((item) => (
          <option key={item.id} value={item.id}>
            {String(item.name || item.title || item.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
function PlanItems({
  items,
  disabled,
  onChange,
}: {
  items: PlanItem[];
  disabled: boolean;
  onChange: (items: PlanItem[]) => void;
}) {
  return (
    <fieldset>
      <legend>Pertemuan</legend>
      {items.map((item, index) => (
        <div className="teacher-plan-item" key={item.id || index}>
          <input
            aria-label={`Pertemuan ${index + 1}`}
            type="number"
            min="1"
            disabled={disabled}
            value={item.meeting_number}
            onChange={(e) =>
              onChange(
                items.map((row, i) =>
                  i === index
                    ? { ...row, meeting_number: Number(e.target.value) }
                    : row,
                ),
              )
            }
          />
          <input
            aria-label={`Topik ${index + 1}`}
            disabled={disabled}
            value={item.topic}
            placeholder="Topik"
            onChange={(e) =>
              onChange(
                items.map((row, i) =>
                  i === index ? { ...row, topic: e.target.value } : row,
                ),
              )
            }
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Hapus
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              { meeting_number: items.length + 1, topic: "" },
            ])
          }
        >
          Tambah pertemuan
        </button>
      )}
    </fieldset>
  );
}

export function TeacherDashboardPage({ user }: { user: Actor }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [date, setDate] = useState(today());
  useEffect(() => {
    let active = true;
    api(`teacher/dashboard?date=${date}`)
      .then((value) => active && setData(value))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [date]);
  const sessions = rows(data?.sessions);
  return (
    <div className="resource-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>Dashboard guru</h1>
        </div>
        <div className="page-actions">
          <label>
            Tanggal
            <input
              aria-label="Tanggal dashboard guru"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </div>
      <ErrorBox error={error} />
      <section className="dashboard-metrics">
        <article className="metric accent">
          <span>Jadwal hari ini</span>
          <strong>{sessions.length}</strong>
        </article>
        <article className="metric">
          <span>Jurnal selesai</span>
          <strong>
            {sessions.filter((session) => session.previous_reminder).length}
          </strong>
        </article>
      </section>
      <section className="card padded">
        <div className="shortcut-grid">
          {[
            ["Absensi", "attendance", "attendance.read"],
            ["Penilaian", "assessments", "grade.read"],
            ["Input Nilai", "grades", "grade.read"],
            ["Rencana Mengajar", "teaching-plans", "teaching_plan.read"],
            ["Jurnal Mengajar", "teaching-logs", "teaching_log.read"],
          ]
            .filter(([, , permission]) => can(user, permission))
            .map(([name, route]) => (
              <a href={`#${route}`} key={route}>
                <span>{name}</span>
                <strong>→</strong>
              </a>
            ))}
        </div>
      </section>
      <section className="card">
        <div className="section-title">
          <span className="eyebrow">JADWAL</span>
          <h2>Sesi hari ini</h2>
        </div>
        {!data ? (
          <Empty text="Memuat jadwal guru…" />
        ) : !sessions.length ? (
          <Empty text="Tidak ada jadwal mengajar pada tanggal ini." />
        ) : (
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Jam</th>
                  <th>Kelas</th>
                  <th>Mata pelajaran</th>
                  <th>Guru</th>
                  <th>Catatan sebelumnya</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      {session.start_time}–{session.end_time}
                    </td>
                    <td>{session.class_name || "—"}</td>
                    <td>{session.subject_name || "—"}</td>
                    <td>{session.teacher_name || "—"}</td>
                    <td>{session.previous_reminder || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
      </section>
    </div>
  );
}

export function TeachingPlansPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Record<string, Entity[]>;
}) {
  return <WorkflowList kind="plan" user={user} catalog={catalog} />;
}
export function TeachingLogsPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Record<string, Entity[]>;
}) {
  return <WorkflowList kind="log" user={user} catalog={catalog} />;
}
function WorkflowList({
  kind,
  user,
  catalog,
}: {
  kind: "plan" | "log";
  user: Actor;
  catalog: Record<string, Entity[]>;
}) {
  const isPlan = kind === "plan";
  const permission = isPlan ? "teaching_plan" : "teaching_log";
  const [data, setData] = useState<(Plan | TeachingLog)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [view, setView] = useState(
    () => localStorage.getItem(`${permission}-view`) || "table",
  );
  const load = async () => {
    setLoading(true);
    try {
      setData(rows(await api(`teacher/${isPlan ? "plans" : "logs"}`)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [kind]);
  const filtered = useMemo(
    () =>
      data.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
      ),
    [data, search],
  );
  async function save() {
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      if (editor.kind === "plan") {
        const { id, ...body } = editor.value;
        await send(
          id ? `teacher/plans/${id}` : "teacher/plans",
          body,
          id ? "PATCH" : "POST",
        );
      } else await send("teacher/logs", editor.value);
      setEditor(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openPlan(plan: Plan, mode: "edit" | "detail") {
    setBusy(true);
    try {
      setEditor({
        kind: "plan",
        mode,
        value: await api(`teacher/plans/${plan.id}`),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="resource-page teacher-workflow-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>{isPlan ? "Rencana mengajar" : "Jurnal mengajar"}</h1>
        </div>
        <div className="page-actions">
          <input
            type="search"
            aria-label={`Cari ${isPlan ? "rencana mengajar" : "jurnal mengajar"}`}
            placeholder="Cari"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ViewToggle
            value={view}
            storageKey={`${permission}-view`}
            onChange={setView}
          />
          {can(user, `${permission}.create`) && (
            <button
              className="primary"
              onClick={() =>
                setEditor(
                  isPlan
                    ? { kind: "plan", mode: "new", value: blankPlan() }
                    : { kind: "log", mode: "new", value: blankLog() },
                )
              }
            >
              Tambah {isPlan ? "rencana" : "jurnal"}
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      <section className="card">
        {loading ? (
          <Empty text={`Memuat ${isPlan ? "rencana" : "jurnal"} mengajar…`} />
        ) : !filtered.length ? (
          <Empty
            text={`Belum ada ${isPlan ? "rencana" : "jurnal"} mengajar.`}
          />
        ) : view === "cards" ? (
          <div className="teacher-workflow-cards">
            {filtered.map((row) => (
              <article key={row.id}>
                <h3>
                  {isPlan
                    ? (row as Plan).title
                    : (row as TeachingLog).actually_taught}
                </h3>
                <p>
                  {row.class_name ||
                    labelFor(catalog.classes || [], row.class_id)}{" "}
                  ·{" "}
                  {row.subject_name ||
                    labelFor(catalog.subjects || [], row.subject_id)}
                </p>
                <button
                  onClick={() =>
                    isPlan
                      ? void openPlan(row as Plan, "detail")
                      : setEditor({
                          kind: "log",
                          mode: "detail",
                          value: row as TeachingLog,
                        })
                  }
                >
                  Detail
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>{isPlan ? "Rencana" : "Tanggal"}</th>
                  <th>Kelas</th>
                  <th>Mata pelajaran</th>
                  <th>Guru</th>
                  <th data-sortable={false}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {isPlan ? (row as Plan).title : (row as TeachingLog).date}
                    </td>
                    <td>
                      {row.class_name ||
                        labelFor(catalog.classes || [], row.class_id)}
                    </td>
                    <td>
                      {row.subject_name ||
                        labelFor(catalog.subjects || [], row.subject_id)}
                    </td>
                    <td>
                      {row.teacher_name ||
                        labelFor(catalog.teachers || [], row.teacher_id)}
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          isPlan
                            ? void openPlan(
                                row as Plan,
                                can(user, `${permission}.update`)
                                  ? "edit"
                                  : "detail",
                              )
                            : setEditor({
                                kind: "log",
                                mode: "detail",
                                value: row as TeachingLog,
                              })
                        }
                      >
                        {can(user, `${permission}.update`) && isPlan
                          ? "Edit"
                          : "Detail"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        )}
      </section>
      {editor && (
        <Drawer
          editor={editor}
          setEditor={setEditor}
          busy={busy}
          onSave={save}
          catalog={catalog}
        />
      )}
    </div>
  );
}
