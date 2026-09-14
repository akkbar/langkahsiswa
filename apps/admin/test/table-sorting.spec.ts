import { test, expect } from "@playwright/test";

test("sorting covers all resource pages, preserves actions and supports keyboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Kode yayasan", { exact: false }).fill("simulasi");
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@simulasi.example.test");
  await page.getByLabel("Kata sandi", { exact: true }).fill("Simulasi!2026");
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await page.getByRole("button", { name: "Administrasi", exact: true }).click();
  await page.getByRole("link", { name: "Siswa", exact: true }).click();
  const header = page.getByRole("columnheader", { name: "NIS", exact: true });
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(
    page.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("SIM2026001");
  await page.getByRole("button", { name: "Berikutnya", exact: false }).click();
  await expect(
    page.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("SIM2026021");
  await header.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(
    page.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("SIM2026150");
  await expect(
    page
      .getByRole("columnheader", { name: "Aksi", exact: true })
      .getByRole("button"),
  ).toHaveCount(0);
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Detail", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("SIM2026150", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/table-sorting.png" });
  expect(errors).toEqual([]);
});

test("shared table sorts currency and dates, leaves blank values last and excludes control-only columns", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const reactPath = "/node_modules/.vite/deps/react.js";
    const domPath = "/node_modules/.vite/deps/react-dom_client.js";
    const tablePath = "/src/sortable-table.tsx";
    const { default: React } = await import(reactPath);
    const { default: ReactDOM } = await import(domPath);
    const { createRoot } = ReactDOM;
    const { SortableTable } = await import(tablePath);
    const root = document.createElement("div");
    root.id = "sort-fixture";
    root.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:white;padding:30px;overflow:auto";
    document.body.appendChild(root);
    const e = React.createElement;
    createRoot(root).render(
      e(
        SortableTable,
        {},
        e(
          "thead",
          {},
          e(
            "tr",
            {},
            ...["Nama", "Nominal", "Tanggal", "Opsi"].map((name) =>
              e("th", { key: name }, name),
            ),
          ),
        ),
        e(
          "tbody",
          {},
          ...[
            ["Baris 10", "Rp 10.000,00", "2 Januari 2027"],
            ["Baris 2", "Rp 2.000,00", "31 Desember 2026"],
            ["Baris 1", "—", "—"],
          ].map((row) =>
            e(
              "tr",
              { key: row[0] },
              ...row.map((value, i) => e("td", { key: i }, value)),
              e("td", {}, e("button", {}, "Edit")),
            ),
          ),
        ),
      ),
    );
  });
  const table = page.locator("#sort-fixture table");
  await table.getByRole("button", { name: "Nama", exact: true }).click();
  await expect(table.locator("tbody tr td:first-child")).toHaveText([
    "Baris 1",
    "Baris 2",
    "Baris 10",
  ]);
  await table.getByRole("button", { name: "Nominal", exact: true }).click();
  await expect(table.locator("tbody tr td:first-child")).toHaveText([
    "Baris 2",
    "Baris 10",
    "Baris 1",
  ]);
  await table.getByRole("button", { name: "Nominal", exact: true }).click();
  await expect(table.locator("tbody tr td:first-child")).toHaveText([
    "Baris 10",
    "Baris 2",
    "Baris 1",
  ]);
  await table.getByRole("button", { name: "Tanggal", exact: true }).click();
  await expect(table.locator("tbody tr td:first-child")).toHaveText([
    "Baris 2",
    "Baris 10",
    "Baris 1",
  ]);
  await expect(
    table
      .getByRole("columnheader", { name: "Opsi", exact: true })
      .getByRole("button"),
  ).toHaveCount(0);
});
