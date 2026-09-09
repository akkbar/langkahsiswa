import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database";
import { createTenant, initializeRoles } from "../../src/auth";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";
import {
  NotificationDispatcher,
  notifyStudent,
  PushError,
} from "../../src/notifications";

test("Phase 14–16: event audiences, mobile ownership and persistent push delivery", async (t) => {
  const original = {
    DATABASE_URL: process.env.DATABASE_URL,
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    NOTIFICATION_WORKER_ENABLED: process.env.NOTIFICATION_WORKER_ENABLED,
  };
  process.env.NOTIFICATION_WORKER_ENABLED = "false";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const base = new Database();
  const schema = `notification_test_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(original.DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  const schoolDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const schoolYear = Number(schoolDate.slice(0, 4));
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Portal",
        slug: "portal",
        admin_name: "Admin",
        admin_email: "admin@portal.test",
        admin_password: "Password!2026",
      }),
    );
    await db.transaction(null, (sql) =>
      createTenant(sql, {
        name: "Foreign",
        slug: "foreign",
        admin_name: "Admin",
        admin_email: "admin@foreign.test",
        admin_password: "Password!2026",
      }),
    );
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const request = async (
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
      expected = 200,
    ) => {
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
    };
    const login = async (email: string, tenant_slug = "portal") =>
      request(
        "auth/login",
        "POST",
        { tenant_slug, email, password: "Password!2026" },
        undefined,
        201,
      );
    const admin = (await login("admin@portal.test")).access_token;
    const foreign = (await login("admin@foreign.test", "foreign")).access_token;
    const post = (path: string, body: unknown, token = admin, expected = 201) =>
      request(path, "POST", body, token, expected);
    const get = (path: string, token = admin, expected = 200) =>
      request(path, "GET", undefined, token, expected);
    async function role(role: string, email: string) {
      const user = await post("users", {
        name: role,
        email,
        password: "Password!2026",
        roles: [role],
      });
      return { id: user.id, token: (await login(email)).access_token };
    }
    const parent = await role("PARENT", "parent@portal.test");
    const outsider = await role("PARENT", "outsider@portal.test");
    const studentUser = await role("STUDENT", "student@portal.test");
    const teacherUser = await role("TEACHER", "teacher@portal.test");
    const principal = await role("PRINCIPAL", "principal@portal.test");
    const student = await post("students", {
      name: "Siswa Portal",
      nis: "P001",
      user_id: studentUser.id,
    });
    const second = await post("students", { name: "Siswa Lain", nis: "P002" });
    const guardian = await post("parents", {
      name: "Wali",
      user_id: parent.id,
    });
    await post("student-guardians", {
      student_id: student.id,
      parent_id: guardian.id,
      relationship: "GUARDIAN",
    });
    const school = await post("schools", { name: "Sekolah Portal" });
    const year = await post("academic-years", {
      school_id: school.id,
      name: "2026/2027",
      start_date: `${schoolYear}-01-01`,
      end_date: `${schoolYear + 1}-12-31`,
      is_active: true,
    });
    const semester = await post("semesters", {
      academic_year_id: year.id,
      name: "Semester 1",
      start_date: `${schoolYear}-01-01`,
      end_date: `${schoolYear}-12-31`,
    });
    const level = await post("grade-levels", {
      school_id: school.id,
      name: "7",
      level: 7,
    });
    const teacher = await post("teachers", {
      name: "Guru Portal",
      nip: "G1",
      user_id: teacherUser.id,
    });
    const cls = await post("classes", {
      name: "7A",
      academic_year_id: year.id,
      grade_level_id: level.id,
      homeroom_teacher_id: teacher.id,
    });
    await post("class-students", { class_id: cls.id, student_id: student.id });
    const subject = await post("subjects", {
      school_id: school.id,
      name: "Matematika",
      code: "MTK",
    });
    await post("teacher-subjects", {
      teacher_id: teacher.id,
      subject_id: subject.id,
    });
    const cs = await post("class-subjects", {
      class_id: cls.id,
      subject_id: subject.id,
      teacher_id: teacher.id,
      semester_id: semester.id,
    });
    await post("timetables", {
      class_subject_id: cs.id,
      day_of_week: 1,
      start_time: "07:00",
      end_time: "08:00",
    });
    const futureSemester = await post("semesters", {
      academic_year_id: year.id,
      name: "Semester 2",
      start_date: `${schoolYear + 1}-01-01`,
      end_date: `${schoolYear + 1}-12-31`,
    });
    const futureSubject = await post("class-subjects", {
      class_id: cls.id,
      subject_id: subject.id,
      teacher_id: teacher.id,
      semester_id: futureSemester.id,
    });
    await post("timetables", {
      class_subject_id: futureSubject.id,
      day_of_week: 2,
      start_time: "09:00",
      end_time: "10:00",
    });
    const category = await post("assessment-categories", {
      class_subject_id: cs.id,
      name: "Ujian",
      weight: 100,
    });
    const assessment = await post("assessments", {
      category_id: category.id,
      name: "Ujian 1",
      max_score: 100,
      due_date: schoolDate,
    });
    const deviceToken = "test-device-token-parent-00001";
    const device = await post(
      "device-tokens",
      { token: deviceToken, platform: "ANDROID" },
      parent.token,
    );
    let event: any;

    await t.test(
      "student event targets, deduplication, inbox ownership and cross-tenant rejection",
      async () => {
        const payload = {
          title: "Rapat wali",
          type: "PARENT_MEETING",
          starts_at: "2026-09-20T09:00:00+07:00",
          targets: [{ type: "STUDENT", target_id: student.id }],
        };
        await post("events", payload, parent.token, 403);
        await post("events", payload, foreign, 404);
        event = await post("events", payload, principal.token);
        assert.equal((await get("events", parent.token)).total, 0);
        await Promise.all([
          post(`events/${event.id}/publish`, {}),
          post(`events/${event.id}/publish`, {}),
        ]);
        assert.equal((await get("events", parent.token)).total, 1);
        assert.equal((await get("events", outsider.token)).total, 0);
        assert.equal((await get("events", foreign)).total, 0);
        const inbox = await get("notifications", parent.token);
        assert.equal(inbox.total, 1);
        assert.equal((await get("notifications", studentUser.token)).total, 1);
        await request(
          `notifications/${inbox.data[0].id}/read`,
          "PATCH",
          {},
          outsider.token,
          404,
        );
        await request(
          `notifications/${inbox.data[0].id}/read`,
          "PATCH",
          {},
          parent.token,
        );
        assert.equal((await get("notifications", parent.token)).unread, 0);
        await get("notifications/deliveries", parent.token, 403);
        assert.equal((await get("notifications/deliveries")).total, 1);
      },
    );
    await t.test(
      "academic mutations create notifications and mobile feeds enforce assignments",
      async () => {
        await request(
          "attendance",
          "PUT",
          {
            class_id: cls.id,
            semester_id: semester.id,
            date: schoolDate,
            records: [{ student_id: student.id, status: "ABSENT" }],
          },
          teacherUser.token,
        );
        await request(
          "grades",
          "PUT",
          {
            assessment_id: assessment.id,
            scores: [{ student_id: student.id, score: 90 }],
          },
          teacherUser.token,
        );
        const overview = await get(
          `portal/overview?student_id=${student.id}`,
          parent.token,
        );
        assert.equal(overview.attendance[0].status, "ABSENT");
        assert.equal(overview.schedule[0].subject_name, "Matematika");
        assert.equal(overview.schedule.length, 1);
        assert.equal(overview.schedule[0].semester_name, "Semester 1");
        assert.equal(overview.grades[0].score, 90);
        assert.equal((await get("portal/students", parent.token)).total, 1);
        assert.equal((await get("portal/students", outsider.token)).total, 0);
        assert.equal(
          (await get("portal/students", teacherUser.token)).total,
          1,
        );
        assert.equal(
          (await get("portal/teaching", teacherUser.token)).data[0].students[0]
            .id,
          student.id,
        );
        await get(`portal/overview?student_id=${second.id}`, parent.token, 403);
        await get(
          `portal/overview?student_id=${second.id}`,
          teacherUser.token,
          403,
        );
        await get(`portal/overview?student_id=${student.id}`, foreign, 403);
        await get("portal/teaching", parent.token, 403);
        assert.equal((await get("notifications", parent.token)).total, 3);
        const report = await post("report-cards/calculate", {
          class_id: cls.id,
          semester_id: semester.id,
          student_id: student.id,
        });
        await post(`report-cards/${report.id}/review`, {});
        await post(`report-cards/${report.id}/publish`, {});
        assert.equal(
          (
            await get(
              `portal/overview?student_id=${student.id}`,
              studentUser.token,
            )
          ).reports[0].id,
          report.id,
        );
        assert.equal((await get("notifications", parent.token)).total, 4);
      },
    );
    await t.test(
      "missing Firebase leaves deliveries pending and does not invent success",
      async () => {
        const result = await post("notifications/dispatch", {});
        assert.equal(result.push_configured, false);
        assert.equal(result.processed, 0);
        const rows = (await get("notifications/deliveries")).data;
        assert.equal(rows.length, 4);
        assert.ok(
          rows.every((d: any) => d.status === "PENDING" && d.attempts === 0),
        );
      },
    );
    await t.test(
      "outbox persists retry, success, invalid-token failure and explicit retry",
      async () => {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
          project_id: "fake-project",
          client_email: "fake@fake-project.iam.gserviceaccount.com",
          private_key: "x".repeat(150),
        });
        const dispatcher = app!.get(NotificationDispatcher);
        let fail: false | "transient" | "invalid" = "transient";
        let sends = 0;
        (dispatcher as any).sender = {
          send: async () => {
            sends++;
            if (fail === "transient") throw new Error("offline");
            if (fail === "invalid")
              throw new PushError("UNREGISTERED", true, true);
            return "projects/fake-project/messages/test";
          },
        };
        await db.query("UPDATE tenants SET status='SUSPENDED' WHERE id=$1", [
          tenant.id,
        ]);
        assert.equal((await dispatcher.dispatch()).processed, 0);
        assert.equal(sends, 0);
        assert.ok(
          (
            await db.query(
              "SELECT status,attempts FROM notification_deliveries WHERE tenant_id=$1",
              [tenant.id],
            )
          ).rows.every((row) => row.status === "PENDING" && row.attempts === 0),
        );
        await db.query("UPDATE tenants SET status='ACTIVE' WHERE id=$1", [
          tenant.id,
        ]);
        await post("notifications/dispatch", {});
        let deliveries = (await get("notifications/deliveries")).data;
        assert.ok(
          deliveries.every(
            (d: any) =>
              d.status === "PENDING" && d.attempts === 1 && d.last_error,
          ),
        );
        fail = false;
        await db.query(
          "UPDATE notification_deliveries SET next_attempt_at=now() WHERE tenant_id=$1",
          [tenant.id],
        );
        await post("notifications/dispatch", {});
        deliveries = (await get("notifications/deliveries")).data;
        assert.ok(
          deliveries.every((d: any) => d.status === "SENT" && d.attempts === 2),
        );
        const calls = sends;
        await post("notifications/dispatch", {});
        assert.equal(sends, calls);
        await db.transaction(tenant.id, (sql) =>
          notifyStudent(
            sql,
            tenant.id,
            student.id,
            "Token expired",
            "Test",
            {},
            "invalid-test",
          ),
        );
        fail = "invalid";
        await post("notifications/dispatch", {});
        const failed = (await get("notifications/deliveries")).data.find(
          (d: any) => d.status === "FAILED",
        );
        assert.ok(failed);
        assert.equal(
          (
            await db.query("SELECT active FROM device_tokens WHERE id=$1", [
              device.id,
            ])
          ).rows[0].active,
          false,
        );
        await post(
          `notifications/deliveries/${failed.id}/retry`,
          {},
          foreign,
          404,
        );
        await post(`notifications/deliveries/${failed.id}/retry`, {});
      },
    );
    await t.test(
      "same physical device moves to new user and cannot retain old-account pushes",
      async () => {
        await post(
          "device-tokens",
          { token: deviceToken, platform: "ANDROID" },
          parent.token,
        );
        const moved = await post(
          "device-tokens",
          { token: deviceToken, platform: "ANDROID" },
          outsider.token,
        );
        assert.equal(
          (
            await db.query("SELECT active FROM device_tokens WHERE id=$1", [
              device.id,
            ])
          ).rows[0].active,
          false,
        );
        await request(
          `device-tokens/${moved.id}`,
          "DELETE",
          undefined,
          parent.token,
          404,
        );
        await request(
          `device-tokens/${moved.id}`,
          "DELETE",
          undefined,
          outsider.token,
        );
      },
    );
  } finally {
    await app?.close();
    await db.onModuleDestroy();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
