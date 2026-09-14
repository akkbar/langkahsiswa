import { test, expect } from "@playwright/test";
test("simulation curriculum settings, schedule preview and teacher workload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Kode yayasan", { exact: false }).fill("simulasi");
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@simulasi.example.test");
  await page.getByLabel("Kata sandi", { exact: true }).fill("Simulasi!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await page.getByRole("button", { name: "Yayasan", exact: true }).click();
  await page.getByRole("link", { name: "Mata Pelajaran", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mata Pelajaran", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pengaturan bobot:" }).click();
  const settings = page.getByRole("dialog", {
    name: "Pengaturan bobot pelajaran",
  });
  await expect(settings.getByLabel("Menit untuk 1 bobot")).toHaveValue("40");
  expect((await settings.boundingBox())?.width).toBe(600);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Tingkat & bobot", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveCount(3);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Simpan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Administrasi", exact: true }).click();
  await page
    .getByRole("link", { name: "Jadwal Pelajaran", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jadwal Pelajaran", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Semester", { exact: true })
    .selectOption({ label: "Semester 1 - 2026/2027" });
  await expect(page.getByText("210 data", { exact: true })).toBeVisible();
  await page.getByLabel("Mode tampilan").selectOption("load");
  await expect(
    page.getByRole("columnheader", { name: "Jam mengajar/pekan" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await page.getByRole("button", { name: "Susun otomatis" }).click();
  await page.getByRole("button", { name: "Buat pratinjau" }).click();
  await expect(
    page.getByText("210 sesi siap.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simpan jadwal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Mode tampilan").selectOption("week");
  await expect(
    page.getByRole("heading", { name: "Senin", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/simulation-schedule.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Susun otomatis" }).click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "artifacts/simulation-schedule-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
