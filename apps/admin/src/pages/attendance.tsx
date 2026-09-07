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
import { attendanceStatuses } from "../../../../packages/shared-types/src";
export function AttendancePage({
  catalog,
  user,
}: {
  catalog: Catalog;
  user: Actor;
}) {
  const [classId, setClassId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const [records, setRecords] = useState<
    Record<string, { status: string; notes: string }>
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const students = (catalog["class-students"] || [])
    .filter((r) => r.class_id === classId)
    .map((r) => catalog.students?.find((s) => s.id === r.student_id))
    .filter(Boolean) as Entity[];
  const year = catalog.classes?.find((c) => c.id === classId)?.academic_year_id;
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setRecords({});
    setError("");
    setMessage("");
    if (classId && day)
      api(`attendance?class_id=${classId}&date=${day}`)
        .then((data) => {
          if (active) {
            setRecords(
              Object.fromEntries(
                data.records.map((r: any) => [
                  r.student_id,
                  { status: r.status, notes: r.notes || "" },
                ]),
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
  }, [classId, day]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await send(
        "attendance",
        {
          class_id: classId,
          semester_id: semesterId,
          date: day,
          records: students.map((s) => ({
            student_id: s.id,
            status: records[s.id]?.status || "PRESENT",
            notes: records[s.id]?.notes || "",
          })),
        },
        "PUT",
      );
      setMessage("Absensi berhasil disimpan.");
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
          <span className="eyebrow">KEHADIRAN HARIAN</span>
          <h1>Absensi siswa</h1>
          <p className="muted">
            Catat kehadiran setiap siswa sesuai kelas dan tanggal.
          </p>
        </div>
      </div>
      <form onSubmit={save}>
        <section className="card filter-grid">
          <Select
            title="Kelas"
            value={classId}
            onChange={(v) => {
              setClassId(v);
              setSemesterId("");
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
          <label>
            Tanggal
            <input
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </section>
        <ErrorBox error={error} />
        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        <section className="card">
          {!classId ? (
            <Empty text="Pilih kelas untuk mulai mencatat kehadiran." />
          ) : !loaded ? (
            <Empty text="Memuat absensi…" />
          ) : !students.length ? (
            <Empty text="Kelas belum memiliki siswa. Tambahkan melalui Anggota Kelas." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>NIS</th>
                    <th>Siswa</th>
                    <th>Kehadiran</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.nis)}</td>
                      <td>{String(s.name)}</td>
                      <td>
                        <select
                          aria-label={`Kehadiran ${s.name}`}
                          disabled={!can(user, "attendance.write")}
                          value={records[s.id]?.status || "PRESENT"}
                          onChange={(e) =>
                            setRecords({
                              ...records,
                              [s.id]: {
                                notes: records[s.id]?.notes || "",
                                status: e.target.value,
                              },
                            })
                          }
                        >
                          {attendanceStatuses.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Catatan ${s.name}`}
                          value={records[s.id]?.notes || ""}
                          disabled={!can(user, "attendance.write")}
                          onChange={(e) =>
                            setRecords({
                              ...records,
                              [s.id]: {
                                status: records[s.id]?.status || "PRESENT",
                                notes: e.target.value,
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {can(user, "attendance.write") && (
            <div className="form-footer">
              <span className="muted">
                {students.length} siswa · Pencatatan manual
              </span>
              <button
                className="primary"
                disabled={busy || !loaded || !students.length || !semesterId}
              >
                {busy ? "Menyimpan…" : "Simpan absensi"}
              </button>
            </div>
          )}
        </section>
      </form>
    </>
  );
}
