import { test, expect } from "@playwright/test";
test("teacher portal defaults, custom weights, own assignments and item views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Kode yayasan", { exact: false }).fill("simulasi");
  await page
    .getByLabel("Email", { exact: true })
    .fill("guru01@simulasi.example.test");
  await page.getByLabel("Kata sandi", { exact: true }).fill("Simulasi!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await page.getByRole("button", { name: "Guru", exact: true }).click();
  await page.getByRole("link", { name: "Penilaian", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Penilaian", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Guru pengampu")).toHaveCount(0);
  await expect(
    page.getByLabel("Pelajaran kelas dan semester").locator("option"),
  ).toHaveCount(7);
  await page
    .getByRole("button", { name: /Gunakan item default|Atur item & bobot/ })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Atur item & bobot penilaian",
  });
  await expect(drawer.getByLabel("Nama item", { exact: true })).toHaveCount(10);
  expect((await drawer.boundingBox())?.width).toBe(600);
  const weight = drawer.getByLabel("Bobot (%)", { exact: true }).first();
  const original = await weight.inputValue();
  await weight.fill("99");
  await expect(
    drawer.getByRole("button", { name: "Simpan penilaian" }),
  ).toBeDisabled();
  await weight.fill(original);
  await drawer.getByRole("button", { name: "Simpan penilaian" }).click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: "Tabel", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("row", { name: /Remidi/ })).toContainText("10%");
  await page
    .getByRole("columnheader", { name: "Bobot (%)", exact: true })
    .getByRole("button")
    .click();
  await expect(page.locator("tbody tr").first()).toContainText("5%");
  await page.screenshot({ path: "artifacts/teacher-assessments.png" });
  await page.getByRole("button", { name: "Kartu", exact: true }).click();
  await expect(page.locator(".assessment-plan-cards article")).toHaveCount(10);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Atur item & bobot", exact: true })
    .click();
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "artifacts/teacher-assessments-mobile.png" });
  expect(errors).toEqual([]);
});
