import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import {
  createTenant,
  initializeRoles,
} from "../../src/modules/auth/tenant-provisioning";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 20–22 and 24: domains, boarding, library, wallet and security", async () => {
  const original = process.env.DATABASE_URL;
  process.env.NOTIFICATION_WORKER_ENABLED = "false";
  const base = new Database();
  const schema = `operations_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Operations School",
        slug: "operations",
        admin_name: "Admin Operations",
        admin_email: "admin@operations.test",
        admin_password: "Password!2026",
      }),
    );
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Foreign School",
        slug: "operations-foreign",
        admin_name: "Foreign Admin",
        admin_email: "admin@operations-foreign.test",
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
    const adminLogin = await login("operations", "admin@operations.test");
    const admin = adminLogin.access_token;
    const foreign = (
      await login("operations-foreign", "admin@operations-foreign.test")
    ).access_token;
    const post = (
      path: string,
      body: unknown = {},
      expected = 201,
      token = admin,
    ) => request(path, "POST", body, token, expected);

    const domain = await post("domains", {
      domain: "school.operations.example",
    });
    assert.equal(domain.verification_status, "PENDING");
    assert.equal(domain.instructions.cname.value, "domains.langkahsiswa.id");
    assert.match(domain.instructions.txt.value, /^langkahsiswa-verification=/);
    assert.equal(
      (await request("domains", "GET", undefined, foreign)).total,
      0,
    );
    assert.equal(
      (await request("boarding/overview", "GET", undefined, foreign))
        .dormitories.length,
      0,
    );
    assert.equal(
      (await request("library/overview", "GET", undefined, foreign)).books
        .length,
      0,
    );
    await db.query(
      "UPDATE tenant_domains SET verified_at=now(),verification_status='ACTIVE' WHERE id=$1",
      [domain.id],
    );

    const school = await post("schools", {
      name: "SMP Operations",
      address: "Jl. Operasi",
      phone: "021",
    });
    const year = await post("academic-years", {
      school_id: school.id,
      name: "2026/2027",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      is_active: true,
    });
    const student = await post("students", {
      nis: "OPS-001",
      name: "Siswa Pondok",
      gender: "MALE",
      status: "ACTIVE",
    });
    const parent = await post("parents", { name: "Wali Siswa" });

    const dormitory = await post("boarding/dormitories", {
      name: "Asrama Putra",
      gender: "MALE",
      description: "Gedung A",
    });
    const room = await post("boarding/rooms", {
      dormitory_id: dormitory.id,
      name: "A-01",
      floor: 1,
      capacity: 1,
    });
    const bed = await post("boarding/beds", {
      room_id: room.id,
      code: "A-01-1",
    });
    await post("boarding/beds", { room_id: room.id, code: "A-01-2" }, 409);
    const assignment = await post("boarding/assignments", {
      student_id: student.id,
      bed_id: bed.id,
      start_date: "2026-09-09",
    });
    await post(
      "boarding/assignments",
      { student_id: student.id, bed_id: bed.id, start_date: "2026-09-09" },
      409,
    );
    const leave = await post("boarding/leaves", {
      student_id: student.id,
      start_at: "2026-09-10T01:00:00.000Z",
      end_at: "2026-09-11T01:00:00.000Z",
      reason: "Keperluan keluarga",
    });
    await post(`boarding/leaves/${leave.id}/review`, {
      decision: "APPROVED",
      notes: "Diizinkan",
    });
    await post("boarding/leaves/gate", {
      gate_token: leave.gate_token,
      direction: "OUT",
    });
    await post("boarding/leaves/gate", {
      gate_token: leave.gate_token,
      direction: "IN",
    });
    const visit = await post("boarding/visits", {
      student_id: student.id,
      parent_id: parent.id,
      visitor_name: "Wali Siswa",
      visit_at: "2026-09-12T02:00:00.000Z",
      purpose: "Kunjungan",
    });
    await post(`boarding/visits/${visit.id}/status`, { status: "COMPLETED" });
    await post("boarding/discipline", {
      student_id: student.id,
      incident_date: "2026-09-09",
      category: "Kedisiplinan",
      points: 5,
      description: "Terlambat apel",
      follow_up: "Pembinaan",
    });
    await post("boarding/tahfidz", {
      student_id: student.id,
      record_date: "2026-09-09",
      surah: "Al-Baqarah",
      from_verse: 1,
      to_verse: 5,
      score: 88,
      notes: "Baik",
    });
    await post("boarding/tahfidz-targets", {
      student_id: student.id,
      academic_year_id: year.id,
      target_type: "TAHFIDZ",
      target_name: "Juz 30",
      target_juz: 1,
      start_date: "2026-07-01",
      end_date: "2027-06-30",
    });
    const habit = await post("boarding/worship-habits", {
      school_id: school.id,
      name: "Salat Subuh berjamaah",
      category: "Salat wajib",
    });
    await post("boarding/worship-records", {
      student_id: student.id,
      habit_id: habit.id,
      record_date: "2026-09-09",
      status: "DONE",
      notes: "",
    });
    await post("boarding/character", {
      student_id: student.id,
      record_date: "2026-09-09",
      dimension: "Tanggung jawab",
      record_type: "POSITIVE",
      severity: null,
      points: 5,
      notes: "Menjadi imam",
      follow_up: "",
      approval_status: "NOT_REQUIRED",
    });
    await post("boarding/health", {
      student_id: student.id,
      visited_at: "2026-09-09T01:00:00.000Z",
      complaint: "Pusing",
      diagnosis: "Kelelahan",
      treatment: "Istirahat",
      medicine: null,
      referral: null,
      allergy_notes: null,
      activity_excuse_until: null,
      guardian_notified: false,
    });
    const diniyah = await post("boarding/diniyah-subjects", {
      school_id: school.id,
      name: "Fikih",
      book_name: "Safinatun Najah",
      teacher_id: null,
    });
    await post("boarding/diniyah-progress", {
      student_id: student.id,
      diniyah_subject_id: diniyah.id,
      chapter: "Thaharah",
      status: "IN_PROGRESS",
      score: 85,
      notes: "",
    });
    await post("boarding/inspections", {
      room_id: room.id,
      inspected_at: "2026-09-09T02:00:00.000Z",
      cleanliness_score: 90,
      facility_condition: "Baik",
      notes: "",
    });
    await post("boarding/modules/MUTABAAH", {
      school_id: school.id,
      enabled: true,
      config: {},
    });
    await post("boarding/activities", {
      dormitory_id: dormitory.id,
      activity_date: "2026-09-09",
      name: "Apel malam",
      start_time: "20:00",
      end_time: "20:30",
      description: "",
    });
    const laundry = await post("boarding/laundry", {
      student_id: student.id,
      bag_code: "BAG-001",
      weight_kg: 2.5,
      amount: 3000,
    });
    await db.query(
      "INSERT INTO wallet_accounts(tenant_id,student_id,balance) SELECT tenant_id,id,10000 FROM students WHERE id=$1",
      [student.id],
    );
    const charged = await post(`boarding/laundry/${laundry.id}/charge`);
    assert.ok(charged.wallet_transaction_id);
    const boardingOverview = await request(
      "boarding/overview",
      "GET",
      undefined,
      admin,
    );
    assert.equal(boardingOverview.assignments[0].id, assignment.id);
    assert.equal(boardingOverview.worship_records.length, 1);
    assert.equal(boardingOverview.character.length, 1);
    assert.equal(boardingOverview.health.length, 1);
    assert.equal(boardingOverview.diniyah_progress.length, 1);
    await post(`boarding/assignments/${assignment.id}/end`, {
      end_date: "2026-09-10",
    });

    const book = await post("library/books", {
      isbn: "978000000001",
      title: "Buku Uji",
      author: "Penulis",
      publisher: "Penerbit",
      publication_year: 2026,
      category: "Pendidikan",
    });
    const copy = await post("library/copies", {
      book_id: book.id,
      barcode: "LIB-001",
    });
    const futureDueDate = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const borrowing = await post("library/borrowings", {
      copy_id: copy.id,
      student_id: student.id,
      due_date: futureDueDate,
    });
    await post(
      "library/borrowings",
      { copy_id: copy.id, student_id: student.id, due_date: futureDueDate },
      409,
    );
    await post(`library/borrowings/${borrowing.id}/return`, {
      condition: "LOST",
      damage_fee: 0,
      lost_fee: 2000,
    });
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM library_returns WHERE borrowing_id=$1",
            [borrowing.id],
          )
        ).rows[0].count,
      ),
      1,
    );
    const library = await request("library/overview", "GET", undefined, admin);
    assert.equal(library.borrowings[0].status, "LOST");
    assert.equal(library.penalties[0].amount, 2000);
    const resolved = await post(
      `library/penalties/${library.penalties[0].id}/resolve`,
      { method: "WALLET" },
    );
    assert.equal(resolved.status, "PAID");
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT balance FROM wallet_accounts WHERE student_id=$1",
            [student.id],
          )
        ).rows[0].balance,
      ),
      5000,
    );

    const parentUser = await post("users", {
      name: "Wali Portal",
      email: "parent@operations.test",
      password: "Password!2026",
      roles: ["PARENT"],
    });
    await request(
      `parents/${parent.id}`,
      "PATCH",
      { user_id: parentUser.id },
      admin,
    );
    await post("student-guardians", {
      student_id: student.id,
      parent_id: parent.id,
      relationship: "GUARDIAN",
      is_primary: true,
      can_pickup: true,
      receive_notification: true,
    });
    const parentToken = (await login("operations", "parent@operations.test"))
      .access_token;
    assert.equal(
      (await request("boarding/portal", "GET", undefined, parentToken)).total,
      1,
    );
    assert.equal(
      (await request("library/portal", "GET", undefined, parentToken)).total,
      1,
    );

    await db.query(
      "INSERT INTO website_settings(tenant_id,school_id,site_name) SELECT tenant_id,id,name FROM schools WHERE id=$1",
      [school.id],
    );
    const page = await post("website/pages", {
      school_id: school.id,
      title: "Beranda",
      slug: "home",
      content: {
        seo: { title: "Operations", description: "" },
        blocks: [
          {
            type: "text",
            props: {
              heading: "Halo",
              body: "Website domain aktif",
              alignment: "left",
            },
          },
        ],
      },
    });
    await post(`website/pages/${page.id}/publish`, {
      version_id: page.version.id,
    });
    const domainPage = await request(
      "public/websites/domains/school.operations.example/pages/home",
    );
    assert.equal(domainPage.site_name, "SMP Operations");
    assert.equal(domainPage.tenant_slug, "operations");

    const audit = await request("security/audit-logs", "GET", undefined, admin);
    assert.ok(audit.total >= 15);
    assert.ok(audit.data.some((item: any) => item.entity_type === "library"));
    const history = await request(
      "security/login-history",
      "GET",
      undefined,
      admin,
    );
    assert.ok(
      history.data.some(
        (item: any) => item.email === "admin@operations.test" && item.success,
      ),
    );
    const sessions = await request(
      "security/sessions",
      "GET",
      undefined,
      admin,
    );
    assert.ok(sessions.total >= 1);
    await assert.rejects(
      () =>
        db.query("UPDATE audit_logs SET action='tampered' WHERE id=$1", [
          audit.data[0].id,
        ]),
      /Security logs are append only/,
    );
    await post(
      `security/sessions/${sessions.data.find((item: any) => item.status === "ACTIVE").id}/revoke`,
    );
    await request("auth/me", "GET", undefined, admin, 401);
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = original;
    delete process.env.NOTIFICATION_WORKER_ENABLED;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
