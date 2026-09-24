import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import { createTenant, initializeRoles } from "../../src/modules/auth/tenant-provisioning";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 5: dashboard aggregate returns tenant-scoped KPIs and quota statistics", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `ppdb_phase5_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(originalUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) => createTenant(sql, {
      name: "PPDB Five", slug: "ppdb-five", admin_name: "Admin", admin_email: "admin@five.test", admin_password: "Password!2026",
    }));
    const foreignTenant = await db.transaction(null, (sql) => createTenant(sql, {
      name: "Foreign", slug: "foreign-five", admin_name: "Foreign", admin_email: "admin@foreign-five.test", admin_password: "Password!2026",
    }));
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(path: string, method = "GET", body?: unknown, token?: string, expected = 200) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data;
    }
    const login = (slug: string, email: string) => request("auth/login", "POST", { tenant_slug: slug, email, password: "Password!2026" }, undefined, 201);
    const admin = (await login("ppdb-five", "admin@five.test")).access_token;
    const foreign = (await login("foreign-five", "admin@foreign-five.test")).access_token;
    const post = (path: string, body: unknown, token = admin, expected = 201) => request(path, "POST", body, token, expected);
    const school = await post("schools", { name: "SMP Five" });
    const year = await post("academic-years", { school_id: school.id, name: "2026/2027", start_date: "2026-07-01", end_date: "2027-06-30", is_active: true });
    const grade = await post("grade-levels", { school_id: school.id, name: "7", level: 7 });
    const classRoom = await post("classes", { academic_year_id: year.id, grade_level_id: grade.id, name: "7A" });
    const period = await post("admission-periods", { school_id: school.id, academic_year_id: year.id, name: "PPDB", starts_on: "2026-01-01", ends_on: "2026-12-31", capacity: 30 });
    const track = await post("admission-tracks", { period_id: period.id, name: "Regular", code: "REG", cost: 0, capacity: 25 });
    const track2 = await post("admission-tracks", { period_id: period.id, name: "Excellence", code: "EXC", cost: 0, capacity: 25 });
    const adminRow = (await db.query("SELECT id FROM users WHERE tenant_id=$1 AND email=$2", [tenant.id, "admin@five.test"])).rows[0];

    // Create applications with various statuses
    const statuses = [
      "SUBMITTED", "DOCUMENT_REVIEW", "TEST", "INTERVIEW", 
      "ACCEPTED", "REJECTED", "ENROLLED", "WITHDRAWN"
    ];
    const apps = [];
    for (let i = 0; i < statuses.length; i++) {
      const app = await post("admissions/applications", { 
        period_id: period.id, 
        track_id: i < 5 ? track.id : track2.id, 
        target_grade_level_id: grade.id, 
        name: `Child ${i}`, email: `child${i}@five.test`, phone: "0812", 
        address: "Bandung", birth_date: "2013-01-01", gender: "MALE", 
        guardian_name: "Parent", guardian_phone: "0813" 
      });
      apps.push(app);
      await db.query("UPDATE applications SET status=$1 WHERE tenant_id=$2 AND id=$3", [statuses[i], tenant.id, app.id]);
    }
    // Set one to WAITING_LIST via selection_status
    await db.query("UPDATE applications SET selection_status='WAITING_LIST', selection_rank=11 WHERE tenant_id=$1 AND id=$2", [tenant.id, apps[0].id]);

    // Add some documents with different verification statuses
    const doc1 = await post(`admissions/applications/${apps[0].id}/documents`, {
      document_type: "AKTA_LAHIR", file_name: "akta.pdf", mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\\nverified\\n%%EOF").toString("base64"),
    });
    await db.query("UPDATE application_documents SET verification_status='VERIFIED' WHERE tenant_id=$1 AND file_id=$2", [tenant.id, doc1.id]);

    const doc2 = await post(`admissions/applications/${apps[1].id}/documents`, {
      document_type: "AKTA_LAHIR", file_name: "akta2.pdf", mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\\npending\\n%%EOF").toString("base64"),
    });

    // Get dashboard data
    const dashboard = await request("admissions/reports/dashboard", "GET", undefined, admin);
    
    // Verify KPIs
    assert.equal(dashboard.total_applications, 8);
    assert.equal(dashboard.draft, 0);
    assert.equal(dashboard.submitted, 1); // 1 SUBMITTED
    assert.equal(dashboard.under_review, 3); // DOCUMENT_REVIEW, TEST, INTERVIEW
    assert.equal(dashboard.verified_documents, 1); // 1 VERIFIED document
    assert.equal(dashboard.rejected, 1); // 1 REJECTED
    assert.equal(dashboard.accepted, 1); // 1 ACCEPTED
    assert.equal(dashboard.waiting_list, 1); // 1 WAITING_LIST
    assert.equal(dashboard.registered, 1); // 1 ENROLLED

    // Verify quota statistics
    assert.equal(dashboard.quota.total_capacity, 30); // period capacity, counted once
    assert.equal(dashboard.quota.filled_capacity, 2); // ACCEPTED + ENROLLED
    assert.equal(dashboard.quota.remaining_capacity, 28); // 30 - 2

    // Verify series data
    assert(Array.isArray(dashboard.series.by_period));
    assert(Array.isArray(dashboard.series.by_track));
    assert(Array.isArray(dashboard.series.by_status));

    // Verify tenant isolation - foreign tenant should not see our data
    const foreignDashboard = await request("admissions/reports/dashboard", "GET", undefined, foreign);
    assert.equal(foreignDashboard.total_applications, 0);
  } finally {
    await app?.close();
    process.env.DATABASE_URL = originalUrl;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});

test("Phase 5: report export returns tenant-scoped filtered data with pagination", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `ppdb_phase5_export_${randomUUID().replaceAll("-", "")}`;
  await base.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(originalUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const db = new Database();
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await migrate(db);
    await db.transaction(null, initializeRoles);
    const tenant = await db.transaction(null, (sql) => createTenant(sql, {
      name: "PPDB Five Export", slug: "ppdb-five-export", admin_name: "Admin", admin_email: "admin@five-export.test", admin_password: "Password!2026",
    }));
    const foreignTenant = await db.transaction(null, (sql) => createTenant(sql, {
      name: "Foreign", slug: "foreign-five-export", admin_name: "Foreign", admin_email: "admin@foreign-five-export.test", admin_password: "Password!2026",
    }));
    app = await createApp(false);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    async function request(path: string, method = "GET", body?: unknown, token?: string, expected = 200) {
      const response = await fetch(`${origin}/api/v1/${path}`, {
        method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
      return data;
    }
    const login = (slug: string, email: string) => request("auth/login", "POST", { tenant_slug: slug, email, password: "Password!2026" }, undefined, 201);
    const admin = (await login("ppdb-five-export", "admin@five-export.test")).access_token;
    const foreign = (await login("foreign-five-export", "admin@foreign-five-export.test")).access_token;
    const post = (path: string, body: unknown, token = admin, expected = 201) => request(path, "POST", body, token, expected);
    const school = await post("schools", { name: "SMP Five Export" });
    const year = await post("academic-years", { school_id: school.id, name: "2026/2027", start_date: "2026-07-01", end_date: "2027-06-30", is_active: true });
    const grade = await post("grade-levels", { school_id: school.id, name: "7", level: 7 });
    const period = await post("admission-periods", { school_id: school.id, academic_year_id: year.id, name: "PPDB", starts_on: "2026-01-01", ends_on: "2026-12-31", capacity: 30 });
    const track = await post("admission-tracks", { period_id: period.id, name: "Regular", code: "REG", cost: 0, capacity: 25 });
    const adminRow = (await db.query("SELECT id FROM users WHERE tenant_id=$1 AND email=$2", [tenant.id, "admin@five-export.test"])).rows[0];

    // Create 25 applications
    for (let i = 0; i < 25; i++) {
      const app = await post("admissions/applications", { 
        period_id: period.id, track_id: track.id, target_grade_level_id: grade.id, 
        name: `Child ${i}`, email: `child${i}@five-export.test`, phone: "0812", 
        address: "Bandung", birth_date: "2013-01-01", gender: "MALE", 
        guardian_name: "Parent", guardian_phone: "0813" 
      });
      const status = i < 5 ? "SUBMITTED" : i < 10 ? "ACCEPTED" : "REJECTED";
      await db.query("UPDATE applications SET status=$1 WHERE tenant_id=$2 AND id=$3", [status, tenant.id, app.id]);
    }

    // Test APPLICANTS export
    const applicantsExport = await request("admissions/reports/export?type=APPLICANTS&limit=10&page=1", "GET", undefined, admin);
    assert.equal(applicantsExport.total, 25);
    assert.equal(applicantsExport.data.length, 10);
    assert(applicantsExport.data[0].registration_number);
    assert(applicantsExport.data[0].applicant_name);
    assert(applicantsExport.data[0].status);
    assert.equal("address" in applicantsExport.data[0], false);
    assert.equal("birth_date" in applicantsExport.data[0], false);
    assert.equal("guardian_name" in applicantsExport.data[0], false);
    assert.equal("access_token_hash" in applicantsExport.data[0], false);
    assert.deepEqual(
      Object.keys(applicantsExport.data[0]).sort(),
      ["applicant_email", "applicant_name", "applicant_phone", "period_name", "registration_number", "status", "submitted_at", "track_name"].sort(),
    );

    // Test pagination
    const page2 = await request("admissions/reports/export?type=APPLICANTS&limit=10&page=2", "GET", undefined, admin);
    assert.equal(page2.data.length, 10);
    assert.notEqual(page2.data[0].registration_number, applicantsExport.data[0].registration_number);

    // Test filter by status
    const acceptedExport = await request("admissions/reports/export?type=APPLICANTS&status=ACCEPTED", "GET", undefined, admin);
    assert.equal(acceptedExport.total, 5);
    assert(acceptedExport.data.every((d: any) => d.status === "ACCEPTED"));

    // Test filter by track
    const trackExport = await request(`admissions/reports/export?type=APPLICANTS&track_id=${track.id}`, "GET", undefined, admin);
    assert.equal(trackExport.total, 25);

    // Test filter by academic_year_id
    const yearExport = await request(`admissions/reports/export?type=APPLICANTS&academic_year_id=${year.id}`, "GET", undefined, admin);
    assert.equal(yearExport.total, 25);

    // Test filter by period_id
    const periodExport = await request(`admissions/reports/export?type=APPLICANTS&period_id=${period.id}`, "GET", undefined, admin);
    assert.equal(periodExport.total, 25);

    // Test date range filter
    const dateExport = await request("admissions/reports/export?type=APPLICANTS&date_from=2026-01-01&date_to=2026-12-31", "GET", undefined, admin);
    assert.equal(dateExport.total, 25);

    // Test tenant isolation
    const foreignExport = await request("admissions/reports/export?type=APPLICANTS", "GET", undefined, foreign);
    assert.equal(foreignExport.total, 0);

    // Test other report types
    const verificationExport = await request("admissions/reports/export?type=VERIFICATION", "GET", undefined, admin);
    assert(Array.isArray(verificationExport.data));

    const selectionExport = await request("admissions/reports/export?type=SELECTION", "GET", undefined, admin);
    assert(Array.isArray(selectionExport.data));

    const acceptedReportExport = await request("admissions/reports/export?type=ACCEPTED", "GET", undefined, admin);
    assert(Array.isArray(acceptedReportExport.data));

    const reregistrationExport = await request("admissions/reports/export?type=REREGISTRATION", "GET", undefined, admin);
    assert(Array.isArray(reregistrationExport.data));

    const paymentsExport = await request("admissions/reports/export?type=PAYMENTS", "GET", undefined, admin);
    assert(Array.isArray(paymentsExport.data));

    // Shared filters must work for every report query, including aliases without a period join.
    for (const type of ["VERIFICATION", "SELECTION", "ACCEPTED", "REREGISTRATION", "PAYMENTS"]) {
      const result = await request(`admissions/reports/export?type=${type}&academic_year_id=${year.id}&period_id=${period.id}&track_id=${track.id}`, "GET", undefined, admin);
      assert(Array.isArray(result.data));
    }

    // Reject malformed and out-of-range input rather than calculating invalid offsets.
    await request("admissions/reports/export?type=APPLICANTS&page=0", "GET", undefined, admin, 400);
    await request("admissions/reports/export?type=APPLICANTS&page=1x", "GET", undefined, admin, 400);
    await request("admissions/reports/export?type=APPLICANTS&limit=0", "GET", undefined, admin, 400);
    await request("admissions/reports/export?type=APPLICANTS&limit=101", "GET", undefined, admin, 400);
    await request("admissions/reports/export?type=APPLICANTS&date_from=2026-99-99", "GET", undefined, admin, 400);
    await request("admissions/reports/export?type=APPLICANTS&period_id=not-a-uuid", "GET", undefined, admin, 400);
    await request(`admissions/reports/export?type=APPLICANTS&period_id=${randomUUID()}`, "GET", undefined, admin, 404);
    await request(`admissions/reports/export?type=APPLICANTS&period_id=${period.id}&track_id=${randomUUID()}`, "GET", undefined, admin, 404);

    // Test invalid type
    await request("admissions/reports/export?type=INVALID", "GET", undefined, admin, 400);
  } finally {
    await app?.close();
    process.env.DATABASE_URL = originalUrl;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});