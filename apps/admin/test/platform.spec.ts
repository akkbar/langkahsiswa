import { test, expect, type Page } from "@playwright/test";

const password = "LangkahSiswa!2026";
async function login(page: Page, email = "admin@demo.langkahsiswa.id") {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await expect(page.locator(".account-trigger")).toBeVisible();
}

test("light and dark themes persist on desktop and mobile", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "test-results/login-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Aktifkan mode gelap" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(3, 5, 8)",
  );
  await expect(page.locator(".login-story")).toHaveCSS(
    "background-image",
    /linear-gradient/,
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/login-dark.png",
    fullPage: true,
  });
  await login(page);
  await expect(page.locator(".nav-submenu")).toHaveCount(0);
  await page.getByRole("button", { name: "Data Sekolah" }).click();
  await expect(page.locator(".nav-submenu a")).toHaveText([
    "Lokasi Sekolah",
    "Guru dan Staff",
    "Mata Pelajaran",
    "Tingkat Kelas",
    "Kelas",
  ]);
  await page.getByRole("button", { name: "Data Sekolah" }).click();
  await page.getByRole("button", { name: "Pengaturan" }).click();
  await expect(
    page
      .locator(".nav-group")
      .filter({ hasText: "Pengaturan" })
      .locator(".nav-submenu a"),
  ).toHaveText(["Audit & Keamanan", "Permission dan Role Setting"]);
  await page.getByRole("button", { name: "Pengaturan" }).click();
  await page.getByRole("link", { name: "Siswa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Siswa", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-group a.active")).toHaveCSS(
    "background-color",
    "rgb(0, 74, 173)",
  );
  await expect(page.locator(".nav-group a.active")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({
    path: "test-results/students-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/students-dark-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(page.locator(".sidebar-account")).toBeVisible();
  await page.locator(".account-trigger").click();
  await expect(page.getByRole("menuitem", { name: "Akun Saya" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Keluar" })).toBeVisible();
  await page.screenshot({
    path: "test-results/sidebar-account-dark-mobile.png",
    fullPage: true,
  });
  await page.getByRole("menuitem", { name: "Akun Saya" }).click();
  await expect(
    page.getByRole("dialog", { name: /Administrator Sekolah/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tutup detail akun" }).click();
  await page.locator(".account-trigger").click();
  await page.getByRole("menuitem", { name: "Aktifkan mode terang" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Tutup menu" })
    .click({ position: { x: 300, y: 20 } });
  await page.screenshot({
    path: "test-results/students-light-mobile.png",
    fullPage: true,
  });
});

test("public PPDB flows into enrollment and managed file archive", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const suffix = Date.now().toString();
  const authResponse = await request.post("/api/v1/auth/login", {
    data: {
      tenant_slug: "demo",
      email: "admin@demo.langkahsiswa.id",
      password,
    },
  });
  expect(authResponse.ok(), await authResponse.text()).toBe(true);
  const auth = await authResponse.json();
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  async function get(path: string) {
    const response = await request.get(`/api/v1/${path}`, { headers });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  async function post(path: string, data: unknown) {
    const response = await request.post(`/api/v1/${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const school = (await get("schools?limit=100")).data[0];
  const year = (await get("academic-years?limit=100")).data[0];
  const grade = (await get("grade-levels?limit=100")).data[0];
  const period = await post("admission-periods", {
    school_id: school.id,
    academic_year_id: year.id,
    name: `PPDB UI ${suffix}`,
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    capacity: 10,
  });
  const opened = await request.patch(
    `/api/v1/admission-periods/${period.id}/status`,
    { headers, data: { status: "OPEN" } },
  );
  expect(opened.ok(), await opened.text()).toBe(true);

  await page.goto("/#ppdb");
  await expect(
    page.getByRole("heading", { name: "Formulir PPDB" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lihat periode" }).click();
  await page
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption(period.id);
  await page
    .getByRole("combobox", { name: "Tingkat tujuan", exact: true })
    .selectOption(grade.id);
  const applicantName = `Calon UI ${suffix}`;
  await page.getByLabel("Nama calon siswa").fill(applicantName);
  await page.getByLabel("Nama wali").fill(`Wali UI ${suffix}`);
  await page.getByLabel("Telepon wali").fill("081234567890");
  await page.screenshot({
    path: "test-results/ppdb-public-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await expect(page.getByText("Pendaftaran berhasil dikirim.")).toBeVisible();
  await expect(page.locator(".access-code")).toBeVisible();
  const png = {
    name: "akta-ui.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQj8AAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await page.getByLabel("Berkas", { exact: true }).setInputFiles(png);
  await page.getByRole("button", { name: "Unggah dokumen" }).click();
  await expect(page.getByText("Dokumen berhasil diunggah")).toBeVisible();

  await page.getByRole("link", { name: "Masuk akun sekolah" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@demo.langkahsiswa.id");
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk ke LangkahSiswa" }).click();
  await page.getByRole("link", { name: "PPDB", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(applicantName) }).click();
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await page.getByRole("button", { name: "Simpan review" }).click();
  await expect(page.locator(".detail-heading .badge")).toHaveText("TEST");
  await page.getByLabel("Tahap").selectOption("TEST");
  await page.getByLabel("Nilai").fill("85");
  await page.getByRole("button", { name: "Simpan review" }).click();
  await expect(page.locator(".detail-heading .badge")).toHaveText("INTERVIEW");
  await page.getByLabel("Tahap").selectOption("INTERVIEW");
  await page.getByLabel("Nilai").fill("90");
  await page.getByRole("button", { name: "Simpan review" }).click();
  await expect(page.locator(".detail-heading .badge")).toHaveText("ACCEPTED");
  await page.getByLabel("NIS", { exact: true }).fill(`P${suffix}`);
  await page.getByRole("button", { name: "Buat data siswa" }).click();
  await expect(page.getByText("Pendaftar resmi menjadi siswa.")).toBeVisible();

  await page.getByRole("link", { name: "Manajemen Berkas" }).click();
  await expect(page.getByText("akta-ui.png").first()).toBeVisible();
  await page.getByRole("button", { name: "Unggah berkas" }).click();
  await page
    .getByLabel("Berkas", { exact: true })
    .setInputFiles({ ...png, name: `arsip-ui-${suffix}.png` });
  await page
    .getByRole("combobox", { name: "Kategori", exact: true })
    .selectOption("OTHER");
  await page.getByRole("button", { name: "Unggah maksimal 5 MB" }).click();
  await expect(
    page.getByText("Berkas tersimpan di pustaka privat."),
  ).toBeVisible();
  const fileRow = page
    .getByRole("row")
    .filter({ hasText: `arsip-ui-${suffix}.png` });
  await fileRow.getByRole("button", { name: "Arsipkan" }).click();
  await page.getByRole("button", { name: "Arsip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pulihkan" })).toBeVisible();
  await page.getByRole("button", { name: "Pulihkan" }).click();
  await page.screenshot({
    path: "test-results/ppdb-files-light.png",
    fullPage: true,
  });
});

test("parent pays invoice, tops up wallet, monitors POS limits, and receives targeted events", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const suffix = Date.now().toString();
  const studentName = `Siswa Finansial ${suffix}`;
  const email = `parent-ui-${suffix}@example.test`;
  const auth = await (
    await request.post("/api/v1/auth/login", {
      data: {
        tenant_slug: "demo",
        email: "admin@demo.langkahsiswa.id",
        password,
      },
    })
  ).json();
  async function create(path: string, data: unknown) {
    const result = await request.post(`/api/v1/${path}`, {
      headers: { Authorization: `Bearer ${auth.access_token}` },
      data,
    });
    expect(result.ok(), await result.text()).toBe(true);
    return result.json();
  }
  const account = await create("users", {
    name: `Wali UI ${suffix}`,
    email,
    password,
    roles: ["PARENT"],
  });
  const student = await create("students", {
    name: studentName,
    nis: `F${suffix}`,
  });
  const guardian = await create("parents", {
    name: `Wali UI ${suffix}`,
    user_id: account.id,
  });
  await create("student-guardians", {
    student_id: student.id,
    parent_id: guardian.id,
    relationship: "GUARDIAN",
    receive_notification: true,
  });
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await login(page);
  await page
    .getByRole("link", { name: "Tagihan Sekolah", exact: true })
    .click();
  await page.getByRole("button", { name: "Buat tagihan", exact: true }).click();
  const invoiceForm = page.getByRole("form", {
    name: "Tagihan baru",
    exact: true,
  });
  await expect(invoiceForm).toBeVisible();
  await invoiceForm
    .getByRole("combobox", { name: "Siswa", exact: true })
    .selectOption(student.id);
  await invoiceForm
    .getByLabel("Nama tagihan", { exact: true })
    .fill(`SPP September ${suffix}`);
  await invoiceForm.getByLabel("Jumlah (Rp)", { exact: true }).fill("50000");
  await invoiceForm
    .getByLabel("Jatuh tempo", { exact: true })
    .fill("2026-09-30");
  await invoiceForm
    .getByRole("button", { name: "Simpan tagihan", exact: true })
    .click();
  await expect(
    page.getByText("Tagihan berhasil dibuat.", { exact: true }),
  ).toBeVisible();
  const parentContext = await browser.newContext();
  const parent = await parentContext.newPage();
  parent.on("pageerror", (e) => browserErrors.push(e.message));
  try {
    await login(parent, email);
    await expect(
      parent.getByRole("heading", { name: "Keluarga saya", exact: true }),
    ).toBeVisible();
    await expect(
      parent.getByRole("link", { name: "Kasir Kantin", exact: true }),
    ).toHaveCount(0);
    await parent
      .getByRole("link", { name: "Tagihan Sekolah", exact: true })
      .click();
    await parent
      .getByRole("button", { name: "Lihat tagihan", exact: true })
      .click();
    const proof = {
      name: "bukti-transfer.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQj8AAAAASUVORK5CYII=",
        "base64",
      ),
    };
    await parent
      .getByLabel("Bukti transfer", { exact: false })
      .setInputFiles(proof);
    await parent
      .getByRole("button", { name: "Kirim bukti pembayaran", exact: true })
      .click();
    await expect(
      parent.getByText(
        "Bukti pembayaran dikirim. Menunggu verifikasi keuangan.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    const paymentRow = page
      .getByRole("row")
      .filter({ hasText: studentName })
      .filter({
        has: page.getByRole("button", {
          name: "Periksa pembayaran",
          exact: true,
        }),
      });
    await paymentRow
      .getByRole("button", { name: "Periksa pembayaran", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Setujui pembayaran", exact: true })
      .click();
    await expect(
      page.getByText("Pembayaran disetujui.", { exact: true }),
    ).toBeVisible();
    await parent.reload();
    await expect(parent.getByText("Lunas", { exact: true })).toBeVisible();
    await parent.screenshot({
      path: "test-results/parent-billing-light.png",
      fullPage: true,
    });
    await parent
      .getByRole("link", { name: "Dompet Siswa", exact: true })
      .click();
    await parent.getByLabel("Jumlah (Rp)", { exact: true }).fill("100000");
    await parent
      .getByLabel("Bukti transfer", { exact: false })
      .setInputFiles(proof);
    await parent
      .getByRole("button", { name: "Kirim permintaan isi saldo", exact: true })
      .click();
    await expect(
      parent.getByText("Permintaan isi saldo dikirim untuk diverifikasi.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Dompet Siswa", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Siswa", exact: true })
      .selectOption(student.id);
    const topup = page
      .getByRole("row")
      .filter({ hasText: studentName })
      .filter({
        has: page.getByRole("button", {
          name: "Periksa isi saldo",
          exact: true,
        }),
      });
    await topup
      .getByRole("button", { name: "Periksa isi saldo", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Setujui isi saldo", exact: true })
      .click();
    await expect(
      page.getByText("Isi saldo disetujui dan saldo diperbarui.", {
        exact: true,
      }),
    ).toBeVisible();
    await parent.reload();
    await parent.getByLabel("Batas harian (Rp)", { exact: true }).fill("20000");
    await parent
      .getByLabel("Batas bulanan (Rp)", { exact: true })
      .fill("50000");
    await parent
      .getByRole("button", { name: "Simpan batas belanja", exact: true })
      .click();
    await expect(
      parent.getByText("Batas belanja disimpan.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Kasir Kantin", exact: true }).click();
    await page
      .getByRole("button", { name: "Kelola katalog", exact: true })
      .click();
    await page
      .getByLabel("Nama merchant", { exact: true })
      .fill(`Kantin UI ${suffix}`);
    await page
      .getByRole("button", { name: "Simpan merchant", exact: true })
      .click();
    await expect(
      page.getByText("Merchant berhasil ditambahkan.", { exact: true }),
    ).toBeVisible();
    // Reload options after creation; selecting by name also checks merchant wiring.
    await page
      .getByRole("combobox", { name: "Merchant", exact: true })
      .selectOption({ label: `Kantin UI ${suffix}` });
    await page
      .getByLabel("Nama produk", { exact: true })
      .fill(`Nasi UI ${suffix}`);
    await page.getByLabel("Harga produk (Rp)", { exact: true }).fill("12000");
    await page
      .getByLabel("Stok (kosong = tak terbatas)", { exact: true })
      .fill("5");
    await page
      .getByRole("button", { name: "Simpan produk", exact: true })
      .click();
    await expect(
      page.getByText("Produk berhasil ditambahkan.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tutup katalog", exact: true })
      .click();
    await page
      .getByLabel("NIS atau nama siswa", { exact: true })
      .fill(student.nis);
    await page.getByRole("button", { name: "Cari siswa", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Pilih siswa pembayaran", exact: true })
      .selectOption(student.id);
    await page
      .getByRole("button", { name: new RegExp(`Nasi UI ${suffix}`) })
      .click();
    await page
      .getByRole("button", { name: "Bayar dengan dompet", exact: true })
      .click();
    await expect(
      page.getByText("Pembayaran berhasil. Saldo siswa telah diperbarui.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/pos-light.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: new RegExp(`Nasi UI ${suffix}`) })
      .click();
    await page
      .getByRole("button", { name: "Bayar dengan dompet", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Batas belanja harian terlampaui",
    );
    await parent.reload();
    await expect(parent.locator(".metric.accent strong")).toHaveText(/88\.000/);
    await expect(parent.locator(".metric").nth(1).locator("strong")).toHaveText(
      /12\.000/,
    );
    await parent.locator(".account-trigger").click();
    await parent.getByRole("menuitem", { name: "Aktifkan mode gelap" }).click();
    await parent.screenshot({
      path: "test-results/parent-wallet-dark.png",
      fullPage: true,
    });
    await parent.setViewportSize({ width: 390, height: 844 });
    await parent.screenshot({
      path: "test-results/parent-wallet-dark-mobile.png",
      fullPage: true,
    });
    expect(
      await parent.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await parent.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("link", { name: "Agenda Sekolah", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Buat agenda", exact: true })
      .click();
    const title = `Pertemuan wali ${suffix}`;
    await page.getByLabel("Judul agenda", { exact: true }).fill(title);
    await page.getByLabel("Mulai", { exact: true }).fill("2026-09-20T09:00");
    await page
      .getByRole("combobox", { name: "Penerima agenda", exact: true })
      .selectOption("STUDENT");
    await page
      .getByRole("combobox", { name: "Tujuan agenda", exact: true })
      .selectOption(student.id);
    await page
      .getByLabel("Deskripsi", { exact: true })
      .fill("Pertemuan perkembangan belajar siswa.");
    await page
      .getByRole("button", { name: "Simpan draft agenda", exact: true })
      .click();
    const event = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await event
      .getByRole("button", { name: "Publikasikan agenda", exact: true })
      .click();
    await expect(
      page.getByText(
        "Agenda dipublikasikan. Notifikasi tersedia untuk penerima.",
        { exact: true },
      ),
    ).toBeVisible();
    await parent.getByRole("link", { name: "Notifikasi", exact: true }).click();
    const notification = parent.locator("article").filter({
      has: parent.getByRole("heading", { name: title, exact: true }),
    });
    await notification
      .getByRole("button", { name: "Tandai sudah dibaca", exact: true })
      .click();
    await expect(
      notification.getByText("Sudah dibaca", { exact: true }),
    ).toBeVisible();
    await notification.getByRole("link", { name: "Buka rincian" }).click();
    await expect(
      parent.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await parent.screenshot({
      path: "test-results/parent-events-dark.png",
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  } finally {
    await parentContext.close();
  }
});

test("Google login handles first-time account linking with the current school code", async ({
  page,
  request,
}) => {
  const auth = await (
    await request.post("/api/v1/auth/login", {
      data: {
        tenant_slug: "demo",
        email: "admin@demo.langkahsiswa.id",
        password,
      },
    })
  ).json();
  await page.route("**/api/v1/auth/google/config", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        client_id: "test-client.apps.googleusercontent.com",
      },
    }),
  );
  // GIS is stubbed here; backend identity verification is covered by API integration tests.
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{id:{initialize:function(o){this.options=o},renderButton:function(el){var b=document.createElement('button');b.textContent='Masuk dengan Google';b.onclick=()=>this.options.callback({credential:'test-credential'});el.appendChild(b)},cancel:function(){}}}};`,
    }),
  );
  const requests: any[] = [];
  await page.route("**/api/v1/auth/google", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill(
      body.account_password
        ? { json: auth }
        : {
            status: 401,
            json: {
              message: "GOOGLE_LINK_REQUIRED: Masukkan kata sandi akun sekolah",
            },
          },
    );
  });
  await page.goto("/");
  await page.getByLabel("Kode sekolah", { exact: true }).fill("demo");
  await page
    .getByRole("button", { name: "Masuk dengan Google", exact: true })
    .click();
  await page
    .getByLabel("Kata sandi akun sekolah", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Tautkan akun Google", exact: true })
    .click();
  await page.getByRole("link", { name: "Siswa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Siswa", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([
    { tenant_slug: "demo", credential: "test-credential" },
    {
      tenant_slug: "demo",
      credential: "test-credential",
      account_password: password,
    },
  ]);
});
