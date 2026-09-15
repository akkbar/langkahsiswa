import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import { migrate } from "../../scripts/migrate";
import { seedSimulation } from "../../scripts/seed-simulation";
import { createApp } from "../../src/app";
import { calculateFinalGrade } from "../../src/modules/gradebook/gradebook.service";
test("teacher assessment plans: ownership, custom weights, defaults, retained scores and report lock", async () => {
  const original = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `assessment_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    const seed = await seedSimulation(db);
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      token = "",
      status = 200,
    ) {
      const res = await fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      assert.equal(
        res.status,
        status,
        `${method} ${path}: ${JSON.stringify(data)}`,
      );
      return data;
    }
    const login = async (email: string) =>
      (
        await request(
          "auth/login",
          "POST",
          {
            tenant_slug: "simulasi",
            email,
            password: process.env.SEED_SIMULATION_PASSWORD || "Simulasi!2026",
          },
          "",
          201,
        )
      ).access_token;
    const teacher = await login("guru01@simulasi.example.test"),
      other = await login("guru02@simulasi.example.test"),
      admin = await login("admin@simulasi.example.test"),
      parent = await login("ortu001@simulasi.example.test");
    await request("assessment-plans", "GET", undefined, parent, 403);
    const context = await request(
      "assessment-plans",
      "GET",
      undefined,
      teacher,
    );
    assert.equal(context.subjects.length, 6);
    assert.equal(context.can_view_all, false);
    context.subjects.forEach((s: any) =>
      assert.equal(s.teacher_id, context.current_teacher_id),
    );
    const adminContext = await request(
      "assessment-plans",
      "GET",
      undefined,
      admin,
    );
    assert.equal(adminContext.subjects.length, 66);
    const subject = context.subjects[0];
    const path = `assessment-plans/${subject.id}`;
    const initial = await request(path, "GET", undefined, teacher);
    assert.equal(initial.items.length, 0);
    assert.equal(initial.defaults.length, 10);
    assert.equal(
      initial.defaults.reduce((n: number, r: any) => n + r.weight, 0),
      100,
    );
    assert.equal(
      initial.defaults.find((i: any) => i.name === "Remidi").weight,
      10,
    );
    await request(path, "GET", undefined, other, 403);
    const saveBody = (plan: any) => ({
      revision: plan.revision,
      items: plan.items.map((i: any) => ({
        id: i.id,
        name: i.name,
        weight: i.weight,
        max_score: i.max_score,
        due_date: i.due_date,
      })),
    });
    const saved = await request(
      path,
      "PUT",
      { revision: initial.revision, items: initial.defaults },
      teacher,
    );
    assert.equal(saved.items.length, 10);
    await request(
      path,
      "PUT",
      { revision: initial.revision, items: initial.defaults },
      teacher,
      409,
    );
    await request(path, "PUT", saveBody(saved), other, 403);
    const invalid = saveBody(saved);
    invalid.items[0].weight += 1;
    await request(path, "PUT", invalid, teacher, 400);
    const global = await request(
      "assessments?limit=200",
      "GET",
      undefined,
      other,
    );
    assert.equal(global.total, 0);
    const item = saved.items[0];
    await request(`assessments/${item.id}`, "GET", undefined, other, 403);
    await request(
      `assessment-categories/${item.category_id}`,
      "GET",
      undefined,
      other,
      403,
    );
    await request(`assessments/${item.id}`, "DELETE", undefined, other, 403);
    await request(
      `grades?assessment_id=${item.id}`,
      "GET",
      undefined,
      other,
      403,
    );
    const student = (
      await db.query(
        "SELECT student_id FROM class_students WHERE tenant_id=$1 AND class_id=$2 LIMIT 1",
        [seed.tenant.id, subject.class_id],
      )
    ).rows[0].student_id;
    await request(
      "grades",
      "PUT",
      { assessment_id: item.id, scores: [{ student_id: student, score: 75 }] },
      teacher,
    );
    const scored = await request(path, "GET", undefined, teacher);
    const custom = saveBody(scored);
    custom.items.find((i: any) => i.id === item.id).name = "PR Mingguan";
    custom.items.find((i: any) => i.name === "PR Mingguan").max_score = 50;
    await request(path, "PUT", custom, teacher, 400);
    custom.items.find((i: any) => i.name === "PR Mingguan").max_score = 100;
    const removed = saveBody(scored);
    removed.items = removed.items.filter((i: any) => i.id !== item.id);
    removed.items[0].weight += item.weight;
    await request(path, "PUT", removed, teacher, 409);
    const edited = await request(path, "PUT", custom, teacher);
    assert.ok(
      edited.items.some(
        (i: any) =>
          i.id === item.id && i.name === "PR Mingguan" && i.score_count === 1,
      ),
    );
    assert.equal(
      (
        await request(
          `grades?assessment_id=${item.id}`,
          "GET",
          undefined,
          teacher,
        )
      ).data[0].score,
      75,
    );
    // The existing report formula receives the custom item weights, including Remidi.
    const categories = (
      await db.query(
        "SELECT c.name,c.weight,a.max_score FROM assessment_categories c JOIN assessments a ON a.tenant_id=c.tenant_id AND a.category_id=c.id WHERE c.tenant_id=$1 AND c.class_subject_id=$2",
        [seed.tenant.id, subject.id],
      )
    ).rows;
    const result = calculateFinalGrade(
      categories.map((c) => ({
        name: c.name,
        weight: c.weight,
        assessments: [
          {
            name: c.name,
            max_score: c.max_score,
            score: c.name === "Remidi" ? 100 : 50,
          },
        ],
      })),
    );
    assert.equal(result.final_grade, 55);
    // Matrix uses the configured assessment items and enrolled students only.
    const matrix = await request(
      `grades/matrix?class_subject_id=${subject.id}`,
      "GET",
      undefined,
      teacher,
    );
    assert.equal(matrix.assessments.length, 10);
    assert.equal(matrix.students.length, 25);
    await request(
      `grades/matrix?class_subject_id=${subject.id}`,
      "GET",
      undefined,
      other,
      403,
    );
    await request(
      `grades/history?class_subject_id=${subject.id}`,
      "GET",
      undefined,
      other,
      403,
    );
    const initialScore = matrix.scores.find(
      (s: any) => s.assessment_id === item.id && s.student_id === student,
    );
    const changedScore = await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 80,
        expected_version: initialScore.version,
      },
      teacher,
    );
    await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 90,
        expected_version: initialScore.version,
      },
      teacher,
      409,
    );
    const unchanged = await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 80,
        expected_version: changedScore.version,
      },
      teacher,
    );
    assert.equal(unchanged.changed, false);
    const beforeDelete = await request(
      `grades/history?class_subject_id=${subject.id}&student_id=${student}&assessment_id=${item.id}`,
      "GET",
      undefined,
      teacher,
    );
    assert.equal(beforeDelete.total, 2);
    assert.equal(beforeDelete.data[0].old_score, 75);
    assert.equal(beforeDelete.data[0].new_score, 80);
    assert.equal(beforeDelete.data[0].actor_name, "Dewi Lestari");
    const zero = await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 0,
        expected_version: changedScore.version,
      },
      teacher,
    );
    assert.equal(zero.score, 0);
    await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: null,
        expected_version: zero.version,
      },
      teacher,
    );
    const cleared = await request(
      `grades/history?class_subject_id=${subject.id}`,
      "GET",
      undefined,
      teacher,
    );
    assert.equal(cleared.data[0].action, "DELETE");
    assert.equal(cleared.data[0].old_score, 0);
    assert.equal(cleared.data[0].new_score, null);
    await assert.rejects(
      db.query("UPDATE student_score_history SET new_score=99 WHERE id=$1", [
        cleared.data[0].id,
      ]),
      /append only/,
    );
    await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 101,
        expected_version: null,
      },
      teacher,
      400,
    );
    const foreignStudent = (
      await db.query(
        "SELECT student_id FROM class_students WHERE tenant_id=$1 AND class_id<>$2 LIMIT 1",
        [seed.tenant.id, subject.class_id],
      )
    ).rows[0].student_id;
    await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: foreignStudent,
        score: 80,
        expected_version: null,
      },
      teacher,
      400,
    );
    const adminId = (
      await db.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND email='admin@simulasi.example.test'",
        [seed.tenant.id],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO report_cards(tenant_id,student_id,class_id,semester_id,status,snapshot,reviewed_by) VALUES($1,$2,$3,$4,'REVIEWED','{}',$5)",
      [seed.tenant.id, student, subject.class_id, subject.semester_id, adminId],
    );
    const locked = await request(path, "GET", undefined, teacher);
    assert.equal(locked.locked, true);
    await request(
      "grades/cell",
      "PUT",
      {
        assessment_id: item.id,
        student_id: student,
        score: 80,
        expected_version: null,
      },
      teacher,
      409,
    );
    await request(path, "PUT", saveBody(locked), teacher, 409);
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
