import React, { useEffect, useRef, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, ErrorBox, type Catalog } from "../components";
import { SortableTable } from "../sortable-table";
import { PlanningDrawer } from "./subjects";
import "./grades.css";
type Subject = {
  id: string;
  subject_id: string;
  semester_id: string;
  teacher_id: string;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  semester_name: string;
  year_name: string;
};
type Assessment = {
  id: string;
  name: string;
  max_score: number;
  weight: number;
};
type Student = { id: string; name: string; nis: string };
type Score = {
  student_id: string;
  assessment_id: string;
  score: number;
  version: string;
};
type Matrix = {
  assessments: Assessment[];
  students: Student[];
  scores: Score[];
  locked: boolean;
};
const keyOf = (student: string, assessment: string) =>
  `${student}:${assessment}`;
export function ScoresPage({ user }: { user: Actor; catalog: Catalog }) {
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [group, setGroup] = useState(""),
    [classSubject, setClassSubject] = useState("");
  const [contextError, setContextError] = useState(""),
    [contextLoading, setContextLoading] = useState(true);
  const [matrix, setMatrix] = useState<Matrix | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({}),
    [status, setStatus] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(false),
    [historyStudent, setHistoryStudent] = useState(""),
    [historyAssessment, setHistoryAssessment] = useState(""),
    [historyPage, setHistoryPage] = useState(1),
    [logs, setLogs] = useState<{ data: any[]; total: number }>({
      data: [],
      total: 0,
    }),
    [historyError, setHistoryError] = useState(""),
    [historyLoading, setHistoryLoading] = useState(false);
  const invalidKeys = useRef(new Set<string>());
  const requests = useRef(new Map<string, Promise<void>>());
  const [pending, setPending] = useState(0),
    [version, setVersion] = useState(0),
    [limit, setLimit] = useState(30);
  useEffect(() => {
    let active = true;
    void api("assessment-plans")
      .then((data) => {
        if (active)
          setSubjects(
            data.current_teacher_id
              ? data.subjects.filter(
                  (s: Subject) => s.teacher_id === data.current_teacher_id,
                )
              : data.subjects,
          );
      })
      .catch((e) => {
        if (active) setContextError(e.message);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const groups = Array.from(
    new Map(
      subjects.map((s) => [
        `${s.subject_id}:${s.semester_id}`,
        {
          value: `${s.subject_id}:${s.semester_id}`,
          label: `${s.subject_name} · ${s.semester_name} ${s.year_name}`,
        },
      ]),
    ).values(),
  );
  const classes = subjects.filter(
    (s) => `${s.subject_id}:${s.semester_id}` === group,
  );
  const selected = classes.find((s) => s.id === classSubject);
  useEffect(() => {
    let active = true;
    setMatrix(null);
    setDraft({});
    invalidKeys.current.clear();
    setStatus({});
    setError("");
    setLimit(30);
    if (!classSubject) return;
    setLoading(true);
    void api(`grades/matrix?class_subject_id=${classSubject}`)
      .then((data) => {
        if (active) setMatrix(data);
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
  }, [classSubject, version]);
  useEffect(() => setLimit(30), [search]);
  const saved = Object.fromEntries(
    (matrix?.scores || []).map((s) => [
      keyOf(s.student_id, s.assessment_id),
      s,
    ]),
  );
  const changed = Object.entries(draft).filter(
    ([key, value]) => value !== (saved[key] ? String(saved[key].score) : ""),
  );
  const unsavedCount = new Set([
    ...changed.map(([key]) => key),
    ...invalidKeys.current,
  ]).size;
  const dirty = unsavedCount > 0 || pending > 0;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function saveCell(student: Student, assessment: Assessment) {
    const key = keyOf(student.id, assessment.id);
    if (invalidKeys.current.has(key)) return Promise.resolve();
    if (requests.current.has(key)) return requests.current.get(key)!;
    const value = draft[key] ?? (saved[key] ? String(saved[key].score) : "");
    if (value === (saved[key] ? String(saved[key].score) : ""))
      return Promise.resolve();
    const number = value === "" ? null : Number(value);
    if (
      number !== null &&
      (!Number.isFinite(number) ||
        number < 0 ||
        number > assessment.max_score ||
        Math.abs(number * 1000 - Math.round(number * 1000)) > 0.00001)
    ) {
      setStatus((s) => ({
        ...s,
        [key]: `Nilai harus 0–${assessment.max_score}, maksimal 3 desimal.`,
      }));
      return Promise.resolve();
    }
    setStatus((s) => ({ ...s, [key]: "saving" }));
    setPending((n) => n + 1);
    const request = (async () => {
      try {
        const result = await send(
          "grades/cell",
          {
            student_id: student.id,
            assessment_id: assessment.id,
            score: number,
            expected_version: saved[key]?.version || null,
          },
          "PUT",
        );
        setMatrix((m) =>
          m
            ? {
                ...m,
                scores: [
                  ...m.scores.filter(
                    (s) => keyOf(s.student_id, s.assessment_id) !== key,
                  ),
                  ...(result.score === null
                    ? []
                    : [
                        {
                          student_id: student.id,
                          assessment_id: assessment.id,
                          score: result.score,
                          version: result.version,
                        },
                      ]),
                ],
              }
            : m,
        );
        setDraft((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
        setStatus((s) => ({ ...s, [key]: "saved" }));
      } catch (e) {
        setStatus((s) => ({ ...s, [key]: (e as Error).message }));
      } finally {
        requests.current.delete(key);
        setPending((n) => n - 1);
      }
    })();
    requests.current.set(key, request);
    return request;
  }
  async function retry() {
    if (!matrix) return;
    await Promise.all(
      matrix.students.flatMap((student) =>
        matrix.assessments.map((a) => saveCell(student, a)),
      ),
    );
  }
  useEffect(() => {
    if (!history || !classSubject) return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError("");
    void api(
      `grades/history?class_subject_id=${classSubject}&page=${historyPage}${historyStudent ? `&student_id=${historyStudent}` : ""}${historyAssessment ? `&assessment_id=${historyAssessment}` : ""}`,
    )
      .then((data) => {
        if (active) setLogs(data);
      })
      .catch((e) => {
        if (active) setHistoryError(e.message);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [history, classSubject, historyPage, historyStudent, historyAssessment]);
  const writable = can(user, "grade.write") && !matrix?.locked;
  const rows = (matrix?.students || []).filter((s) =>
    `${s.name} ${s.nis}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="resource-page score-matrix-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>Input Nilai</h1>
        </div>
        <div className="page-actions">
          <select
            aria-label="Penilaian mata pelajaran dan semester"
            disabled={dirty || contextLoading}
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setClassSubject("");
            }}
          >
            <option value="">Pilih penilaian / mata pelajaran</option>
            {groups.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Kelas"
            disabled={!group || dirty}
            value={classSubject}
            onChange={(e) => setClassSubject(e.target.value)}
          >
            <option value="">Pilih kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_name} · {c.teacher_name}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Cari siswa"
            placeholder="Cari siswa atau NIS"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={dirty}
          />
          <button
            disabled={!matrix || pending > 0}
            onClick={() => {
              setHistoryPage(1);
              setHistoryStudent("");
              setHistoryAssessment("");
              setHistory(true);
            }}
          >
            Riwayat perubahan
          </button>
        </div>
      </div>
      <ErrorBox error={contextError || error} />
      {selected && (
        <div className="score-matrix-summary">
          <strong>
            {selected.subject_name} · {selected.class_name}
          </strong>
          <span>
            {matrix?.students.length || 0} siswa ·{" "}
            {matrix?.assessments.length || 0} item penilaian
          </span>
          <span>
            {matrix?.locked
              ? "Terkunci: rapor sudah direview."
              : writable
                ? "Otomatis tersimpan saat Enter atau keluar dari sel. Kosong berarti belum dinilai."
                : "Akses baca saja."}
          </span>
        </div>
      )}
      <section className="card">
        <div
          className="table-wrap"
          onScroll={(e) => {
            const node = e.currentTarget;
            if (node.scrollHeight - node.scrollTop - node.clientHeight < 100)
              setLimit((n) => Math.min(n + 30, rows.length));
          }}
        >
          {contextLoading || loading ? (
            <div className="empty">Memuat data...</div>
          ) : !matrix ? (
            <div className="empty">
              {subjects.length
                ? "Pilih penilaian sesuai mata pelajaran dan semester, kemudian pilih kelas."
                : "Belum ada pelajaran kelas yang ditugaskan kepada akun ini."}
            </div>
          ) : !matrix.assessments.length ? (
            <div className="empty">
              Belum ada item penilaian untuk kelas ini. Atur melalui Guru &gt;
              Penilaian terlebih dahulu.
            </div>
          ) : !rows.length ? (
            <div className="empty">Tidak ada siswa yang sesuai.</div>
          ) : (
            <SortableTable
              key={classSubject}
              className="score-matrix"
              rowLimit={limit}
              onSortChange={() => setLimit(30)}
            >
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>NIS</th>
                  {matrix.assessments.map((a) => (
                    <th key={a.id}>
                      <span>
                        {a.name}
                        <small>
                          {Number(a.weight).toLocaleString("id-ID", {
                            maximumFractionDigits: 3,
                          })}
                          % · Maks. {a.max_score}
                        </small>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>{student.nis}</td>
                    {matrix.assessments.map((a) => {
                      const key = keyOf(student.id, a.id),
                        value =
                          draft[key] ??
                          (saved[key] ? String(saved[key].score) : ""),
                        state = status[key],
                        failure =
                          state &&
                          !["saving", "saved", "changed"].includes(state);
                      return (
                        <td
                          key={a.id}
                          data-sort-value={saved[key]?.score ?? ""}
                        >
                          <input
                            className={
                              state === "saved" ? "score-cell-saved" : undefined
                            }
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            min={0}
                            max={a.max_score}
                            aria-label={`${student.name} — ${a.name}`}
                            aria-invalid={Boolean(failure)}
                            aria-describedby={
                              state
                                ? `score-status-${student.id}-${a.id}`
                                : undefined
                            }
                            value={value}
                            disabled={!writable || state === "saving"}
                            placeholder="—"
                            onChange={(e) => {
                              if (e.currentTarget.validity.badInput)
                                invalidKeys.current.add(key);
                              else invalidKeys.current.delete(key);
                              setDraft((d) => ({
                                ...d,
                                [key]: e.target.value,
                              }));
                              setStatus((s) => ({
                                ...s,
                                [key]: invalidKeys.current.has(key)
                                  ? "Masukkan angka yang valid."
                                  : "changed",
                              }));
                            }}
                            onBlur={() => void saveCell(student, a)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                          />
                          {state && (
                            <small
                              id={`score-status-${student.id}-${a.id}`}
                              className={
                                failure
                                  ? "score-cell-error"
                                  : state === "saved"
                                    ? "score-cell-saved-note"
                                    : ""
                              }
                              role={failure ? "alert" : undefined}
                            >
                              {state === "saving"
                                ? "Menyimpan..."
                                : state === "saved"
                                  ? "Tersimpan"
                                  : state === "changed"
                                    ? "Belum tersimpan"
                                    : state}
                            </small>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          )}
        </div>
        {matrix && (
          <div className="pagination">
            <span role="status">
              {pending
                ? `${pending} nilai sedang disimpan`
                : unsavedCount
                  ? `${unsavedCount} nilai belum tersimpan`
                  : "Semua perubahan tersimpan"}
            </span>
            <div>
              {unsavedCount > 0 && (
                <>
                  <button disabled={pending > 0} onClick={() => void retry()}>
                    Simpan perubahan
                  </button>
                  <button
                    disabled={pending > 0}
                    onClick={() => {
                      setDraft({});
                      invalidKeys.current.clear();
                      setStatus({});
                      setVersion((v) => v + 1);
                    }}
                  >
                    Batalkan & muat ulang
                  </button>
                </>
              )}
              <button disabled={dirty} onClick={() => setVersion((v) => v + 1)}>
                Muat ulang
              </button>
            </div>
          </div>
        )}
      </section>
      {history && (
        <PlanningDrawer
          title="Riwayat perubahan nilai"
          busy={false}
          error={historyError}
          onClose={() => setHistory(false)}
        >
          <div className="stack-form">
            <label>
              Siswa
              <select
                value={historyStudent}
                onChange={(e) => {
                  setHistoryStudent(e.target.value);
                  setHistoryPage(1);
                }}
              >
                <option value="">Semua siswa</option>
                {matrix?.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Item penilaian
              <select
                value={historyAssessment}
                onChange={(e) => {
                  setHistoryAssessment(e.target.value);
                  setHistoryPage(1);
                }}
              >
                <option value="">Semua item</option>
                {matrix?.assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {historyLoading ? (
              <p>Memuat riwayat...</p>
            ) : !logs.data.length ? (
              <p>Belum ada perubahan nilai yang tercatat.</p>
            ) : (
              <ol className="score-history">
                {logs.data.map((log) => (
                  <li key={log.id}>
                    <strong>
                      {log.student_name} · {log.assessment_name}
                    </strong>
                    <p>
                      {log.old_score ?? "Kosong"} → {log.new_score ?? "Kosong"}
                    </p>
                    <small>
                      {log.actor_name} ·{" "}
                      {new Date(log.created_at).toLocaleString("id-ID")} ·{" "}
                      {log.action === "CREATE"
                        ? "Input awal"
                        : log.action === "DELETE"
                          ? "Dikosongkan"
                          : "Diubah"}
                    </small>
                  </li>
                ))}
              </ol>
            )}
            <div className="pagination">
              <span>{logs.total} perubahan</span>
              <div>
                <button
                  disabled={historyLoading || historyPage === 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Sebelumnya
                </button>
                <button
                  disabled={historyLoading || historyPage * 50 >= logs.total}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </div>
        </PlanningDrawer>
      )}
    </div>
  );
}
