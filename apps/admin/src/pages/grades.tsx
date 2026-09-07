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
export function ScoresPage({
  catalog,
  user,
}: {
  catalog: Catalog;
  user: Actor;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const assessment = catalog.assessments?.find((a) => a.id === assessmentId);
  const category = catalog["assessment-categories"]?.find(
    (c) => c.id === assessment?.category_id,
  );
  const cs = catalog["class-subjects"]?.find(
    (c) => c.id === category?.class_subject_id,
  );
  const students = (catalog["class-students"] || [])
    .filter((r) => r.class_id === cs?.class_id)
    .map((r) => catalog.students?.find((s) => s.id === r.student_id))
    .filter(Boolean) as Entity[];
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setScores({});
    setError("");
    setMessage("");
    if (assessmentId)
      api(`grades?assessment_id=${assessmentId}`)
        .then((data) => {
          if (active) {
            setScores(
              Object.fromEntries(
                data.data.map((r: any) => [r.student_id, String(r.score)]),
              ),
            );
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [assessmentId]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await send(
        "grades",
        {
          assessment_id: assessmentId,
          scores: students
            .filter((s) => scores[s.id] !== undefined && scores[s.id] !== "")
            .map((s) => ({ student_id: s.id, score: Number(scores[s.id]) })),
        },
        "PUT",
      );
      setMessage(
        "Nilai berhasil disimpan. Draft raport terkait perlu dihitung ulang.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">GRADEBOOK</span>
          <h1>Input nilai</h1>
          <p className="muted">
            Nilai dinormalisasi ke skala 100, lalu dihitung menurut bobot
            kategori.
          </p>
        </div>
      </div>
      <form onSubmit={save}>
        <section className="card filter-grid">
          <label>
            Penilaian
            <select
              aria-label="Penilaian"
              required
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value)}
            >
              <option value="">Pilih penilaian</option>
              {(catalog.assessments || []).map((a) => {
                const c = catalog["assessment-categories"]?.find(
                  (c) => c.id === a.category_id,
                );
                return (
                  <option key={a.id} value={a.id}>
                    {label(
                      catalog["class-subjects"]?.find(
                        (cs) => cs.id === c?.class_subject_id,
                      ),
                      "class-subjects",
                      catalog,
                    )}{" "}
                    · {String(a.name)}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="stat">
            <span className="muted">Nilai maksimum</span>
            <strong>{String(assessment?.max_score ?? "—")}</strong>
          </div>
          <div className="stat">
            <span className="muted">Bobot kategori</span>
            <strong>{category ? `${category.weight}%` : "—"}</strong>
          </div>
        </section>
        <ErrorBox error={error} />
        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        <section className="card">
          {!loaded ? (
            <Empty
              text={
                assessmentId
                  ? "Memuat nilai…"
                  : "Pilih penilaian untuk mengisi nilai siswa."
              }
            />
          ) : !students.length ? (
            <Empty text="Belum ada siswa dalam kelas ini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>NIS</th>
                    <th>Siswa</th>
                    <th>Nilai</th>
                    <th>Kelengkapan</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.nis)}</td>
                      <td>{String(s.name)}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={Number(assessment?.max_score)}
                          aria-label={`Nilai ${s.name}`}
                          placeholder="Belum dinilai"
                          value={scores[s.id] ?? ""}
                          disabled={!can(user, "grade.write")}
                          onChange={(e) =>
                            setScores({ ...scores, [s.id]: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <span className="badge">
                          {scores[s.id] !== undefined && scores[s.id] !== ""
                            ? "Terisi"
                            : "Belum dinilai"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {can(user, "grade.write") && (
            <div className="form-footer">
              <span className="muted">
                Kolom kosong tetap belum dinilai, bukan nol.
              </span>
              <button
                className="primary"
                disabled={!loaded || busy || !students.length}
              >
                {busy ? "Menyimpan…" : "Simpan nilai"}
              </button>
            </div>
          )}
        </section>
      </form>
    </>
  );
}
