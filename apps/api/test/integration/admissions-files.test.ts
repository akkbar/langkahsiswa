import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../../src/database/database.service";
import {
  createTenant,
  initializeRoles,
} from "../../src/modules/auth/tenant-provisioning";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 17–18: PPDB enrollment and tenant-isolated files", async () => {
  const original = {
    url: process.env.DATABASE_URL,
    storage: process.env.STORAGE_PATH,
    worker: process.env.NOTIFICATION_WORKER_ENABLED,
  };
  process.env.NOTIFICATION_WORKER_ENABLED = "false";
  const base = new Database();
  const schema = `admission_test_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original.url!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const storage = await mkdtemp(join(tmpdir(), "langkahsiswa-admission-"));
  process.env.STORAGE_PATH = storage;
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Sekolah PPDB",
        slug: "ppdb-test",
        admin_name: "Admin",
        admin_email: "admin@ppdb.test",
        admin_password: "Password!2026",
      }),
    );
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Sekolah Asing",
        slug: "foreign-ppdb",
        admin_name: "Admin Asing",
        admin_email: "admin@foreign-ppdb.test",
        admin_password: "Password!2026",
      }),
    );
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
      expected = 200,
    ) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(data)}`,
      );
      return data;
    }
    const login = (slug: string, email: string) =>
      request(
        "auth/login",
        "POST",
        { tenant_slug: slug, email, password: "Password!2026" },
        undefined,
        201,
      );
    const admin = (await login("ppdb-test", "admin@ppdb.test")).access_token;
    const foreign = (await login("foreign-ppdb", "admin@foreign-ppdb.test"))
      .access_token;
    const post = (path: string, body: unknown, token = admin, expected = 201) =>
      request(path, "POST", body, token, expected);
    const school = await post("schools", { name: "SMP Uji" });
    const year = await post("academic-years", {
      school_id: school.id,
      name: "2026/2027",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      is_active: true,
    });
    const grade = await post("grade-levels", {
      school_id: school.id,
      name: "Kelas 7",
      level: 7,
    });
    const targetClass = await post("classes", {
      academic_year_id: year.id,
      grade_level_id: grade.id,
      name: "7A",
    });
    const period = await post("admission-periods", {
      school_id: school.id,
      academic_year_id: year.id,
      name: "Gelombang Uji",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      capacity: 1,
    });
    assert.equal(
      (await request("public/admissions/ppdb-test/periods")).data.length,
      0,
    );
    await request(
      `admission-periods/${period.id}/status`,
      "PATCH",
      { status: "OPEN" },
      admin,
    );
    assert.equal(
      (await request("public/admissions/ppdb-test/periods")).data[0].id,
      period.id,
    );
    const input = {
      period_id: period.id,
      target_grade_level_id: grade.id,
      name: "Calon Siswa",
      email: "calon@example.test",
      phone: "081200000001",
      address: "Bandung",
      birth_date: "2013-01-02",
      gender: "FEMALE",
      guardian_name: "Wali Siswa",
      guardian_phone: "081200000002",
    };
    const application = await request(
      "public/admissions/ppdb-test/applications",
      "POST",
      input,
      undefined,
      201,
    );
    assert.match(application.registration_number, /^PPDB-\d{4}-[A-F0-9]{8}$/);
    await request(
      `public/admissions/ppdb-test/applications/${application.registration_number}/status`,
      "POST",
      { access_token: "x".repeat(32) },
      undefined,
      404,
    );
    const pdf = Buffer.from("%PDF-1.4\nPPDB test\n%%EOF");
    const firstDocument = await request(
      `public/admissions/ppdb-test/applications/${application.id}/documents`,
      "POST",
      {
        access_token: application.access_token,
        document_type: "AKTA_LAHIR",
        file_name: "akta.pdf",
        mime_type: "application/pdf",
        data_base64: pdf.toString("base64"),
      },
      undefined,
      201,
    );
    const document = await request(
      `public/admissions/ppdb-test/applications/${application.id}/documents`,
      "POST",
      {
        access_token: application.access_token,
        document_type: "AKTA_LAHIR",
        file_name: "akta-revisi.pdf",
        mime_type: "application/pdf",
        data_base64: pdf.toString("base64"),
      },
      undefined,
      201,
    );
    const publicStatus = await request(
      `public/admissions/ppdb-test/applications/${application.registration_number}/status`,
      "POST",
      { access_token: application.access_token },
      undefined,
      201,
    );
    assert.equal(publicStatus.documents[0].status, "PENDING");
    const queue = await request(
      "admissions/applications",
      "GET",
      undefined,
      admin,
    );
    assert.equal(queue.total, 1);
    await request(
      `admissions/documents/${queue.data[0].documents[0].id}`,
      "PATCH",
      { status: "VERIFIED", notes: "Lengkap" },
      admin,
    );
    await post(
      `admissions/applications/${application.id}/reviews`,
      { stage: "TEST", decision: "PASSED", score: 90, notes: "Salah tahap" },
      admin,
      409,
    );
    for (const review of [
      { stage: "DOCUMENT", score: null, notes: "Lengkap" },
      { stage: "TEST", score: 88, notes: "Lulus tes" },
      { stage: "INTERVIEW", score: 92, notes: "Diterima" },
    ])
      await post(`admissions/applications/${application.id}/reviews`, {
        ...review,
        decision: "PASSED",
      });
    const student = await post(
      `admissions/applications/${application.id}/re-registration`,
      {
        nis: "PPDB001",
        class_id: targetClass.id,
        final_program: "Regular",
        parent_confirmed: true,
      },
    );
    await post(
      `admissions/applications/${application.id}/re-registration`,
      {
        nis: "PPDB002",
        class_id: null,
        final_program: "Regular",
        parent_confirmed: true,
      },
      admin,
      201,
    );
    assert.equal(student.student.id, student.re_registration.student_id);
    const enrolled = await db.query(
      `SELECT a.status,cs.class_id FROM applications a JOIN class_students cs
       ON cs.tenant_id=a.tenant_id AND cs.student_id=a.student_id
       WHERE a.tenant_id=$1 AND a.id=$2`,
      [tenant.id, application.id],
    );
    assert.deepEqual(enrolled.rows[0], {
      status: "ENROLLED",
      class_id: targetClass.id,
    });
    const second = await request(
      "public/admissions/ppdb-test/applications",
      "POST",
      { ...input, name: "Calon Kedua", email: "kedua@example.test" },
      undefined,
      201,
    );
    const secondDocument = await post(
      `admissions/applications/${second.id}/documents`,
      {
        document_type: "AKTA_LAHIR",
        file_name: "akta-kedua.pdf",
        mime_type: "application/pdf",
        data_base64: pdf.toString("base64"),
      },
    );
    const refreshedQueue = await request(
      "admissions/applications",
      "GET",
      undefined,
      admin,
    );
    const filteredQueue = await request(
      `admissions/applications?period_id=${period.id}`,
      "GET",
      undefined,
      admin,
    );
    assert.equal(filteredQueue.total, 2);
    const filteredApplication = filteredQueue.data.find(
      (row: Record<string, any>) => row.id === application.id,
    );
    assert.equal(filteredApplication.applicant_name, "Calon Siswa");
    assert.equal(filteredApplication.applicant_email, "calon@example.test");
    const secondDocumentRow = refreshedQueue.data
      .find((row: Record<string, any>) => row.id === second.id)
      .documents.find(
        (row: Record<string, any>) => row.file_id === secondDocument.id,
      );
    await request(
      `admissions/documents/${secondDocumentRow.id}`,
      "PATCH",
      { status: "VERIFIED", notes: "Lengkap" },
      admin,
    );
    for (const stage of ["DOCUMENT", "TEST"])
      await post(`admissions/applications/${second.id}/reviews`, {
        stage,
        decision: "PASSED",
        score: stage === "TEST" ? 80 : null,
        notes: "",
      });
    await post(
      `admissions/applications/${second.id}/reviews`,
      { stage: "INTERVIEW", decision: "PASSED", score: 80, notes: "" },
      admin,
      409,
    );
    const library = await request("files", "GET", undefined, admin);
    assert.equal(library.total, 2);
    assert.ok(
      (await request("files?deleted=true", "GET", undefined, admin)).data.some(
        (row: Record<string, any>) => row.id === firstDocument.id,
      ),
    );
    const downloaded = await fetch(
      `${origin}/api/v1/files/${document.id}/download`,
      { headers: { Authorization: `Bearer ${admin}` } },
    );
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
    assert.equal(
      (
        await fetch(`${origin}/api/v1/files/${document.id}/download`, {
          headers: { Authorization: `Bearer ${foreign}` },
        })
      ).status,
      404,
    );
    await request(`files/${document.id}`, "DELETE", undefined, admin, 409);
    await post(
      "files",
      {
        category: "OTHER",
        description: "Tipuan",
        file_name: "bad.pdf",
        mime_type: "application/pdf",
        data_base64: Buffer.from("bukan pdf").toString("base64"),
      },
      admin,
      400,
    );
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const generic = await post("files", {
      category: "STUDENT_PHOTO",
      description: "Foto profil",
      entity_type: "STUDENT",
      entity_id: student.student.id,
      file_name: "foto.png",
      mime_type: "image/png",
      data_base64: png.toString("base64"),
    });
    await request(`files/${generic.id}`, "DELETE", undefined, admin);
    assert.equal(
      (await request("files?deleted=true", "GET", undefined, admin)).data[0].id,
      generic.id,
    );
    await post(`files/${generic.id}/restore`, {});
    const familyPeriod = await post("admission-periods", {
      school_id: school.id,
      academic_year_id: year.id,
      name: "Gelombang Keluarga",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      capacity: 10,
    });
    const track = await post("admission-tracks", {
      period_id: familyPeriod.id,
      name: "Internal 1",
      code: "INTERNAL-1",
      cost: 250000,
      capacity: 5,
    });
    await request(
      `admission-periods/${familyPeriod.id}/status`,
      "PATCH",
      { status: "OPEN" },
      admin,
    );
    const familyAuth = await request(
      "public/family/register",
      "POST",
      {
        tenant_slug: "ppdb-test",
        name: "Orang Tua Mandiri",
        email: "self-parent@ppdb.test",
        phone: "081299999999",
        password: "Password!2026",
      },
      undefined,
      201,
    );
    assert.equal(familyAuth.user.account_level, "FAMILY");
    assert.deepEqual(familyAuth.user.roles, ["PARENT"]);
    const firstOverview = await request(
      "family/overview",
      "GET",
      undefined,
      familyAuth.access_token,
    );
    assert.equal(firstOverview.needs_ppdb, true);
    assert.equal(
      firstOverview.periods.find((row: any) => row.id === familyPeriod.id)
        .tracks[0].cost,
      250000,
    );
    const familyApplication = await request(
      "family/applications",
      "POST",
      {
        period_id: familyPeriod.id,
        track_id: track.id,
        target_grade_level_id: grade.id,
        name: "Anak Mandiri",
        email: "candidate-child@ppdb.test",
        phone: null,
        address: "Bandung",
        birth_date: "2013-05-05",
        gender: "MALE",
      },
      familyAuth.access_token,
      201,
    );
    const familyDocument = await request(
      `family/applications/${familyApplication.id}/documents`,
      "POST",
      {
        document_type: "AKTA_LAHIR",
        file_name: "akta-anak.pdf",
        mime_type: "application/pdf",
        data_base64: pdf.toString("base64"),
      },
      familyAuth.access_token,
      201,
    );
    const familyDocumentRow = (
      await db.query(
        "SELECT id FROM application_documents WHERE tenant_id=$1 AND file_id=$2",
        [tenant.id, familyDocument.id],
      )
    ).rows[0];
    await request(
      `admissions/documents/${familyDocumentRow.id}`,
      "PATCH",
      { status: "VERIFIED", notes: "Lengkap" },
      admin,
    );
    for (const stage of ["DOCUMENT", "TEST", "INTERVIEW"])
      await post(`admissions/applications/${familyApplication.id}/reviews`, {
        stage,
        decision: "PASSED",
        score: stage === "DOCUMENT" ? null : 90,
        notes: "Lulus",
      });
    const familyRegistration = await post(
      `admissions/applications/${familyApplication.id}/re-registration`,
      {
        nis: "PPDB-FAMILY-1",
        class_id: null,
        final_program: "Regular",
        parent_confirmed: true,
      },
    );
    const familyStudent = familyRegistration.student;
    const enrolledOverview = await request(
      "family/overview",
      "GET",
      undefined,
      familyAuth.access_token,
    );
    assert.equal(enrolledOverview.needs_ppdb, false);
    assert.equal(enrolledOverview.students[0].account_ready, false);
    const childAccount = await request(
      `family/students/${familyStudent.id}/account`,
      "POST",
      { email: "child-login@ppdb.test", password: "Password!2026" },
      familyAuth.access_token,
      201,
    );
    assert.equal(childAccount.email, "child-login@ppdb.test");
    await request(
      `family/students/${familyStudent.id}/account`,
      "POST",
      { email: "second-child@ppdb.test", password: "Password!2026" },
      familyAuth.access_token,
      409,
    );
    const childAuth = await login("ppdb-test", "child-login@ppdb.test");
    assert.equal(childAuth.user.account_level, "FAMILY");
    assert.deepEqual(childAuth.user.roles, ["STUDENT"]);
    await post("users", {
      name: "Wali",
      email: "parent@ppdb.test",
      password: "Password!2026",
      roles: ["PARENT"],
    });
    const parent = (await login("ppdb-test", "parent@ppdb.test")).access_token;
    await request("admissions/applications", "GET", undefined, parent, 403);
    await request("files", "GET", undefined, parent, 403);
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original.url;
    process.env.STORAGE_PATH = original.storage;
    process.env.NOTIFICATION_WORKER_ENABLED = original.worker;
    await rm(storage, { recursive: true, force: true });
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
