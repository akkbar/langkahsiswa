import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const ppdbRoutes = [
  ["Dashboard", "ppdb-dashboard"],
  ["Gelombang", "ppdb-gelombang"],
  ["Pendaftaran", "ppdb-pendaftaran"],
  ["Verifikasi", "ppdb-verifikasi"],
  ["Seleksi", "ppdb-seleksi"],
  ["Daftar Ulang", "ppdb-daftar-ulang"],
  ["Pembayaran", "ppdb-pembayaran"],
  ["Laporan", "ppdb-laporan"],
  ["Pengaturan", "ppdb-pengaturan"],
] as const;

test("PPDB foundation navigation requires admission.read", async () => {
  const source = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  const navigation = source.match(
    /if \(can\(user, "admission\.read"\)\)\s+links\.push\(\s+\.\.\.ppdbFoundationNavigation\.map\([\s\S]*?\}\)\),\s+\);/,
  )?.[0];

  expect(navigation).toContain('permission: "admission.read"');
  expect(navigation).not.toContain('permission: "site.read"');
  expect(source).not.toContain(
    '...ppdbFoundationNavigation.map(([key]) => key),',
  );
});

test("PPDB exposes Phase 1 foundation navigation and route layouts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Kode yayasan", { exact: true }).fill("demo");
  await page.getByLabel("Email", { exact: true }).fill("admin@demo.langkahsiswa.id");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("LangkahSiswa!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();

  await page.getByRole("button", { name: /PPDB/ }).click();
  await page.locator('a[href="#ppdb-dashboard"]').click();
  await expect(page).toHaveURL(/#ppdb-dashboard$/);

  for (const [label, route] of ppdbRoutes) {
    if (label === "Dashboard") continue;
    const link = page.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  }
});

