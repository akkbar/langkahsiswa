import { test, expect } from "@playwright/test";
test("admin manages student data, edits schedules, and uses academic screens", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Masuk ke sekolah Anda" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@demo.langkahsiswa.id");
  await page.getByLabel("Kata sandi", { exact: true }).fill("LangkahSiswa!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await expect(
    page.getByRole("heading", { name: "Siswa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tambah siswa" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("NIS", { exact: true }).fill(`UI${Date.now()}`);
  await dialog.getByLabel("Nama", { exact: false }).fill("Siswa Uji Browser");
  await dialog.getByRole("button", { name: "Simpan data" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("textbox", { name: "Cari nama" })
    .fill("Siswa Uji Browser");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Siswa Uji Browser", exact: true }),
    })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog
    .getByLabel("Nama", { exact: false })
    .fill("Siswa Uji Browser Diperbarui");
  await dialog.getByRole("button", { name: "Simpan data" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", {
        name: "Siswa Uji Browser Diperbarui",
        exact: true,
      }),
    })
    .first()
    .getByRole("button", { name: "Detail" })
    .click();
  await expect(
    dialog.getByText("Siswa Uji Browser Diperbarui", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Tutup", exact: true })
    .last()
    .click();
  await page.getByRole("textbox", { name: "Cari nama" }).fill("");
  await page.screenshot({
    path: "test-results/students-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Jadwal Pelajaran" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await dialog.getByLabel("Ruangan").fill("Ruang 7A");
  await dialog.getByRole("button", { name: "Simpan data" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: "Absensi", exact: true }).click();
  await page
    .getByLabel("Kelas", { exact: true })
    .selectOption({ label: "7A · 2026/2027" });
  await page
    .getByLabel("Semester", { exact: true })
    .selectOption({ label: "Semester 1 · 2026/2027" });
  await page.getByLabel("Tanggal", { exact: true }).fill("2026-09-07");
  await expect(page.getByLabel("Kehadiran Ahmad Pratama")).toBeVisible();
  await page.getByLabel("Kehadiran Ahmad Pratama").selectOption("LATE");
  await page.getByRole("button", { name: "Simpan absensi" }).click();
  await expect(page.getByText("Absensi berhasil disimpan.")).toBeVisible();
  await page.getByRole("link", { name: "Input Nilai" }).click();
  await page
    .getByLabel("Penilaian", { exact: true })
    .selectOption({ index: 1 });
  await expect(page.getByLabel("Nilai Ahmad Pratama")).toBeVisible();
  await page.getByLabel("Nilai Ahmad Pratama").fill("85");
  await page.getByRole("button", { name: "Simpan nilai" }).click();
  await expect(
    page.getByText("Nilai berhasil disimpan.", { exact: false }),
  ).toBeVisible();
  for (const index of [2, 3, 4]) {
    await page.getByLabel("Penilaian", { exact: true }).selectOption({ index });
    await expect(page.getByLabel("Nilai Ahmad Pratama")).toBeVisible();
    await page.getByLabel("Nilai Ahmad Pratama").fill("85");
    await page.getByRole("button", { name: "Simpan nilai" }).click();
    await expect(
      page.getByText("Nilai berhasil disimpan.", { exact: false }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Raport Siswa" }).click();
  await expect(
    page.getByRole("heading", { name: "Raport siswa" }),
  ).toBeVisible();
  await page
    .getByLabel("Kelas", { exact: true })
    .selectOption({ label: "7A · 2026/2027" });
  await page
    .getByLabel("Semester", { exact: true })
    .selectOption({ label: "Semester 1 · 2026/2027" });
  await page
    .getByLabel("Siswa", { exact: true })
    .selectOption({ label: "Ahmad Pratama" });
  await page.getByRole("button", { name: "Hitung raport" }).click();
  await expect(
    page.getByRole("heading", { name: "Ahmad Pratama", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "85.00", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Catatan wali kelas")
    .fill("Pertahankan semangat belajar.");
  await page.getByRole("button", { name: "Selesaikan review" }).click();
  await expect(
    page.getByRole("button", { name: "Publikasikan", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^raport-.*\.pdf$/);
  await page.getByRole("button", { name: "Buka kembali", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Selesaikan review" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reports-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Raport siswa" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka menu" }).click();
  await page.getByRole("link", { name: "Siswa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Siswa", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/students-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Masuk ke sekolah Anda" }),
  ).toBeVisible();
  assertNoErrors();
  function assertNoErrors() {
    expect(errors).toEqual([]);
  }
});
