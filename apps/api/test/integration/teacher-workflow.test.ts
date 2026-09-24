import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import { migrate } from "../../scripts/migrate";
import { seedSimulation } from "../../scripts/seed-simulation";
import { createApp } from "../../src/app";

test("teacher workflow dashboard, plans, and logs are available to a seeded teacher", async () => {
  const original = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `teacher_workflow_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  try {
    await migrate(db);
    const seeded = await seedSimulation(db);
    const teacher = (
      await db.query(
        "SELECT u.email FROM users u JOIN teachers t ON t.tenant_id=u.tenant_id AND t.user_id=u.id WHERE t.tenant_id=$1 ORDER BY t.name LIMIT 1",
        [seeded.tenant.id],
      )
    ).rows[0];
    const semester = (
      await db.query(
        "SELECT start_date FROM semesters WHERE tenant_id=$1 ORDER BY start_date LIMIT 1",
        [seeded.tenant.id],
      )
    ).rows[0];

    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const login = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_slug: "simulasi",
        email: teacher.email,
        password: process.env.SEED_SIMULATION_PASSWORD || "Simulasi!2026",
      }),
    });
    const loginPayload = await login.json();
    assert.equal(login.status, 201, JSON.stringify(loginPayload));
    const { access_token } = loginPayload;

    for (const path of [
      `teacher/dashboard?date=${semester.start_date}`,
      "teacher/plans",
      "teacher/logs",
    ]) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const payload = await response.json();
      assert.equal(response.status, 200, `${path}: ${JSON.stringify(payload)}`);
    }
  } finally {
    await app?.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
