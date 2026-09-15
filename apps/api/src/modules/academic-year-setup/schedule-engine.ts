export type Lesson = {
  id: string;
  class_id: string;
  teacher_id: string;
  weekly_weight: number;
  name: string;
  room?: string;
};
export type Slot = {
  class_subject_id: string;
  class_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
};
export type ScheduleOptions = {
  days: number[];
  periods: number;
  start: string;
  minutes: number;
  break_after: number;
  break_minutes: number;
};
export const timeMinutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const time = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
export function generateSchedule(
  lessons: Lesson[],
  options: ScheduleOptions,
  occupied: Slot[] = [],
): Slot[] {
  const starts = Array.from(
    { length: options.periods },
    (_, p) =>
      timeMinutes(options.start) +
      p * options.minutes +
      (p >= options.break_after ? options.break_minutes : 0),
  );
  if (starts.at(-1)! + options.minutes > 1440)
    throw new Error("Jam pelajaran melewati tengah malam");
  let best = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const output: Slot[] = [];
    const tasks = lessons.flatMap((l) =>
      Array.from({ length: l.weekly_weight }, (_, n) => ({ ...l, n })),
    );
    tasks.sort((a, b) => a.n - b.n);
    // Rotate class ordering between attempts to escape greedy dead ends.
    if (attempt)
      tasks.sort(
        (a, b) =>
          a.n - b.n ||
          ((hash(a.id) + attempt * 7919) % 101) -
            ((hash(b.id) + attempt * 7919) % 101),
      );
    for (const task of tasks) {
      const candidates = options.days
        .flatMap((day) => starts.map((start) => ({ day, start })))
        .filter(
          ({ day, start }) =>
            ![...occupied, ...output].some(
              (s) =>
                s.day_of_week === day &&
                timeMinutes(s.start_time) < start + options.minutes &&
                timeMinutes(s.end_time) > start &&
                (s.class_id === task.class_id ||
                  s.teacher_id === task.teacher_id ||
                  Boolean(task.room && s.room === task.room)),
            ),
        );
      candidates.sort((a, b) => {
        const score = (c: typeof a) =>
          output.filter(
            (s) => s.class_id === task.class_id && s.day_of_week === c.day,
          ).length *
            10 +
          output.filter(
            (s) => s.class_subject_id === task.id && s.day_of_week === c.day,
          ).length *
            100 +
          c.start / 1440;
        return score(a) - score(b);
      });
      if (!candidates.length) break;
      const { day, start } = candidates[0];
      output.push({
        class_subject_id: task.id,
        class_id: task.class_id,
        teacher_id: task.teacher_id,
        day_of_week: day,
        start_time: time(start),
        end_time: time(start + options.minutes),
        room: task.room,
      });
    }
    if (output.length === tasks.length) return output;
    best = Math.max(best, output.length);
  }
  throw new Error(
    `Jadwal belum dapat disusun lengkap (${best} slot terisi). Tambah hari/jam tersedia atau ubah pembagian guru. Jadwal lama tetap tersimpan.`,
  );
}
function hash(value: string) {
  return [...value].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
}
