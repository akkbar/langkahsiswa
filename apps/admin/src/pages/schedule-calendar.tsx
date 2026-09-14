import React, { useState } from "react";
import { PlanningDrawer } from "./subjects";

type Lesson = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  room?: string;
};
const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${(time % 60).toString().padStart(2, "0")}`;

export function ScheduleCalendar({ rows }: { rows: Lesson[] }) {
  const [selected, setSelected] = useState<Lesson | null>(null);
  if (!rows.length) return null;
  const start =
    Math.floor(Math.min(...rows.map((r) => minutes(r.start_time))) / 60) * 60;
  const end =
    Math.ceil(Math.max(...rows.map((r) => minutes(r.end_time))) / 60) * 60;
  const height = (end - start) * 2;
  const ticks = Array.from(
    { length: (end - start) / 30 },
    (_, i) => start + i * 30,
  );
  const columns = days.map((name, index) => {
    const ends: number[] = [];
    const lessons = rows
      .filter((r) => r.day_of_week === index + 1)
      .sort(
        (a, b) =>
          a.start_time.localeCompare(b.start_time) ||
          a.class_name.localeCompare(b.class_name),
      )
      .map((row) => {
        let lane = ends.findIndex((end) => end <= minutes(row.start_time));
        if (lane < 0) lane = ends.length;
        ends[lane] = minutes(row.end_time);
        return { row, lane };
      });
    return { name, lessons, lanes: Math.max(1, ends.length) };
  });
  const grid = `64px ${columns.map((c) => `${Math.max(180, c.lanes * 140)}px`).join(" ")}`;
  return (
    <>
      <div
        className="lesson-calendar"
        aria-label="Kalender jadwal mingguan"
        style={{ gridTemplateColumns: grid }}
      >
        <div className="lesson-calendar-heading lesson-calendar-corner">
          Jam
        </div>
        {columns.map((c) => (
          <div className="lesson-calendar-heading" key={c.name}>
            {c.name}
            <small>{c.lessons.length} sesi</small>
          </div>
        ))}
        <div className="lesson-calendar-times" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} style={{ top: (t - start) * 2 }}>
              {clock(t)}
            </span>
          ))}
        </div>
        {columns.map((c) => (
          <div
            key={c.name}
            className="lesson-calendar-day"
            style={{ height }}
            aria-label={c.name}
          >
            {c.lessons.map(({ row, lane }) => (
              <button
                key={row.id}
                className="lesson-calendar-event"
                style={{
                  top: (minutes(row.start_time) - start) * 2,
                  height:
                    (minutes(row.end_time) - minutes(row.start_time)) * 2 - 2,
                  left: `calc(${(lane / c.lanes) * 100}% + 3px)`,
                  width: `calc(${100 / c.lanes}% - 6px)`,
                }}
                onClick={() => setSelected(row)}
                title={`${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)} | ${row.class_name} | ${row.subject_name} | ${row.teacher_name}`}
              >
                <span>
                  {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
                </span>
                <strong>{row.subject_name}</strong>
                <span>
                  {row.class_name} · {row.teacher_name}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {selected && (
        <PlanningDrawer
          title="Detail jadwal pelajaran"
          busy={false}
          error=""
          onClose={() => setSelected(null)}
        >
          <dl className="lesson-calendar-detail">
            <dt>Mata pelajaran</dt>
            <dd>{selected.subject_name}</dd>
            <dt>Kelas</dt>
            <dd>{selected.class_name}</dd>
            <dt>Hari dan jam</dt>
            <dd>
              {days[selected.day_of_week - 1]},{" "}
              {selected.start_time.slice(0, 5)}–{selected.end_time.slice(0, 5)}
            </dd>
            <dt>Guru</dt>
            <dd>{selected.teacher_name}</dd>
            <dt>Ruang</dt>
            <dd>{selected.room || "Belum ditentukan"}</dd>
          </dl>
        </PlanningDrawer>
      )}
    </>
  );
}
