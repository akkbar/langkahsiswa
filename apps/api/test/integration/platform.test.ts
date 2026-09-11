import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Database } from "../../src/database";
import { migrate } from "../../scripts/migrate";
import { createTenant, initializeRoles } from "../../src/auth";
import { createApp } from "../../src/app";
test("Phase 0–9: PostgreSQL HTTP integration", async (t) => {
  const base = new Database();
  const schema = `langkahsiswa_test_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const previous = process.env.DATABASE_URL;
  const url = new URL(previous!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.ALLOW_TENANT_HEADER = "true";
  process.env.NODE_ENV = "test";
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenantA = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Sekolah A",
        slug: "school-a",
        admin_name: "Admin A",
        admin_email: "admin@a.test",
        admin_password: "Password!2026",
      }),
    );
    const tenantB = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Sekolah B",
        slug: "school-b",
        admin_name: "Admin B",
        admin_email: "admin@b.test",
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
      headers: Record<string, string> = {},
    ) {
      if (headers.Host) {
        const response = await new Promise<{ status: number; data: any }>(
          (resolve, reject) => {
            const req = httpRequest(
              `${origin}/api/v1/${path}`,
              {
                method,
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  ...headers,
                },
              },
              (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                  try {
                    resolve({
                      status: res.statusCode!,
                      data: JSON.parse(Buffer.concat(chunks).toString()),
                    });
                  } catch (e) {
                    reject(e);
                  }
                });
              },
            );
            req.on("error", reject);
            req.end(body === undefined ? undefined : JSON.stringify(body));
          },
        );
        assert.equal(response.status, expected, JSON.stringify(response.data));
        return response.data;
      }
      const res = await fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      assert.equal(
        res.status,
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
    const auth = await login("school-a", "admin@a.test");
    const token = auth.access_token;
    const other = await login("school-b", "admin@b.test");
    const post = (path: string, body: unknown, expected = 201) =>
      request(path, "POST", body, token, expected);
    let school: any,
      year: any,
      semester: any,
      level: any,
      teacher: any,
      cls: any,
      cls2: any,
      student: any,
      second: any,
      parent: any,
      subject: any,
      cs: any,
      category: any,
      assessment: any,
      report: any;
    let teacherAuth: any,
      parentAuth: any,
      principalAuth: any,
      outsiderAuth: any;
    await t.test(
      "health reports actual database and Redis connectivity",
      async () => {
        const res = await fetch(`${origin}/health`);
        const data = await res.json();
        assert.equal(data.database, "connected");
        assert.ok(["connected", "disconnected"].includes(data.redis));
        assert.equal(res.status, data.redis === "connected" ? 200 : 503);
      },
    );
    await t.test(
      "authentication rejects wrong password and rotates refresh tokens once",
      async () => {
        await request(
          "auth/login",
          "POST",
          { tenant_slug: "school-a", email: "admin@a.test", password: "wrong" },
          undefined,
          401,
        );
        await request("students", "GET", undefined, undefined, 401);
        const rotated = await request(
          "auth/refresh",
          "POST",
          { refresh_token: auth.refresh_token },
          undefined,
          201,
        );
        assert.ok(rotated.access_token);
        await request(
          "auth/refresh",
          "POST",
          { refresh_token: auth.refresh_token },
          undefined,
          401,
        );
        await request("auth/me", "GET", undefined, token, 403, {
          "X-Tenant-ID": tenantB.id,
        });
      },
    );
    await t.test(
      "remember login controls refresh cookie persistence",
      async () => {
        const loginWithRemember = (remember: boolean) =>
          fetch(`${origin}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenant_slug: "school-a",
              email: "admin@a.test",
              password: "Password!2026",
              remember,
            }),
          });
        const remembered = await loginWithRemember(true);
        assert.equal(remembered.status, 201);
        const rememberedCookies = remembered.headers.getSetCookie();
        assert.match(
          rememberedCookies.find((cookie) =>
            cookie.startsWith("langkahsiswa_refresh="),
          ) || "",
          /Max-Age=604800/,
        );
        assert.ok(
          rememberedCookies.some((cookie) =>
            cookie.startsWith("langkahsiswa_remember=1"),
          ),
        );
        const sessionOnly = await loginWithRemember(false);
        assert.equal(sessionOnly.status, 201);
        const sessionCookie = sessionOnly.headers
          .getSetCookie()
          .find((cookie) => cookie.startsWith("langkahsiswa_refresh="));
        assert.ok(sessionCookie);
        assert.doesNotMatch(sessionCookie, /Max-Age=/);
      },
    );
    await t.test("school admins cannot provision tenants", async () => {
      await post(
        "users",
        {
          name: "Attempted escalation",
          email: "escalation@a.test",
          password: "Password!2026",
          roles: ["SUPER_ADMIN"],
        },
        400,
      );
      await post(
        "tenants",
        {
          name: "X",
          slug: "x",
          admin_name: "X",
          admin_email: "x@x.test",
          admin_password: "Password!2026",
        },
        403,
      );
    });
    await t.test(
      "foundation legal profile keeps identity, tax, officials, licenses, and documents separate",
      async () => {
        await request(
          "foundation-profile",
          "PATCH",
          {
            code: "school-a",
            name: "Yayasan Sekolah A",
            short_name: "YSA",
            legal_name: "Yayasan Pendidikan Sekolah A",
            legal_status: "ACTIVE",
            legal_entity_number: "AHU-FOUNDATION-001",
            legal_entity_date: "2020-01-15",
            ahu_registration_number: "AHU.REG.001",
            deed_number: "12",
            deed_date: "2020-01-10",
            notary_name: "Notaris Integrasi",
            npwp: "010203040506000",
            nib: "NIB-001",
            npyp: "NPYP-001",
            address: "Jalan Yayasan 1",
            province_id: "31",
            city_id: "3171",
            district_id: "317101",
            village_id: "31710101",
            postal_code: "10110",
            phone: "0215550001",
            email: "office@school-a.test",
            website: "https://school-a.test",
            established_date: "2020-01-10",
            foundation_type: "EDUCATION",
          },
          token,
        );
        const document = await post("foundation-profile/documents", {
          document_type: "AKTA_PENDIRIAN",
          document_number: "12",
          document_date: "2020-01-10",
          file_url: "https://school-a.test/docs/akta.pdf",
          valid_from: "2020-01-10",
          valid_until: null,
          is_active: true,
          notes: "Dokumen awal",
        });
        const official = await post("foundation-profile/officials", {
          person_name: "Ketua Yayasan",
          organ_type: "PENGURUS",
          position: "Ketua",
          start_date: "2026-01-01",
          end_date: null,
          is_active: true,
          appointment_document_id: document.id,
        });
        const license = await post("foundation-profile/licenses", {
          license_type: "AHU_APPROVAL",
          license_number: "AHU-FOUNDATION-001",
          issued_by: "Kementerian Hukum",
          issue_date: "2020-01-15",
          valid_from: "2020-01-15",
          valid_until: null,
          document_id: document.id,
          status: "ACTIVE",
          notes: null,
        });
        await request(
          "foundation-profile/tax",
          "PATCH",
          {
            npwp: "010203040506000",
            tax_status: "REGISTERED",
            pkp_status: "NON_PKP",
            tax_office_name: "KPP Integrasi",
            tax_office_code: "001",
            bookkeeping_start_month: 1,
            fiscal_year_start: "2026-01-01",
            tax_email: "tax@school-a.test",
            tax_phone: "0215550002",
          },
          token,
        );
        await request(
          `foundation-profile/officials/${official.id}`,
          "PATCH",
          { position: "Ketua Umum" },
          token,
        );
        const profile = await request(
          "foundation-profile",
          "GET",
          undefined,
          token,
        );
        assert.equal(profile.legal_name, "Yayasan Pendidikan Sekolah A");
        assert.equal(profile.npyp, "NPYP-001");
        assert.equal(profile.school_count, 1);
        assert.equal(profile.tax_profile.tax_office_name, "KPP Integrasi");
        assert.equal(profile.documents[0].id, document.id);
        assert.equal(profile.officials[0].position, "Ketua Umum");
        assert.equal(profile.licenses[0].id, license.id);
        await request(
          `foundation-profile/licenses/${license.id}`,
          "DELETE",
          undefined,
          token,
        );
      },
    );
    await t.test(
      "one foundation account can create and switch between school sites",
      async () => {
        const initial = await request("sites", "GET", undefined, token);
        assert.equal(initial.total, 1);
        assert.equal(initial.data[0].current, true);
        const branch = await post("sites", {
          name: "Kampus Timur",
          slug: "school-a-east",
          school_name: "Sekolah A Kampus Timur",
          address: "Jalan Timur 1",
          phone: "0215550101",
          education_authority: "KEMENAG",
          school_level: "SMP",
          npsn: "70000001",
          nsm: "121200000001",
          emis_id: "EMIS-0001",
          education_form: "MTs",
          ownership_status: "PRIVATE",
          province_id: "31",
          city_id: "3172",
          district_id: "317201",
          village_id: "31720101",
          postal_code: "13110",
          establishment_decree_number: "SK-PENDIRIAN-001",
          establishment_decree_date: "2025-01-01",
          operational_license_number: "IZIN-OPS-001",
          operational_license_start: "2025-07-01",
          operational_license_end: "2030-06-30",
          accreditation: "A",
          accreditation_number: "AKR-001",
          accreditation_valid_until: "2030-12-31",
        });
        const available = await request("sites", "GET", undefined, token);
        assert.equal(available.total, 2);
        const branchSummary = available.data.find(
          (site: any) => site.id === branch.id,
        );
        assert.equal(branchSummary.current, false);
        assert.equal(branchSummary.education_authority, "KEMENAG");
        assert.equal(branchSummary.school_level, "SMP");
        assert.equal(branchSummary.npsn, "70000001");
        assert.equal(branchSummary.nsm, "121200000001");
        assert.equal(branchSummary.emis_id, "EMIS-0001");
        assert.equal(branchSummary.nss, null);
        assert.equal(branchSummary.ownership_status, "PRIVATE");
        assert.equal(branchSummary.operational_license_number, "IZIN-OPS-001");
        assert.equal(branchSummary.accreditation, "A");
        const kemenagDefaults = await db.query(
          `SELECT code,name,curriculum_template_id FROM subjects
           WHERE tenant_id=$1 AND school_id=$2 ORDER BY code`,
          [branch.id, branchSummary.school_id],
        );
        assert.equal(kemenagDefaults.rowCount, 15);
        assert.ok(
          kemenagDefaults.rows.every((row) => row.curriculum_template_id),
        );
        assert.ok(kemenagDefaults.rows.some((row) => row.code === "QH"));
        assert.ok(kemenagDefaults.rows.some((row) => row.code === "BAR"));
        await request(
          `sites/${branch.id}`,
          "PATCH",
          {
            education_authority: "KEMENDIKBUD",
            npsn: "70000002",
            nss: "202000000001",
            dapodik_id: "DAPODIK-0001",
            nsm: null,
            emis_id: null,
            operational_license_number: "IZIN-OPS-002",
            operational_license_start: "2026-07-01",
            operational_license_end: "2031-06-30",
            accreditation: "B",
            accreditation_number: "AKR-002",
            accreditation_valid_until: "2031-12-31",
          },
          token,
        );
        const updatedBranch = await request(
          `sites/${branch.id}`,
          "GET",
          undefined,
          token,
        );
        assert.equal(updatedBranch.education_authority, "KEMENDIKBUD");
        assert.equal(updatedBranch.nss, "202000000001");
        assert.equal(updatedBranch.dapodik_id, "DAPODIK-0001");
        assert.equal(updatedBranch.nsm, null);
        assert.equal(updatedBranch.emis_id, null);
        assert.equal(updatedBranch.operational_license_number, "IZIN-OPS-002");
        assert.equal(updatedBranch.accreditation, "B");
        const kemendikbudDefaults = await db.query(
          `SELECT code,name FROM subjects
           WHERE tenant_id=$1 AND school_id=$2 ORDER BY code`,
          [branch.id, branchSummary.school_id],
        );
        assert.equal(kemendikbudDefaults.rowCount, 11);
        assert.ok(kemendikbudDefaults.rows.some((row) => row.code === "PA"));
        assert.ok(!kemendikbudDefaults.rows.some((row) => row.code === "QH"));
        const licenseHistory = await db.query(
          `SELECT license_type,license_number,status FROM school_licenses
           WHERE tenant_id=$1 AND school_id=$2 ORDER BY created_at`,
          [branch.id, branchSummary.school_id],
        );
        assert.deepEqual(
          licenseHistory.rows
            .filter((row) => row.license_type === "OPERATIONAL")
            .map((row) => [row.license_number, row.status]),
          [
            ["IZIN-OPS-001", "REVOKED"],
            ["IZIN-OPS-002", "ACTIVE"],
          ],
        );
        const switched = await request(
          `sites/${branch.id}/switch`,
          "POST",
          {},
          token,
          201,
        );
        assert.equal(switched.user.tenant_id, branch.id);
        assert.equal(switched.user.account_id, auth.user.account_id);
        assert.equal(switched.user.organization_id, auth.user.organization_id);
        const branchStudents = await request(
          "students",
          "GET",
          undefined,
          switched.access_token,
        );
        assert.equal(branchStudents.total, 0);
        const branchSites = await request(
          "sites",
          "GET",
          undefined,
          switched.access_token,
        );
        assert.equal(branchSites.total, 2);
        assert.equal(
          branchSites.data.find((site: any) => site.id === branch.id).current,
          true,
        );
        const branchGrades = await request(
          "grade-levels?limit=20",
          "GET",
          undefined,
          switched.access_token,
        );
        assert.deepEqual(
          branchGrades.data.map((grade: any) => grade.level).sort(),
          [7, 8, 9],
        );
        await request(
          "grade-levels",
          "POST",
          {
            school_id: branchSummary.school_id,
            name: "Tingkat tambahan",
            level: 10,
          },
          switched.access_token,
          400,
        );
        await request(
          `grade-levels/${branchGrades.data[0].id}`,
          "PATCH",
          { name: "Tidak boleh diubah" },
          switched.access_token,
          400,
        );

        const early = await post("sites", {
          name: "PAUD Ceria",
          slug: "school-a-paud",
          school_level: "PAUD",
        });
        const earlyProfile = await request(
          `sites/${early.id}`,
          "GET",
          undefined,
          token,
        );
        const earlySession = await request(
          `sites/${early.id}/switch`,
          "POST",
          {},
          token,
          201,
        );
        const earlyGrades = await request(
          "grade-levels?limit=20",
          "GET",
          undefined,
          earlySession.access_token,
        );
        assert.equal(earlyGrades.total, 1);
        assert.equal(earlyGrades.data[0].name, "Kelompok A");
        await request(
          "grade-levels",
          "POST",
          {
            school_id: earlyProfile.school_id,
            name: "Kelompok B",
            level: 2,
          },
          earlySession.access_token,
          201,
        );
      },
    );
    await t.test(
      "school master CRUD and linked school/year validations",
      async () => {
        school = await post("schools", {
          name: "SMP Integrasi",
          principal_name: "Kepala Sekolah",
        });
        year = await post("academic-years", {
          school_id: school.id,
          name: "2026/2027",
          start_date: "2026-07-01",
          end_date: "2027-06-30",
          is_active: true,
        });
        semester = await post("semesters", {
          academic_year_id: year.id,
          name: "Semester 1",
          start_date: "2026-07-01",
          end_date: "2026-12-31",
        });
        await post(
          "semesters",
          {
            academic_year_id: year.id,
            name: "Invalid",
            start_date: "2026-01-01",
            end_date: "2026-08-01",
          },
          400,
        );
        await post(
          "semesters",
          {
            academic_year_id: year.id,
            name: "Overlap",
            start_date: "2026-08-01",
            end_date: "2026-11-30",
          },
          409,
        );
        level = await post("grade-levels", {
          school_id: school.id,
          name: "Kelas 7",
          level: 7,
        });
        teacher = await post("teachers", { name: "Guru Satu", nip: "G1" });
        cls = await post("classes", {
          academic_year_id: year.id,
          grade_level_id: level.id,
          name: "7A",
          homeroom_teacher_id: teacher.id,
        });
        cls2 = await post("classes", {
          academic_year_id: year.id,
          grade_level_id: level.id,
          name: "7B",
        });
        await post(
          "classes",
          {
            academic_year_id: year.id,
            grade_level_id: level.id,
            name: "7b",
          },
          409,
        );
        subject = await post("subjects", {
          school_id: school.id,
          name: "Matematika",
          code: "MTK",
        });
      },
    );
    await t.test(
      "people CRUD, many guardians, pagination, and cross-tenant isolation",
      async () => {
        student = await post("students", { name: "Siswa Pertama", nis: "001" });
        second = await post("students", { name: "Siswa Kedua", nis: "002" });
        parent = await post("parents", { name: "Orang Tua" });
        await post("student-guardians", {
          student_id: student.id,
          parent_id: parent.id,
          relationship: "FATHER",
          is_primary: true,
        });
        await post("student-guardians", {
          student_id: second.id,
          parent_id: parent.id,
          relationship: "FATHER",
        });
        await request(
          `students/${student.id}`,
          "PATCH",
          { name: "Ahmad Pratama" },
          token,
        );
        student.name = "Ahmad Pratama";
        const found = await request(
          "students?search=Ahmad&limit=1",
          "GET",
          undefined,
          token,
        );
        assert.equal(found.total, 1);
        assert.equal(found.data[0].name, "Ahmad Pratama");
        const disposableParent = await post("parents", { name: "Hapus Saya" });
        await request(
          `parents/${disposableParent.id}`,
          "DELETE",
          undefined,
          token,
        );
        await request(
          `parents/${disposableParent.id}`,
          "GET",
          undefined,
          token,
          404,
        );
        await request(
          `students/${student.id}`,
          "GET",
          undefined,
          other.access_token,
          404,
        );
        await request(
          `students/${student.id}`,
          "PATCH",
          { name: "Hacked" },
          other.access_token,
          404,
        );
        await request(
          "student-guardians",
          "POST",
          {
            student_id: student.id,
            parent_id: parent.id,
            relationship: "MOTHER",
          },
          other.access_token,
          400,
        );
        await post(
          "students",
          { name: "Injected", nis: "3", tenant_id: tenantB.id },
          400,
        );
        await assert.rejects(
          db.query(
            "INSERT INTO student_guardians(tenant_id,student_id,parent_id,relationship) VALUES($1,$2,$3,$4)",
            [tenantB.id, student.id, parent.id, "GUARDIAN"],
          ),
          { code: "23503" },
        );
      },
    );
    await t.test("enrollment uniqueness and teacher assignment", async () => {
      await post("class-students", {
        student_id: student.id,
        class_id: cls.id,
      });
      await post("class-students", { student_id: second.id, class_id: cls.id });
      await post(
        "class-students",
        { student_id: student.id, class_id: cls2.id },
        409,
      );
      await post("teacher-subjects", {
        teacher_id: teacher.id,
        subject_id: subject.id,
      });
      cs = await post("class-subjects", {
        class_id: cls.id,
        subject_id: subject.id,
        teacher_id: teacher.id,
        semester_id: semester.id,
      });
    });
    await t.test(
      "timetables reject teacher/class overlaps including concurrent requests",
      async () => {
        const schedule = {
          class_subject_id: cs.id,
          day_of_week: 1,
          start_time: "07:00",
          end_time: "08:30",
        };
        await post("timetables", schedule);
        await post(
          "timetables",
          { ...schedule, start_time: "08:00", end_time: "09:00" },
          409,
        );
        await post("timetables", {
          ...schedule,
          start_time: "08:30",
          end_time: "09:00",
        });
        const cs2 = await post("class-subjects", {
          class_id: cls2.id,
          subject_id: subject.id,
          teacher_id: teacher.id,
          semester_id: semester.id,
        });
        await post(
          "timetables",
          { ...schedule, class_subject_id: cs2.id },
          409,
        );
        const results = await Promise.all(
          [1, 2].map(() =>
            fetch(`${origin}/api/v1/timetables`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ ...schedule, day_of_week: 2 }),
            }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      },
    );
    await t.test(
      "users receive roles and teachers are scoped to their assignments",
      async () => {
        const u = await post("users", {
          name: "Guru",
          email: "teacher@a.test",
          password: "Password!2026",
          roles: ["TEACHER"],
        });
        await request(
          `teachers/${teacher.id}`,
          "PATCH",
          { user_id: u.id },
          token,
        );
        teacherAuth = await login("school-a", "teacher@a.test");
        assert.equal(teacherAuth.user.account_level, "OPERATIONAL");
        assert.equal(teacherAuth.user.account_type, "SCHOOL_ADMIN");
        const legacyTypedLogin = await request(
          "auth/login",
          "POST",
          {
            organization_code: "school-a",
            account_type: "FAMILY",
            email: "teacher@a.test",
            password: "Password!2026",
          },
          undefined,
          201,
        );
        assert.deepEqual(legacyTypedLogin.user.roles, ["TEACHER"]);
        await request(
          "students",
          "POST",
          { name: "Denied", nis: "004" },
          teacherAuth.access_token,
          403,
        );
        const p = await post("users", {
          name: "Wali",
          email: "parent@a.test",
          password: "Password!2026",
          roles: ["PARENT"],
        });
        await request(
          `parents/${parent.id}`,
          "PATCH",
          { user_id: p.id },
          token,
        );
        parentAuth = await login("school-a", "parent@a.test");
        assert.equal(parentAuth.user.account_level, "FAMILY");
        assert.equal(parentAuth.user.account_type, "FAMILY");
        const mixed = await post("users", {
          name: "Peran Campuran",
          email: "mixed@a.test",
          password: "Password!2026",
          roles: ["STAFF", "PARENT"],
        });
        const mixedAuth = await login("school-a", "mixed@a.test");
        assert.ok(mixed.id);
        assert.deepEqual(mixedAuth.user.roles.sort(), ["PARENT", "STAFF"]);
        for (const permission of [
          "people.create",
          "people.read",
          "people.update",
          "people.delete",
        ])
          assert.ok(mixedAuth.user.permissions.includes(permission));
        await request(
          `users/${mixed.id}/roles`,
          "PATCH",
          { add: ["TEACHER"] },
          token,
        );
        const expandedMixedAuth = await login("school-a", "mixed@a.test");
        assert.deepEqual(expandedMixedAuth.user.roles.sort(), [
          "PARENT",
          "STAFF",
          "TEACHER",
        ]);
        const canteen = await post("users", {
          name: "Admin Kantin",
          email: "kantin@a.test",
          password: "Password!2026",
          account_type: "SCHOOL_TENANT",
          roles: ["CANTEEN_ADMIN"],
        });
        assert.ok(canteen.id);
        const canteenAuth = await request(
          "auth/login",
          "POST",
          {
            organization_code: "school-a",
            account_type: "SCHOOL_TENANT",
            email: "kantin@a.test",
            password: "Password!2026",
          },
          undefined,
          201,
        );
        assert.equal(canteenAuth.user.account_level, "TENANT");
        assert.equal(canteenAuth.user.account_type, "SCHOOL_TENANT");
        assert.deepEqual(canteenAuth.user.roles, ["CANTEEN_ADMIN"]);
        await post("users", {
          name: "Kepala",
          email: "principal@a.test",
          password: "Password!2026",
          roles: ["PRINCIPAL"],
        });
        principalAuth = await login("school-a", "principal@a.test");
        await post("users", {
          name: "Guru Lain",
          email: "outside@a.test",
          password: "Password!2026",
          roles: ["TEACHER"],
        });
        outsiderAuth = await login("school-a", "outside@a.test");
      },
    );
    await t.test(
      "attendance persists upserts and rejects outsiders, duplicates and invalid dates",
      async () => {
        const input = {
          class_id: cls.id,
          semester_id: semester.id,
          date: "2026-09-07",
          records: [{ student_id: student.id, status: "PRESENT" }],
        };
        await request("attendance", "PUT", input, teacherAuth.access_token);
        const updated = await request(
          "attendance",
          "PUT",
          {
            ...input,
            records: [
              {
                student_id: student.id,
                status: "LATE",
                notes: "Terlambat 10 menit",
              },
            ],
          },
          teacherAuth.access_token,
        );
        assert.equal(updated.records.length, 1);
        assert.equal(updated.records[0].status, "LATE");
        await request(
          "attendance",
          "PUT",
          input,
          outsiderAuth.access_token,
          403,
        );
        await request(
          "attendance",
          "PUT",
          { ...input, date: "2027-01-01" },
          token,
          400,
        );
        await request(
          "attendance",
          "PUT",
          { ...input, records: [...input.records, ...input.records] },
          token,
          400,
        );
        await request(
          "attendance",
          "PUT",
          {
            ...input,
            records: [{ student_id: randomUUID(), status: "PRESENT" }],
          },
          token,
          400,
        );
      },
    );
    await t.test(
      "gradebook validates weights, scores, membership and teacher ownership",
      async () => {
        category = await request(
          "assessment-categories",
          "POST",
          { class_subject_id: cs.id, name: "Ujian", weight: 100 },
          teacherAuth.access_token,
          201,
        );
        await post(
          "assessment-categories",
          { class_subject_id: cs.id, name: "Extra", weight: 10 },
          400,
        );
        assessment = await request(
          "assessments",
          "POST",
          {
            category_id: category.id,
            name: "UAS",
            max_score: 50,
            due_date: "2026-12-10",
          },
          teacherAuth.access_token,
          201,
        );
        await post(
          "report-cards/calculate",
          {
            student_id: student.id,
            class_id: cls.id,
            semester_id: semester.id,
          },
          400,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: student.id, score: 51 }],
          },
          token,
          400,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: student.id, score: 40 }],
          },
          outsiderAuth.access_token,
          403,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: randomUUID(), score: 40 }],
          },
          token,
          400,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [
              { student_id: student.id, score: 40 },
              { student_id: second.id, score: 45 },
            ],
          },
          teacherAuth.access_token,
        );
      },
    );
    await t.test(
      "calculate stores weighted grades and attendance; score edits invalidate drafts",
      async () => {
        report = await post("report-cards/calculate", {
          student_id: student.id,
          class_id: cls.id,
          semester_id: semester.id,
        });
        assert.equal(report.items[0].final_grade, 80);
        assert.equal(report.snapshot.attendance.LATE, 1);
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: student.id, score: 42 }],
          },
          teacherAuth.access_token,
        );
        await request(
          `report-cards/${report.id}`,
          "GET",
          undefined,
          token,
          404,
        );
        report = await post("report-cards/calculate", {
          student_id: student.id,
          class_id: cls.id,
          semester_id: semester.id,
        });
        assert.equal(report.items[0].final_grade, 84);
      },
    );
    await t.test(
      "report state machine requires review and optional principal approval",
      async () => {
        await post(`report-cards/${report.id}/publish`, {}, 409);
        await request(
          `report-cards/${report.id}/review`,
          "POST",
          {},
          outsiderAuth.access_token,
          403,
        );
        await request(
          `report-cards/${report.id}/review`,
          "POST",
          { notes: "Terus pertahankan semangat belajar." },
          teacherAuth.access_token,
          201,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: student.id, score: 43 }],
          },
          token,
          409,
        );
        await request(
          `tenants/${tenantA.id}/settings`,
          "PATCH",
          { principal_approval_required: true },
          token,
        );
        await post(`report-cards/${report.id}/publish`, {}, 409);
        await request(
          `report-cards/${report.id}/approve`,
          "POST",
          {},
          principalAuth.access_token,
          201,
        );
        await request(
          `report-cards/${report.id}`,
          "GET",
          undefined,
          parentAuth.access_token,
          404,
        );
        await post(`report-cards/${report.id}/publish`, {});
        await post(`report-cards/${report.id}/reopen`, {}, 409);
        await post(
          "report-cards/calculate",
          {
            student_id: student.id,
            class_id: cls.id,
            semester_id: semester.id,
          },
          409,
        );
      },
    );
    await t.test(
      "parents only see their published reports; PDF endpoint returns a real document",
      async () => {
        const visible = await request(
          "report-cards",
          "GET",
          undefined,
          parentAuth.access_token,
        );
        assert.equal(visible.data.length, 1);
        await request(
          `report-cards/${report.id}`,
          "GET",
          undefined,
          other.access_token,
          404,
        );
        const res = await fetch(
          `${origin}/api/v1/report-cards/${report.id}/pdf`,
          { headers: { Authorization: `Bearer ${parentAuth.access_token}` } },
        );
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type")!, /application\/pdf/);
        const bytes = Buffer.from(await res.arrayBuffer());
        assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
        assert.ok(bytes.length > 1500);
        await mkdir(resolve("tmp/pdfs"), { recursive: true });
        await writeFile(resolve("tmp/pdfs/report-card-integration.pdf"), bytes);
      },
    );
    await t.test(
      "verified domains resolve tenants and production rejects tenant headers",
      async () => {
        await db.query(
          "INSERT INTO tenant_domains(tenant_id,domain,verified_at) VALUES($1,$2,now()),($3,$4,now())",
          [tenantA.id, "school-a.localhost", tenantB.id, "school-b.localhost"],
        );
        await request("auth/me", "GET", undefined, token, 403, {
          Host: "school-b.localhost",
        });
        const domainLogin = await request(
          "auth/login",
          "POST",
          { email: "admin@a.test", password: "Password!2026" },
          undefined,
          201,
          { Host: "school-a.localhost" },
        );
        assert.equal(domainLogin.user.tenant_id, tenantA.id);
        process.env.NODE_ENV = "production";
        try {
          await request("auth/me", "GET", undefined, token, 403, {
            "X-Tenant-ID": tenantA.id,
          });
        } finally {
          process.env.NODE_ENV = "test";
        }
      },
    );
    await t.test(
      "same-tenant unlinked parents cannot access published reports",
      async () => {
        await post("users", {
          name: "Wali lain",
          email: "unlinked@a.test",
          password: "Password!2026",
          roles: ["PARENT"],
        });
        const unlinked = await login("school-a", "unlinked@a.test");
        const result = await request(
          "report-cards",
          "GET",
          undefined,
          unlinked.access_token,
        );
        assert.equal(result.data.length, 0);
        await request(
          `report-cards/${report.id}`,
          "GET",
          undefined,
          unlinked.access_token,
          404,
        );
        await request("students", "GET", undefined, unlinked.access_token, 403);
      },
    );
    await t.test(
      "active status and current role grants are checked for existing access tokens",
      async () => {
        await db.query(
          "UPDATE users SET active=false WHERE tenant_id=$1 AND id=$2",
          [tenantA.id, outsiderAuth.user.id],
        );
        await request(
          "auth/me",
          "GET",
          undefined,
          outsiderAuth.access_token,
          401,
        );
        await db.query("UPDATE tenants SET status='SUSPENDED' WHERE id=$1", [
          tenantB.id,
        ]);
        await request("auth/me", "GET", undefined, other.access_token, 401);
        await db.query("UPDATE tenants SET status='ACTIVE' WHERE id=$1", [
          tenantB.id,
        ]);
      },
    );
    await t.test(
      "super admin can provision a separate tenant with its own admin login",
      async () => {
        await db.query(
          "INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES($1,$2,'SUPER_ADMIN')",
          [tenantA.id, auth.user.id],
        );
        await db.query(
          `INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id)
           VALUES($1,$2,NULL,'SUPER_ADMIN') ON CONFLICT DO NOTHING`,
          [auth.user.account_id, auth.user.organization_id],
        );
        const tenant = await post("tenants", {
          name: "Sekolah Baru",
          slug: "school-new",
          admin_name: "Admin Baru",
          admin_email: "admin@new.test",
          admin_password: "Password!2026",
        });
        const newAdmin = await login("school-new", "admin@new.test");
        assert.equal(newAdmin.user.tenant_id, tenant.id);
        const students = await request(
          "students",
          "GET",
          undefined,
          newAdmin.access_token,
        );
        assert.equal(students.total, 0);
      },
    );
    await t.test("untrusted browser origins rejected on mutation", async () => {
      await request("auth/refresh", "POST", {}, undefined, 403, {
        Origin: "https://attacker.invalid",
      });
    });
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = previous;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
