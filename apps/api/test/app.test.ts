import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app";
import { RedisConnection } from "../src/common/redis.connection";
import { Database } from "../src/database/database.service";

test("modular app boots, protects feature routes and preserves HTTP policies", async () => {
  const previousWorker = process.env.NOTIFICATION_WORKER_ENABLED;
  const previousSecret = process.env.JWT_SECRET;
  const previousOrigins = process.env.CORS_ORIGIN;
  process.env.NOTIFICATION_WORKER_ENABLED = "false";
  process.env.JWT_SECRET = "modular-app-test-secret-at-least-32-characters";
  process.env.CORS_ORIGIN = "https://admin.example.test";
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    app = await createApp(false);
    // Health checks are the only database/cache calls allowed in this smoke test.
    const db = app.get(Database);
    let databaseHealthy = true;
    db.query = async (query: string) => {
      assert.equal(query, "SELECT 1");
      if (!databaseHealthy) throw new Error("Database unavailable");
      return { rows: [], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
    };
    const redis = app.get(RedisConnection).client;
    redis.connect = async () => {};
    redis.ping = (async () => "PONG") as typeof redis.ping;
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();

    for (const path of [
      "attendance",
      "users",
      "sites",
      "admission-periods",
      "files",
      "notifications",
      "device-tokens",
      "events",
      "report-cards",
      "schools",
    ]) {
      const response = await fetch(`${origin}/api/v1/${path}`);
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { message: "Silakan masuk" });
    }
    const config = await fetch(`${origin}/api/v1/auth/google/config`);
    assert.equal(config.status, 200);
    assert.equal(typeof (await config.json()).enabled, "boolean");

    const blocked = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), {
      message: "Origin tidak diizinkan",
    });

    const healthy = await fetch(`${origin}/health`);
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), {
      status: "ok",
      database: "connected",
      redis: "connected",
    });
    databaseHealthy = false;
    const degraded = await fetch(`${origin}/health`);
    assert.equal(degraded.status, 503);
    assert.deepEqual(await degraded.json(), {
      status: "degraded",
      database: "disconnected",
      redis: "connected",
    });
  } finally {
    await app?.close();
    for (const [key, value] of Object.entries({
      NOTIFICATION_WORKER_ENABLED: previousWorker,
      JWT_SECRET: previousSecret,
      CORS_ORIGIN: previousOrigins,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
