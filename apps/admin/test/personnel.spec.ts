import { test, expect } from "@playwright/test";

test("account roles and personnel records use their dedicated areas", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@demo.langkahsiswa.id");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("LangkahSiswa!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();

  await page.getByRole("button", { name: "Pengaturan" }).click();
  const settings = page.locator(".nav-group").filter({
    has: page.getByRole("button", { name: "Pengaturan", exact: true }),
  });
  await expect(
    settings.getByRole("link", { name: "Semua Akun" }),
  ).toBeVisible();
  await settings.getByRole("link", { name: "Semua Akun" }).click();
  await expect(page.getByRole("heading", { name: "Semua Akun" })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Cari akun" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Atur role" }).first().click();
  const roleDrawer = page.getByRole("dialog", { name: /.+/ });
  expect((await roleDrawer.boundingBox())?.width).toBe(600);
  await expect(roleDrawer.getByText("Role dan realm account")).toBeVisible();
  await roleDrawer.getByRole("button", { name: "Tutup" }).click();

  await page.getByRole("button", { name: "Yayasan" }).click();
  const foundation = page.locator(".nav-group").filter({
    has: page.getByRole("button", { name: "Yayasan", exact: true }),
  });
  await expect(
    foundation.getByRole("link", { name: "Semua Akun" }),
  ).toHaveCount(0);
  await foundation.getByRole("link", { name: "Guru dan Staff" }).click();
  await expect(
    page.getByRole("heading", { name: "Guru dan Staff" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  const personnelDrawer = page.getByRole("dialog", { name: "Edit guru" });
  expect((await personnelDrawer.boundingBox())?.width).toBe(600);
  await expect(
    personnelDrawer.getByText("Binding mata pelajaran dan tingkat"),
  ).toBeVisible();
  await expect(personnelDrawer.getByLabel("Gaji pokok")).toBeVisible();
  await expect(personnelDrawer.getByLabel("Nomor rekening")).toBeVisible();
  await expect(personnelDrawer.getByLabel("NPWP")).toBeVisible();
  await personnelDrawer.getByRole("button", { name: "Tutup" }).click();
});
