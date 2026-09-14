import { test, expect } from "@playwright/test";

test("role setting separates realm and granular permissions", async ({
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
  await page.getByRole("link", { name: "Role Setting", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Role Setting" }),
  ).toBeVisible();

  const teacher = page.getByRole("row", {
    name: /^Guru Bawaan Operational/,
  });
  const foundationStaff = page.getByRole("row", {
    name: /^Staff Yayasan Bawaan Operational/,
  });
  await expect(teacher.getByText("Operational", { exact: true })).toBeVisible();
  await expect(
    foundationStaff.getByText("Operational", { exact: true }),
  ).toBeVisible();

  await teacher.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Guru" });
  const desktopBox = await dialog.boundingBox();
  expect(desktopBox?.width).toBe(600);
  expect((desktopBox?.x || 0) + (desktopBox?.width || 0)).toBe(
    page.viewportSize()?.width,
  );
  await expect(dialog.getByLabel("Realm account *")).toHaveValue("OPERATIONAL");
  await expect(
    dialog.getByRole("checkbox", { name: "Input nilai — Kelola" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await foundationStaff.getByRole("button", { name: "Edit" }).click();
  const foundationDialog = page.getByRole("dialog", {
    name: "Edit Staff Yayasan",
  });
  await expect(foundationDialog.getByLabel("Realm account *")).toHaveValue(
    "OPERATIONAL",
  );
  await expect(
    foundationDialog.getByRole("checkbox", { name: "Input nilai — Kelola" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Tutup editor role" }).click();
  await expect(foundationDialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await foundationStaff.getByRole("button", { name: "Edit" }).click();
  const mobileDialog = page.getByRole("dialog", {
    name: "Edit Staff Yayasan",
  });
  expect((await mobileDialog.boundingBox())?.width).toBe(390);
  await mobileDialog.getByRole("button", { name: "Tutup" }).click();
  await expect(mobileDialog).toBeHidden();
});
