import { test, expect } from "@playwright/test";
test("score matrix autosaves each student assessment cell and displays its audit history", async ({
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
  await page.getByRole("link", { name: "Input Nilai", exact: true }).click();
  await page
    .getByLabel("Penilaian mata pelajaran dan semester")
    .selectOption({ label: "Bahasa Indonesia · Semester 1 2026/2027" });
  await page
    .getByLabel("Kelas", { exact: true })
    .selectOption({ label: "7-Putra · Dewi Lestari" });
  await expect(page.locator(".score-matrix tbody tr")).toHaveCount(25);
  await expect(page.locator(".score-matrix thead th")).toHaveCount(12);
  const input = page
    .locator(".score-matrix tbody tr")
    .first()
    .locator("input")
    .first();
  const original = await input.inputValue();
  const value = original === "81" ? "82" : "81";
  await input.fill(value);
  await input.press("Enter");
  await expect(
    page.getByText("Semua perubahan tersimpan", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue(value);
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(input).toHaveValue(value);
  await page
    .getByRole("button", { name: "Riwayat perubahan", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Riwayat perubahan nilai" });
  await expect(drawer.locator(".score-history li").first()).toContainText(
    `→ ${value}`,
  );
  await expect(drawer.locator(".score-history li").first()).toContainText(
    "Dewi Lestari",
  );
  await page.screenshot({ path: "artifacts/score-history.png" });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/score-matrix.png" });
  await input.fill(original);
  await input.press("Enter");
  await expect(
    page.getByText("Semua perubahan tersimpan", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
