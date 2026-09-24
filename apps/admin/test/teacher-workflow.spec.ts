import { test, expect } from "@playwright/test";

test("admin reaches teacher workflow pages from the Guru group", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Kode yayasan", { exact: false }).fill("simulasi");
  await page
    .getByLabel("Email", { exact: true })
    .fill("guru01@simulasi.example.test");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("Simulasi!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();

  await page.getByRole("button", { name: "Guru", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Dashboard Guru", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Rencana Mengajar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Jurnal Mengajar", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dashboard Guru", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard guru", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Absensi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Penilaian", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Input Nilai", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Rencana Mengajar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rencana mengajar", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Cari rencana mengajar")).toBeVisible();

  await page
    .getByRole("link", { name: "Jurnal Mengajar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jurnal mengajar", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Cari jurnal mengajar")).toBeVisible();
});
