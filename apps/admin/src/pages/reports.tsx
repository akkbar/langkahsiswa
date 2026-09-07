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
import { api, send, downloadReport } from "../api";
export function ReportsPage({
  catalog,
  user,
}: {
  catalog: Catalog;
  user: Actor;
}) {
  const [classId, setClassId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const year = catalog.classes?.find((c) => c.id === classId)?.academic_year_id;
  const students = (catalog["class-students"] || [])
    .filter((r) => r.class_id === classId)
    .map((r) => catalog.students?.find((s) => s.id === r.student_id))
    .filter(Boolean) as Entity[];
  async function load() {
    const result = await api(
      `report-cards?${new URLSearchParams({ ...(classId ? { class_id: classId } : {}), ...(semesterId ? { semester_id: semesterId } : {}) })}`,
    );
    setReports(result.data);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(null);
    api(
      `report-cards?${new URLSearchParams({ ...(classId ? { class_id: classId } : {}), ...(semesterId ? { semester_id: semesterId } : {}) })}`,
    )
      .then((r) => {
        if (active) setReports(r.data);
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
  }, [classId, semesterId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function view(id: string) {
    const report = await api(`report-cards/${id}`);
    setSelected(report);
    setNotes(report.notes);
  }
  const transition = (action: string) =>
    run(async () => {
      await send(`report-cards/${selected.id}/${action}`, { notes });
      await load();
      await view(selected.id);
    });
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">LAPORAN HASIL BELAJAR</span>
          <h1>Raport siswa</h1>
          <p className="muted">
            Hitung nilai akhir, review wali kelas, lalu publikasikan.
          </p>
        </div>
      </div>
      <ErrorBox error={error} />
      {can(user, "report.calculate") && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const report = await send("report-cards/calculate", {
                class_id: classId,
                semester_id: semesterId,
                student_id: studentId,
              });
              await load();
              await view(report.id);
            });
          }}
        >
          <div className="filter-grid">
            <Select
              title="Kelas"
              value={classId}
              onChange={(v) => {
                setClassId(v);
                setSemesterId("");
                setStudentId("");
              }}
              rows={catalog.classes || []}
              resource="classes"
              catalog={catalog}
            />
            <Select
              title="Semester"
              value={semesterId}
              onChange={setSemesterId}
              rows={(catalog.semesters || []).filter(
                (s) => s.academic_year_id === year,
              )}
              resource="semesters"
              catalog={catalog}
            />
            <Select
              title="Siswa"
              value={studentId}
              onChange={setStudentId}
              rows={students}
              resource="students"
              catalog={catalog}
            />
          </div>
          <div className="form-footer">
            <span className="muted">
              Semua penilaian harus lengkap. Bobot tiap pelajaran harus 100%.
            </span>
            <button className="primary" disabled={busy}>
              {busy ? "Memproses…" : "Hitung raport"}
            </button>
          </div>
        </form>
      )}
      <section className="card">
        <div className="toolbar">
          <strong>{reports.length} raport</strong>
          <span className="muted">Draft → Review → Persetujuan → Terbit</span>
        </div>
        {loading ? (
          <Empty text="Memuat raport…" />
        ) : !reports.length ? (
          <Empty text="Belum ada raport yang tersedia." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Kelas / Semester</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.snapshot.student.name}</strong>
                      <div className="small muted">
                        {r.snapshot.student.nis}
                      </div>
                    </td>
                    <td>
                      {r.snapshot.class.name} · {r.snapshot.semester.name}
                    </td>
                    <td>
                      <span
                        className={`badge ${r.status === "PUBLISHED" ? "green" : ""}`}
                      >
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() => void run(() => view(r.id))}
                      >
                        Buka raport →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <section className="card report-preview">
          <div className="page-title">
            <div>
              <span className="eyebrow">{selected.snapshot.school.name}</span>
              <h2>{selected.snapshot.student.name}</h2>
              <p className="muted">
                {selected.snapshot.class.name} ·{" "}
                {selected.snapshot.academic_year.name} ·{" "}
                {selected.snapshot.semester.name}
              </p>
            </div>
            <button
              disabled={busy}
              onClick={() => void run(() => downloadReport(selected.id))}
            >
              ↓ Unduh PDF
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mata pelajaran</th>
                  <th>Nilai akhir</th>
                  <th>Rincian kategori</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((i: any) => (
                  <tr key={i.subject_id}>
                    <td>{i.subject_name}</td>
                    <td>
                      <strong>{Number(i.final_grade).toFixed(2)}</strong>
                    </td>
                    <td className="small muted">
                      {i.details
                        .map(
                          (d: any) => `${d.name}: ${d.average} × ${d.weight}%`,
                        )
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Kehadiran:{" "}
            {Object.entries(selected.snapshot.attendance)
              .map(([k, v]) => `${statusLabels[k]} ${v}`)
              .join(" · ")}
          </p>
          <label>
            Catatan wali kelas
            <textarea
              rows={3}
              maxLength={3000}
              value={notes}
              disabled={
                selected.status === "PUBLISHED" || !can(user, "report.review")
              }
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="form-footer">
            <span className="badge">{statusLabels[selected.status]}</span>
            <div className="actions">
              {selected.status === "DRAFT" && can(user, "report.review") && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void transition("review")}
                >
                  Selesaikan review
                </button>
              )}
              {selected.status === "REVIEWED" &&
                can(user, "report.approve") && (
                  <button
                    disabled={busy}
                    onClick={() => void transition("approve")}
                  >
                    Setujui kepala sekolah
                  </button>
                )}
              {["REVIEWED", "APPROVED"].includes(selected.status) &&
                can(user, "report.publish") && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void transition("publish")}
                  >
                    Publikasikan
                  </button>
                )}
              {["REVIEWED", "APPROVED"].includes(selected.status) &&
                can(user, "report.review") && (
                  <button
                    disabled={busy}
                    onClick={() => void transition("reopen")}
                  >
                    Buka kembali
                  </button>
                )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
