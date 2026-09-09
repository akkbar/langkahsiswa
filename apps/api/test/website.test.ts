import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteContentSchema } from "../src/website";

test("website builder accepts the phase 19 block registry without raw HTML", () => {
  const content = websiteContentSchema.parse({
    seo: { title: "SMP Nusantara", description: "Sekolah unggul" },
    blocks: [
      { type: "hero", props: { title: "Selamat Datang" } },
      { type: "text", props: { body: "Isi profil sekolah" } },
      { type: "image", props: { asset_id: crypto.randomUUID() } },
      { type: "gallery", props: { asset_ids: [] } },
      { type: "news", props: { items: [{ title: "Berita", url: "/berita" }] } },
      {
        type: "announcement",
        props: { items: [{ title: "Info", body: "Pengumuman" }] },
      },
      {
        type: "event",
        props: { items: [{ title: "Acara", date: "9 September 2026" }] },
      },
      { type: "teacher", props: { items: [{ name: "Ibu Sari" }] } },
      { type: "contact", props: {} },
      {
        type: "map",
        props: { embed_url: "https://www.google.com/maps/embed?pb=test" },
      },
      { type: "footer", props: { links: [{ label: "PPDB", url: "/ppdb" }] } },
    ],
  });
  assert.equal(content.blocks.length, 11);
  assert.ok(content.blocks.every((block) => block.id));
  assert.equal(JSON.stringify(content).includes("html"), false);
});

test("website builder rejects scripts, unknown blocks and unsafe map embeds", () => {
  assert.throws(() =>
    websiteContentSchema.parse({
      blocks: [{ type: "text", props: { body: "Aman", html: "<script>" } }],
    }),
  );
  assert.throws(() =>
    websiteContentSchema.parse({
      blocks: [{ type: "custom_html", props: { html: "<script>" } }],
    }),
  );
  assert.throws(() =>
    websiteContentSchema.parse({
      blocks: [{ type: "map", props: { embed_url: "https://evil.test/map" } }],
    }),
  );
});
