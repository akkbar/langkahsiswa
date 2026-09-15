import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import { migrate } from "../../scripts/migrate";
import { seedSimulation } from "../../scripts/seed-simulation";
import { createApp } from "../../src/app";
test("simulation accounts, curriculum, automatic schedule, workload and access isolation", async () => {
  const original = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `schedule_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    const seeded = await seedSimulation(db);
    assert.equal(seeded.created, true);
    assert.equal((await seedSimulation(db)).created, false);
    const tenant = seeded.tenant.id;
    for (const table of ["students", "parents"])
      assert.equal(
        (
          await db.query(
            `SELECT count(*)::int n FROM ${table} WHERE tenant_id=$1 AND user_id IS NOT NULL`,
            [tenant],
          )
        ).rows[0].n,
        150,
      );
    const classes = (
      await db.query(
        "SELECT c.id,count(s.id)::int n,count(DISTINCT s.gender)::int genders FROM classes c JOIN class_students cs ON cs.class_id=c.id AND cs.tenant_id=c.tenant_id JOIN students s ON s.id=cs.student_id AND s.tenant_id=cs.tenant_id WHERE c.tenant_id=$1 GROUP BY c.id",
        [tenant],
      )
    ).rows;
    assert.equal(classes.length, 6);
    classes.forEach((c) => {
      assert.equal(c.n, 25);
      assert.equal(c.genders, 1);
    });
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
      assert.equal(res.status, status, JSON.stringify(data));
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
    const admin = await login("admin@simulasi.example.test");
    const student = await login("siswa001@simulasi.example.test");
    await login("ortu001@simulasi.example.test");
    await login("guru01@simulasi.example.test");
    const semester = (
      await db.query(
        "SELECT id FROM semesters WHERE tenant_id=$1 ORDER BY start_date",
        [tenant],
      )
    ).rows[0].id;
    const input = {
      semester_id: semester,
      days: [1, 2, 3, 4, 5],
      periods: 8,
      start: "07:00",
      break_after: 4,
      break_minutes: 30,
    };
    const curriculum = await request(
      "lesson-planning/curriculum",
      "GET",
      undefined,
      admin,
    );
    assert.equal(curriculum.minutes, 40);
    assert.equal(curriculum.weights.length, 33);
    await request("lesson-planning/curriculum", "GET", undefined, student, 403);
    await request(
      "lesson-planning/settings",
      "POST",
      { minutes: 0 },
      admin,
      400,
    );
    await request(
      "lesson-planning/schedule?semester_id=" + randomUUID(),
      "GET",
      undefined,
      admin,
      404,
    );
    const before = (
      await db.query(
        "SELECT id FROM timetables WHERE tenant_id=$1 ORDER BY id",
        [tenant],
      )
    ).rows;
    const preview = await request(
      "lesson-planning/generate",
      "POST",
      input,
      admin,
      201,
    );
    assert.equal(preview.rows.length, 210);
    assert.deepEqual(
      (
        await db.query(
          "SELECT id FROM timetables WHERE tenant_id=$1 ORDER BY id",
          [tenant],
        )
      ).rows,
      before,
    );
    await request(
      "lesson-planning/generate",
      "POST",
      { ...input, days: [1], periods: 1, apply: true },
      admin,
      400,
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT id FROM timetables WHERE tenant_id=$1 ORDER BY id",
          [tenant],
        )
      ).rows,
      before,
    );
    await request(
      "lesson-planning/settings",
      "POST",
      { minutes: 45 },
      admin,
      201,
    );
    await request(
      "lesson-planning/generate",
      "POST",
      { ...input, apply: true },
      admin,
      201,
    );
    const result = await request(
      "lesson-planning/schedule?semester_id=" + semester,
      "GET",
      undefined,
      admin,
    );
    assert.equal(result.rows.length, 210);
    assert.equal(
      result.loads.reduce((n: number, r: any) => n + r.scheduled_minutes, 0),
      210 * 45,
    );
    result.loads.forEach((r: any) =>
      assert.equal(r.target_minutes, r.scheduled_minutes),
    );
    // Remove an unused semester's binding: automatic generation chooses qualified teachers.
    const second = (
      await db.query(
        "SELECT id FROM semesters WHERE tenant_id=$1 ORDER BY start_date DESC",
        [tenant],
      )
    ).rows[0].id;
    const automatic = await request(
      "lesson-planning/generate",
      "POST",
      { ...input, semester_id: second, apply: true },
      admin,
      201,
    );
    assert.equal(automatic.rows.length, 210);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM class_subjects WHERE tenant_id=$1 AND semester_id=$2",
          [tenant, second],
        )
      ).rows[0].n,
      66,
    );
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
