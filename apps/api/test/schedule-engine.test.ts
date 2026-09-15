import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSchedule,
  timeMinutes,
  type Lesson,
} from "../src/modules/academic-year-setup/schedule-engine";
const options = {
  days: [1, 2, 3, 4, 5],
  periods: 8,
  start: "07:00",
  minutes: 40,
  break_after: 4,
  break_minutes: 30,
};
test("150-student simulation: complete weights, no class/teacher/room collisions, respects break", () => {
  const lessons: Lesson[] = [];
  for (let c = 0; c < 6; c++)
    [3, 2, 5, 5, 4, 3, 4, 2, 3, 2, 2].forEach((w, t) =>
      lessons.push({
        id: `${c}-${t}`,
        class_id: `c${c}`,
        teacher_id: `t${t}`,
        weekly_weight: w,
        name: `Subject ${t}`,
        room: `Room ${c}`,
      }),
    );
  const slots = generateSchedule(lessons, options);
  assert.equal(slots.length, 210);
  for (const lesson of lessons)
    assert.equal(
      slots.filter((s) => s.class_subject_id === lesson.id).length,
      lesson.weekly_weight,
    );
  for (const [i, s] of slots.entries()) {
    assert.equal(timeMinutes(s.end_time) - timeMinutes(s.start_time), 40);
    assert.ok(
      timeMinutes(s.end_time) <= 580 || timeMinutes(s.start_time) >= 610,
    );
    for (const other of slots.slice(i + 1))
      if (
        s.day_of_week === other.day_of_week &&
        s.start_time < other.end_time &&
        s.end_time > other.start_time
      ) {
        assert.notEqual(s.class_id, other.class_id);
        assert.notEqual(s.teacher_id, other.teacher_id);
        assert.notEqual(s.room, other.room);
      }
  }
});
test("impossible capacity fails without partial result", () => {
  assert.throws(
    () =>
      generateSchedule(
        [
          {
            id: "a",
            class_id: "a",
            teacher_id: "a",
            weekly_weight: 2,
            name: "A",
          },
        ],
        { ...options, days: [1], periods: 1 },
      ),
    /belum dapat/,
  );
});
test("overlapping semester occupancy and changed minute setting are respected", () => {
  const slots = generateSchedule(
    [
      {
        id: "a",
        class_id: "a",
        teacher_id: "shared",
        weekly_weight: 1,
        name: "A",
      },
    ],
    { ...options, minutes: 45 },
    [
      {
        class_subject_id: "old",
        class_id: "old",
        teacher_id: "shared",
        day_of_week: 1,
        start_time: "07:00",
        end_time: "08:00",
      },
    ],
  );
  assert.equal(
    timeMinutes(slots[0].end_time) - timeMinutes(slots[0].start_time),
    45,
  );
  assert.ok(slots[0].day_of_week !== 1 || slots[0].start_time >= "08:00");
  assert.throws(
    () => generateSchedule([], { ...options, start: "23:00" }),
    /tengah malam/,
  );
});
