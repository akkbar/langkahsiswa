import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../../src/database";
import { createTenant, initializeRoles } from "../../src/auth";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 19: immutable website versions and public renderer API", async () => {
  const original = {
    url: process.env.DATABASE_URL,
    storage: process.env.STORAGE_PATH,
    driver: process.env.STORAGE_DRIVER,
    worker: process.env.NOTIFICATION_WORKER_ENABLED,
  };
  process.env.NOTIFICATION_WORKER_ENABLED = "false";
  process.env.STORAGE_DRIVER = "filesystem";
  const base = new Database();
  const schema = `website_test_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original.url!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const storage = await mkdtemp(join(tmpdir(), "schoolapp-website-"));
  process.env.STORAGE_PATH = storage;
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Website School",
        slug: "website-test",
        admin_name: "Admin",
        admin_email: "admin@website.test",
        admin_password: "Password!2026",
      }),
    );
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Foreign Website",
        slug: "foreign-website",
        admin_name: "Foreign",
        admin_email: "admin@foreign-website.test",
        admin_password: "Password!2026",
      }),
    );
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
      expected = 200,
    ) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(data)}`,
      );
      return data;
    }
    const login = (slug: string, email: string) =>
      request(
        "auth/login",
        "POST",
        { tenant_slug: slug, email, password: "Password!2026" },
        undefined,
        201,
      );
    const admin = (await login("website-test", "admin@website.test"))
      .access_token;
    const foreign = (
      await login("foreign-website", "admin@foreign-website.test")
    ).access_token;
    const post = (path: string, body: unknown, expected = 201, token = admin) =>
      request(path, "POST", body, token, expected);
    const school = await post("schools", {
      name: "SMP Website",
      address: "Jl. Sekolah",
      phone: "021123",
    });
    const savedSettings = await request(
      "website/settings",
      "PUT",
      {
        school_id: school.id,
        site_name: "SMP Website",
        tagline: "Belajar dan bertumbuh",
        primary_color: "#004aad",
      },
      admin,
    );
    assert.equal(savedSettings.tenant_slug, "website-test");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQj8AAAAASUVORK5CYII=",
      "base64",
    );
    const asset = await post("website/assets", {
      name: "Gedung sekolah",
      alt_text: "Tampak depan sekolah",
      file_name: "school.png",
      mime_type: "image/png",
      data_base64: png.toString("base64"),
    });
    const privateAsset = await fetch(
      `${origin}/api/v1/website/assets/${asset.id}/file`,
      { headers: { Authorization: `Bearer ${admin}` } },
    );
    assert.equal(privateAsset.status, 200);
    assert.deepEqual(Buffer.from(await privateAsset.arrayBuffer()), png);
    assert.equal(
      (
        await fetch(`${origin}/api/v1/website/assets/${asset.id}/file`, {
          headers: { Authorization: `Bearer ${foreign}` },
        })
      ).status,
      404,
    );
    const draftAssetResponse = await fetch(
      `${origin}/api/v1/public/websites/website-test/assets/${asset.id}`,
    );
    assert.equal(draftAssetResponse.status, 404);
    const firstContent = {
      seo: {
        title: "Beranda SMP Website",
        description: "Profil resmi SMP Website",
      },
      blocks: [
        {
          type: "hero",
          props: {
            eyebrow: "SEKOLAH UNGGUL",
            title: "Tumbuh Bersama",
            subtitle: "Lingkungan belajar yang hangat.",
            cta_label: "Daftar PPDB",
            cta_url: "/ppdb",
            asset_id: asset.id,
          },
        },
        {
          type: "text",
          props: {
            heading: "Tentang kami",
            body: "Sekolah untuk masa depan.",
            alignment: "left",
          },
        },
        { type: "footer", props: { text: "SMP Website", links: [] } },
      ],
    };
    await request(
      "website/pages",
      "POST",
      {
        school_id: school.id,
        title: "Beranda",
        slug: "Home Bad",
        content: firstContent,
      },
      admin,
      400,
    );
    const page = await post("website/pages", {
      school_id: school.id,
      title: "Beranda",
      slug: "home",
      content: firstContent,
    });
    await request(
      "public/websites/website-test/pages/home",
      "GET",
      undefined,
      undefined,
      404,
    );
    await request(
      `website/pages/${page.id}/publish`,
      "POST",
      { version_id: page.version.id },
      admin,
      201,
    );
    const published = await request("public/websites/website-test/pages/home");
    assert.equal(published.content.seo.title, "Beranda SMP Website");
    assert.equal(published.site_name, "SMP Website");
    const publicAsset = await fetch(
      `${origin}/api/v1/public/websites/website-test/assets/${asset.id}`,
    );
    assert.equal(publicAsset.status, 200);
    assert.deepEqual(Buffer.from(await publicAsset.arrayBuffer()), png);
    assert.match(publicAsset.headers.get("etag")!, /^[\"]?[a-f0-9]{64}/);
    const secondContent = {
      ...firstContent,
      seo: { ...firstContent.seo, title: "Beranda Baru" },
    };
    const version = await post(
      `website/pages/${page.id}/versions`,
      secondContent,
    );
    assert.equal(version.version_number, 2);
    assert.equal(
      (await request("public/websites/website-test/pages/home")).content.seo
        .title,
      "Beranda SMP Website",
    );
    await post(`website/pages/${page.id}/publish`, { version_id: version.id });
    assert.equal(
      (await request("public/websites/website-test/pages/home")).content.seo
        .title,
      "Beranda Baru",
    );
    const detail = await request(
      `website/pages/${page.id}`,
      "GET",
      undefined,
      admin,
    );
    assert.equal(detail.versions.length, 2);
    assert.equal(detail.versions[1].content.seo.title, "Beranda SMP Website");
    await request(`website/pages/${page.id}`, "GET", undefined, foreign, 404);
    await request(
      "public/websites/foreign-website/pages/home",
      "GET",
      undefined,
      undefined,
      404,
    );
    const principalUser = await post("users", {
      name: "Principal",
      email: "principal@website.test",
      password: "Password!2026",
      roles: ["PRINCIPAL"],
    });
    assert.ok(principalUser.id);
    const principal = (await login("website-test", "principal@website.test"))
      .access_token;
    await request("website/pages", "GET", undefined, principal);
    await post(
      "website/pages",
      {
        school_id: school.id,
        title: "Ditolak",
        slug: "ditolak",
        content: firstContent,
      },
      403,
      principal,
    );
    await post(`website/pages/${page.id}/unpublish`, {});
    await request(
      "public/websites/website-test/pages/home",
      "GET",
      undefined,
      undefined,
      404,
    );
    assert.equal(
      (
        await fetch(
          `${origin}/api/v1/public/websites/website-test/assets/${asset.id}`,
        )
      ).status,
      404,
    );
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original.url;
    process.env.STORAGE_PATH = original.storage;
    process.env.STORAGE_DRIVER = original.driver;
    process.env.NOTIFICATION_WORKER_ENABLED = original.worker;
    await rm(storage, { recursive: true, force: true });
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
