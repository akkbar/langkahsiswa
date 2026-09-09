import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database";
import { migrate } from "../../scripts/migrate";
import { createTenant, initializeRoles } from "../../src/auth";
import { createApp } from "../../src/app";
import { GoogleIdentityVerifier } from "../../src/google-identity";

test("Google login maps existing tenant accounts, preserves roles and revokes mobile sessions", async (t) => {
  const base = new Database();
  const schema = `langkahsiswa_google_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const previous = process.env.DATABASE_URL;
  const previousGoogle = process.env.GOOGLE_CLIENT_ID;
  const url = new URL(previous!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = "test";
  process.env.ALLOW_TENANT_HEADER = "true";
  process.env.GOOGLE_CLIENT_ID = "test.apps.googleusercontent.com";
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Google school",
        slug: "google-school",
        admin_name: "Admin",
        admin_email: "admin@gmail.com",
        admin_password: "Password!2026",
      }),
    );
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Other school",
        slug: "other-school",
        admin_name: "Other",
        admin_email: "other@gmail.com",
        admin_password: "Password!2026",
      }),
    );
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const verifier = app.get(GoogleIdentityVerifier);
    let identity = {
      subject: "stable-google-sub",
      email: "admin@gmail.com",
      authoritative: true,
    };
    // Simulate only Google's verified network boundary; exercise real HTTP, DB and auth.
    verifier.verify = async () => identity;
    const request = async (
      path: string,
      body?: unknown,
      expected = 201,
      headers = {},
    ) => {
      const res = await fetch(`${origin}/api/v1/auth/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json();
      assert.equal(res.status, expected, JSON.stringify(data));
      return data;
    };
    const input = {
      tenant_slug: "google-school",
      credential: "verified-google-credential",
    };
    await t.test("config and existing school account login", async () => {
      assert.equal(
        (await request("google/config", undefined, 200)).enabled,
        true,
      );
      const session = await request("google", input);
      assert.equal(session.user.tenant_id, tenant.id);
      assert.deepEqual(session.user.roles, ["SCHOOL_ADMIN"]);
      assert.equal(
        (await db.query("SELECT count(*) FROM user_identities")).rows[0].count,
        "1",
      );
      const rotated = await request("refresh", {
        refresh_token: session.refresh_token,
      });
      await request("refresh", { refresh_token: session.refresh_token }, 401);
      await request("logout", { refresh_token: rotated.refresh_token });
      await request("refresh", { refresh_token: rotated.refresh_token }, 401);
    });
    await t.test(
      "subject survives Google email change, wrong school and browser origin denied",
      async () => {
        identity.email = "changed@gmail.com";
        assert.equal(
          (await request("google", input)).user.email,
          "admin@gmail.com",
        );
        await request("google", { ...input, tenant_slug: "other-school" }, 401);
        await request("google", input, 403, {
          Origin: "https://attacker.test",
        });
        identity = {
          subject: "unknown-google-sub",
          email: "unknown@gmail.com",
          authoritative: true,
        };
        await request("google", input, 401);
      },
    );
    await t.test(
      "non-hosted email requires password once and cannot replace linked identity",
      async () => {
        await db.query("DELETE FROM user_identities WHERE tenant_id=$1", [
          tenant.id,
        ]);
        identity = {
          subject: "external-google-sub",
          email: "admin@gmail.com",
          authoritative: false,
        };
        await request("google", input, 401);
        await request("google", { ...input, account_password: "wrong" }, 401);
        await request("google", {
          ...input,
          account_password: "Password!2026",
        });
        await request("google", input);
        identity = {
          ...identity,
          subject: "replacement-sub",
          authoritative: true,
        };
        await request("google", input, 401);
      },
    );
    await t.test(
      "disabled account is refused even after identity linked",
      async () => {
        identity.subject = "external-google-sub";
        await db.query("UPDATE users SET active=false WHERE tenant_id=$1", [
          tenant.id,
        ]);
        await request("google", input, 401);
      },
    );
  } finally {
    await app?.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = previous;
    if (previousGoogle === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousGoogle;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
