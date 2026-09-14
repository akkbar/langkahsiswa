import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, ErrorBox } from "../components";
import { SortableTable } from "../sortable-table";
import { PlanningDrawer } from "./subjects";
import "./assessment-plans.css";
type Item = {
  id?: string;
  name: string;
  weight: number;
  max_score: number;
  due_date: string;
  score_count?: number;
};
type Subject = {
  id: string;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  teacher_id: string;
  semester_name: string;
  year_name: string;
  start_date: string;
  end_date: string;
};
type Plan = {
  items: Item[];
  defaults: Item[];
  revision: string;
  locked: boolean;
  semester: { start_date: string; end_date: string };
};
export function AssessmentPlansPage({
  user,
  refresh,
}: {
  user: Actor;
  refresh: () => Promise<void>;
}) {
  const [context, setContext] = useState<{
    subjects: Subject[];
    current_teacher_id: string | null;
    can_view_all: boolean;
  }>({ subjects: [], current_teacher_id: null, can_view_all: false });
  const [teacher, setTeacher] = useState("mine"),
    [subjectId, setSubjectId] = useState(""),
    [plan, setPlan] = useState<Plan | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [view, setView] = useState(
    () => localStorage.getItem("assessment-plan-view") || "table",
  );
  const [editor, setEditor] = useState<{
    items: Item[];
    revision: string;
    detail: boolean;
    semester: Plan["semester"];
  } | null>(null);
  useEffect(() => {
    let active = true;
    void api("assessment-plans")
      .then((data) => {
        if (!active) return;
        setContext(data);
        if (!data.current_teacher_id && data.can_view_all) setTeacher("all");
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
  }, []);
  const available = context.subjects.filter(
    (s) =>
      teacher === "all" ||
      s.teacher_id ===
        (teacher === "mine" ? context.current_teacher_id : teacher),
  );
  const selected = available.find((s) => s.id === subjectId);
  useEffect(() => {
    if (!available.some((s) => s.id === subjectId))
      setSubjectId(available[0]?.id || "");
  }, [context, teacher, subjectId]);
  useEffect(() => {
    let active = true;
    setPlan(null);
    setError("");
    setMessage("");
    if (!subjectId) return;
    setLoading(true);
    void api(`assessment-plans/${subjectId}`)
      .then((data) => {
        if (active) setPlan(data);
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
  }, [subjectId]);
  const editable = Boolean(
    plan &&
    !plan.locked &&
    (can(user, "grade.update") ||
      (!plan.items.length && can(user, "grade.create"))),
  );
  async function openEditor(detail = false) {
    setBusy(true);
    setError("");
    try {
      const data: Plan = await api(`assessment-plans/${subjectId}`);
      setPlan(data);
      setEditor({
        items: (data.items.length ? data.items : data.defaults).map((i) => ({
          ...i,
          weight: Math.round(i.weight * 1000) / 1000,
        })),
        revision: data.revision,
        detail: detail || data.locked,
        semester: data.semester,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      await send(
        `assessment-plans/${subjectId}`,
        {
          revision: editor.revision,
          items: editor.items.map(
            ({ id, name, weight, max_score, due_date }) => ({
              ...(id ? { id } : {}),
              name,
              weight,
              max_score,
              due_date,
            }),
          ),
        },
        "PUT",
      );
      setPlan(await api(`assessment-plans/${subjectId}`));
      setEditor(null);
      setMessage("Item penilaian dan bobot berhasil disimpan.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => setVisibleLimit(30), [search, view, subjectId]);
  const total =
    editor?.items.reduce(
      (sum, i) => sum + (Number.isFinite(i.weight) ? i.weight : 0),
      0,
    ) || 0;
  const rows = (plan?.items || []).filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );
  function update(index: number, key: keyof Item, value: string | number) {
    if (!editor) return;
    setEditor({
      ...editor,
      items: editor.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    });
  }
  const teachers = Array.from(
    new Map(
      context.subjects.map((s) => [s.teacher_id, s.teacher_name]),
    ).entries(),
  );
  return (
    <div className="resource-page assessment-plan-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>Penilaian</h1>
        </div>
        <div className="page-actions">
          <input
            type="search"
            aria-label="Cari item penilaian"
            placeholder="Cari item penilaian"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {context.can_view_all && (
            <select
              disabled={busy}
              aria-label="Guru pengampu"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            >
              {context.current_teacher_id && (
                <option value="mine">Pelajaran saya</option>
              )}
              <option value="all">Semua guru</option>
              {teachers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <select
            disabled={busy}
            aria-label="Pelajaran kelas dan semester"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Pilih pelajaran kelas</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.class_name} · {s.subject_name} · {s.semester_name}{" "}
                {s.year_name}
              </option>
            ))}
          </select>
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            <button
              type="button"
              title="Tabel"
              aria-label="Tabel"
              aria-pressed={view === "table"}
              className={view === "table" ? "active" : ""}
              onClick={() => {
                setView("table");
                localStorage.setItem("assessment-plan-view", "table");
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="1" />
                <path d="M3 9h18M3 14h18M9 4v16" />
              </svg>
            </button>
            <button
              type="button"
              title="Kartu"
              aria-label="Kartu"
              aria-pressed={view === "cards"}
              className={view === "cards" ? "active" : ""}
              onClick={() => {
                setView("cards");
                localStorage.setItem("assessment-plan-view", "cards");
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </div>
          {editable && (
            <button
              className="primary"
              disabled={busy || loading}
              onClick={() => void openEditor()}
            >
              {plan?.items.length
                ? "Atur item & bobot"
                : "Gunakan item default"}
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={!editor ? error : ""} />
      {message && <div className="notice success">{message}</div>}
      {selected && (
        <div className="assessment-plan-summary">
          <strong>{selected.teacher_name}</strong>
          <span>{plan?.items.length || 0} item</span>
          <span>
            Total bobot{" "}
            {(
              plan?.items.reduce((sum, i) => sum + i.weight, 0) || 0
            ).toLocaleString("id-ID", { maximumFractionDigits: 3 })}
            %
          </span>
          {plan?.locked && (
            <span>Penilaian terkunci: rapor sudah direview.</span>
          )}
        </div>
      )}
      <section className="card">
        <div
          className="table-wrap"
          onScroll={(event) => {
            const node = event.currentTarget;
            if (node.scrollHeight - node.scrollTop - node.clientHeight < 100)
              setVisibleLimit((n) => Math.min(n + 30, rows.length));
          }}
        >
          {loading ? (
            <div className="empty">Memuat penilaian...</div>
          ) : !selected ? (
            <div className="empty">
              Belum ada pelajaran kelas yang ditugaskan kepada akun ini.
              Hubungkan akun guru dan penugasan kelas terlebih dahulu.
            </div>
          ) : !rows.length ? (
            <div className="empty">
              {plan?.items.length
                ? "Tidak ada item yang cocok."
                : "Belum ada item penilaian. Gunakan item default sebagai awal, lalu sesuaikan nama dan bobotnya."}
            </div>
          ) : view === "cards" ? (
            <div className="assessment-plan-cards">
              {rows.slice(0, visibleLimit).map((item) => (
                <article key={item.id}>
                  <h3>{item.name}</h3>
                  <strong>
                    {item.weight.toLocaleString("id-ID", {
                      maximumFractionDigits: 3,
                    })}
                    %
                  </strong>
                  <p>
                    {item.due_date} · Maksimum {item.max_score}
                  </p>
                  <small>{item.score_count || 0} nilai tersimpan</small>
                </article>
              ))}
            </div>
          ) : (
            <SortableTable
              rowLimit={visibleLimit}
              onSortChange={() => setVisibleLimit(30)}
            >
              <thead>
                <tr>
                  <th>Item penilaian</th>
                  <th>Bobot (%)</th>
                  <th>Nilai maksimum</th>
                  <th>Tanggal</th>
                  <th>Nilai tersimpan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td data-sort-value={item.weight}>
                      {item.weight.toLocaleString("id-ID", {
                        maximumFractionDigits: 3,
                      })}
                      %
                    </td>
                    <td>{item.max_score}</td>
                    <td data-sort-value={item.due_date}>
                      {new Date(item.due_date + "T00:00:00").toLocaleDateString(
                        "id-ID",
                      )}
                    </td>
                    <td>{item.score_count || 0} siswa</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          )}
        </div>
      </section>
      {editor && (
        <PlanningDrawer
          title={
            editor.detail
              ? "Detail item penilaian"
              : "Atur item & bobot penilaian"
          }
          busy={busy}
          error={error}
          onClose={() => setEditor(null)}
        >
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p>
              {selected?.class_name} · {selected?.subject_name}
              <br />
              {selected?.semester_name} {selected?.year_name}
            </p>
            <div
              className={`notice ${Math.abs(total - 100) < 0.00001 ? "success" : ""}`}
            >
              Total bobot{" "}
              {total.toLocaleString("id-ID", { maximumFractionDigits: 3 })}% /
              100%. Remidi ikut dihitung sebagai item berbobot.
            </div>
            {editor.items.map((item, index) => (
              <fieldset
                key={item.id || `new-${index}`}
                disabled={busy || editor.detail}
                className="assessment-plan-item"
              >
                <legend>Item {index + 1}</legend>
                <div className="form-grid">
                  <label>
                    Nama item
                    <input
                      required
                      maxLength={120}
                      value={item.name}
                      onChange={(e) => update(index, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    Bobot (%)
                    <input
                      required
                      type="number"
                      min={0.001}
                      max={100}
                      step={0.001}
                      value={item.weight}
                      onChange={(e) =>
                        update(index, "weight", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Nilai maksimum
                    <input
                      required
                      type="number"
                      min={0.001}
                      max={10000}
                      step="any"
                      value={item.max_score}
                      onChange={(e) =>
                        update(index, "max_score", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Tanggal
                    <input
                      required
                      type="date"
                      min={editor.semester.start_date}
                      max={editor.semester.end_date}
                      value={item.due_date}
                      onChange={(e) =>
                        update(index, "due_date", e.target.value)
                      }
                    />
                  </label>
                </div>
                {!editor.detail && (!item.id || can(user, "grade.delete")) && (
                  <button
                    type="button"
                    disabled={Boolean(item.score_count)}
                    title={
                      item.score_count
                        ? "Item sudah memiliki nilai siswa"
                        : undefined
                    }
                    onClick={() =>
                      setEditor({
                        ...editor,
                        items: editor.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Hapus item
                  </button>
                )}
                {Boolean(item.score_count) && (
                  <small>
                    {item.score_count} nilai tersimpan; item ini tidak dapat
                    dihapus.
                  </small>
                )}
              </fieldset>
            ))}
            {!editor.detail && (
              <>
                {can(user, "grade.create") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        items: [
                          ...editor.items,
                          {
                            name: "",
                            weight: 5,
                            max_score: 100,
                            due_date: editor.semester.start_date,
                          },
                        ],
                      })
                    }
                  >
                    + Tambah item
                  </button>
                )}
                <div className="school-drawer-actions">
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !editor.items.length ||
                      Math.abs(total - 100) > 0.00001
                    }
                  >
                    Simpan penilaian
                  </button>
                </div>
              </>
            )}
          </form>
        </PlanningDrawer>
      )}
    </div>
  );
}
