import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api } from "../api";
import { can, Empty, ErrorBox } from "../components";
import { SortableTable } from "../sortable-table";

type Session = {
  id: string;
  class_name: string;
  subject_name: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  previous_reminder?: string;
};

export function TeacherDashboardPage({ user }: { user: Actor }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    allowOperational(user); allow(user, "academic.read");
    async function load() {
      try {
        const result = await api<{ date: string; day_of_week: number; sessions: Session[] }>(`teacher/dashboard?teacher_id=${user.id || ""}&date=${new Date().toISOString().slice(0, 10)}`);
        setSessions(result.sessions || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user.id]);

  return (
    <div className="resource-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>Dashboard Guru</h1>
        </div>
        <div className="page-actions">
          <span className="muted">Hari ini, {new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      <ErrorBox error={error} />

      {loading ? (
        <Empty text="Memuat jadwal hari ini..." />
      ) : sessions.length === 0 ? (
        <Empty text="Tidak ada jadwal pelajaran untuk hari ini." />
      ) : (
        <SortableTable>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kelas</th>
              <th>Mata pelajaran</th>
              <th>Ruangan</th>
              <th>Rencana topik</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.start_time} - {s.end_time}</td>
                <td>{s.class_name}</td>
                <td>{s.subject_name}</td>
                <td>{s.room || "-"}</td>
                <td>{s.previous_reminder || "-"}</td>
                <td>
                  <button className="link-button" onClick={() => window.open(`#/teaching-logs?class_subject_id=${s.subject_id}&date=${new Date().toISOString().slice(0, 10)}`, "_self")}>
                    Log Mengajar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      )}

      <div className="page-title mt-2">
        <h2>Besok</h2>
        <span className="muted">{new Date(Date.now() + 86400000).toLocaleDateString("id-ID")}</span>
      </div>

      {loading ? (
        <Empty text="Memuat jadwal besok..." />
      ) : sessions.length === 0 ? (
        <Empty text="Tidak ada jadwal pelajaran untuk besok." />
      ) : (
        <SortableTable>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kelas</th>
              <th>Mata pelajaran</th>
              <th>Ruangan</th>
              <th>Rencana topik</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.start_time} - {s.end_time}</td>
                <td>{s.class_name}</td>
                <td>{s.subject_name}</td>
                <td>{s.room || "-"}</td>
                <td>{s.previous_reminder || "-"}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      )}
    </div>
  );
}

function allowOperational(user: Actor) {
  if (user.account_level !== "OPERATIONAL")
    throw new Error("Halaman ini hanya untuk akun operational");
}

function allow(user: Actor, permission: string) {
  if (!user.permissions.includes("*") && !user.permissions.includes(permission))
    throw new Error("Hak akses tidak mencukupi");
}