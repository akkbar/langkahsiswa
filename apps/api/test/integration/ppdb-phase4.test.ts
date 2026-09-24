import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/database/database.service";
import { createTenant, initializeRoles } from "../../src/modules/auth/tenant-provisioning";
import { migrate } from "../../scripts/migrate";
import { createApp } from "../../src/app";

test("Phase 4: payment records are tenant-safe and re-registration is idempotent", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const base = new Database();
  const schema = `ppdb_phase4_${randomUUID().replaceAll("-", "")}`;
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
      name: "PPDB Four", slug: "ppdb-four", admin_name: "Admin", admin_email: "admin@four.test", admin_password: "Password!2026",
    }));
    const foreignTenant = await db.transaction(null, (sql) => createTenant(sql, {
      name: "Foreign", slug: "foreign-four", admin_name: "Foreign", admin_email: "admin@foreign-four.test", admin_password: "Password!2026",
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
    const admin = (await login("ppdb-four", "admin@four.test")).access_token;
    const foreign = (await login("foreign-four", "admin@foreign-four.test")).access_token;
    const post = (path: string, body: unknown, token = admin, expected = 201) => request(path, "POST", body, token, expected);
    const school = await post("schools", { name: "SMP Four" });
    const year = await post("academic-years", { school_id: school.id, name: "2026/2027", start_date: "2026-07-01", end_date: "2027-06-30", is_active: true });
    const grade = await post("grade-levels", { school_id: school.id, name: "7", level: 7 });
    const classRoom = await post("classes", { academic_year_id: year.id, grade_level_id: grade.id, name: "7A" });
    const period = await post("admission-periods", { school_id: school.id, academic_year_id: year.id, name: "PPDB", starts_on: "2026-01-01", ends_on: "2026-12-31", capacity: 10 });
    const track = await post("admission-tracks", { period_id: period.id, name: "Regular", code: "REG", cost: 0, capacity: 10 });
    const otherTrack = await post("admission-tracks", { period_id: period.id, name: "Other", code: "OTHER", cost: 0, capacity: 10 });
    const application = await post("admissions/applications", { period_id: period.id, track_id: track.id, target_grade_level_id: grade.id, name: "Accepted Child", email: "child@four.test", phone: "0812", address: "Bandung", birth_date: "2013-01-01", gender: "MALE", guardian_name: "Parent", guardian_phone: "0813" });
    const document = await post(`admissions/applications/${application.id}/documents`, {
      document_type: "AKTA_LAHIR", file_name: "akta.pdf", mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\\nphase four\\n%%EOF").toString("base64"),
    });
    await db.query("UPDATE application_documents SET verification_status='VERIFIED' WHERE tenant_id=$1 AND file_id=$2", [tenant.id, document.id]);
    await db.query("UPDATE applications SET status='ACCEPTED' WHERE tenant_id=$1 AND id=$2", [tenant.id, application.id]);
    const adminRow = (await db.query("SELECT id FROM users WHERE tenant_id=$1 AND email=$2", [tenant.id, "admin@four.test"])).rows[0];
    const scheme = (await db.query("INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,installment_count,created_by) VALUES($1,$2,'Entry','ENTRY',100,true,2,$3) RETURNING *", [tenant.id, track.id, adminRow.id])).rows[0];
    const inactiveScheme = (await db.query("INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,is_active,created_by) VALUES($1,$2,'Inactive','INACTIVE',100,true,false,$3) RETURNING *", [tenant.id, track.id, adminRow.id])).rows[0];
    const mismatchedScheme = (await db.query("INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,created_by) VALUES($1,$2,'Other','OTHER',100,true,$3) RETURNING *", [tenant.id, otherTrack.id, adminRow.id])).rows[0];
    const secondScheme = (await db.query("INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,created_by) VALUES($1,$2,'Second','SECOND',100,false,$3) RETURNING *", [tenant.id, track.id, adminRow.id])).rows[0];
    const foreignAdmin = (await db.query("SELECT id FROM users WHERE tenant_id=$1 AND email=$2", [foreignTenant.id, "admin@foreign-four.test"])).rows[0];
    const foreignSchool = (await db.query("INSERT INTO schools(tenant_id,name) VALUES($1,'Foreign School') RETURNING id", [foreignTenant.id])).rows[0];
    const foreignYear = (await db.query("INSERT INTO academic_years(tenant_id,school_id,name,start_date,end_date) VALUES($1,$2,'2026','2026-01-01','2026-12-31') RETURNING id", [foreignTenant.id, foreignSchool.id])).rows[0];
    const foreignPeriod = (await db.query("INSERT INTO admission_periods(tenant_id,school_id,academic_year_id,name,starts_on,ends_on,capacity,created_by) VALUES($1,$2,$3,'Foreign','2026-01-01','2026-12-31',1,$4) RETURNING id", [foreignTenant.id, foreignSchool.id, foreignYear.id, foreignAdmin.id])).rows[0];
    const foreignTrack = (await db.query("INSERT INTO admission_tracks(tenant_id,period_id,name,code,cost,created_by) VALUES($1,$2,'Foreign','FOREIGN',0,$3) RETURNING id", [foreignTenant.id, foreignPeriod.id, foreignAdmin.id])).rows[0];
    const foreignScheme = (await db.query("INSERT INTO admission_payment_schemes(tenant_id,track_id,name,code,amount,is_required,created_by) VALUES($1,$2,'Foreign','FOREIGN',1,true,$3) RETURNING id", [foreignTenant.id, foreignTrack.id, foreignAdmin.id])).rows[0];
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: foreignScheme.id, amount: 100, status: "PAID", payment_number: "BAD" }, admin, 400);
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: inactiveScheme.id, amount: 100, status: "PAID", payment_number: "INACTIVE" }, admin, 400);
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PAID", installment_number: 3, payment_number: "TOO-MANY" }, admin, 400);
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PAID", installment_number: 1, payment_number: "PAY-001", payment_reference: "REF-001", payment_method: "TRANSFER", paid_at: "2026-06-01T10:00:00.000Z" });
    await request(`admissions/applications/${application.id}/enroll`, "POST", { nis: "BYPASS-001", class_id: classRoom.id }, admin, 409);
    assert.equal((await db.query(
      "SELECT status,student_id FROM applications WHERE tenant_id=$1 AND id=$2",
      [tenant.id, application.id],
    )).rows[0].status, "ACCEPTED");
    assert.equal((await db.query(
      "SELECT count(*)::int AS count FROM students WHERE tenant_id=$1",
      [tenant.id],
    )).rows[0].count, 0);
    await request(`admissions/applications/${application.id}/re-registration`, "POST", { nis: "PPDB-4-001", class_id: classRoom.id, final_program: "Regular", parent_confirmed: true, documents: { consent: true }, notes: "Complete" }, admin, 409);
    const unrelatedProof = await post("files", {
      category: "PAYMENT_PROOF", description: "Unrelated proof", file_name: "unrelated-proof.pdf", mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\\nunrelated proof\\n%%EOF").toString("base64"),
    });
    await post("admissions/payments/record", {
      application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PAID",
      payment_number: "PAY-001", payment_proof_file_id: unrelatedProof.id,
    }, admin, 400);
    assert.equal((await db.query(
      "SELECT payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3",
      [tenant.id, application.id, scheme.id],
    )).rows[0].payment_proof_file_id, null);

    await post("users", { name: "Application Family", email: "application-family@four.test", password: "Password!2026", roles: ["PARENT"] });
    await post("users", { name: "Other Family", email: "other-family@four.test", password: "Password!2026", roles: ["PARENT"] });
    const ownerAccount = (await db.query("SELECT account_id FROM users WHERE tenant_id=$1 AND email=$2", [tenant.id, "application-family@four.test"])).rows[0];
    await db.query("UPDATE applications SET family_account_id=$3 WHERE tenant_id=$1 AND id=$2", [tenant.id, application.id, ownerAccount.account_id]);
    const otherFamily = (await login("ppdb-four", "other-family@four.test")).access_token;
    const proofPayload = { document_type: "PAYMENT_PROOF", file_name: "proof.pdf", mime_type: "application/pdf", data_base64: Buffer.from("%PDF-1.4\\nproof\\n%%EOF").toString("base64") };
    const activeProofs = async () => Number((await db.query("SELECT count(*)::int AS count FROM managed_files WHERE tenant_id=$1 AND category='PAYMENT_PROOF' AND deleted_at IS NULL", [tenant.id])).rows[0].count);
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PENDING", installment_number: 2, payment_number: "PAY-002" });
    const beforeUnauthorized = await activeProofs();
    await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}&installment_number=2`, proofPayload, otherFamily, 403);
    assert.equal(await activeProofs(), beforeUnauthorized);
    const beforeMismatched = await activeProofs();
    await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${mismatchedScheme.id}&installment_number=1`, proofPayload, admin, 400);
    assert.equal(await activeProofs(), beforeMismatched);
    await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}`, proofPayload, admin, 400);
    await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}&installment_number=0`, proofPayload, admin, 400);
    const linkedProof = await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}&installment_number=2`, proofPayload);
    await post("admissions/payments/record", {
      application_id: application.id, payment_scheme_id: secondScheme.id, amount: 100, status: "PAID",
      payment_number: "SECOND-001", payment_proof_file_id: linkedProof.id,
    }, admin, 400);
    assert.equal((await db.query(
      "SELECT count(*)::int AS count FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3",
      [tenant.id, application.id, secondScheme.id],
    )).rows[0].count, 0);
    const installmentsAfterProof = (await db.query("SELECT installment_number,status,payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 ORDER BY installment_number", [tenant.id, application.id, scheme.id])).rows;
    assert.deepEqual(installmentsAfterProof.map((row: any) => ({ installment_number: Number(row.installment_number), status: row.status, has_proof: row.payment_proof_file_id === linkedProof.id })), [
      { installment_number: 1, status: "PAID", has_proof: false },
      { installment_number: 2, status: "PENDING", has_proof: true },
    ]);
    await post("admissions/payments/record", {
      application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PENDING", installment_number: 2,
      payment_number: "PAY-002", payment_proof_file_id: linkedProof.id,
    });
    await request(`files/${linkedProof.id}`, "DELETE", undefined, admin, 409);
    assert.deepEqual((await db.query(
      "SELECT status,payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=2",
      [tenant.id, application.id, scheme.id],
    )).rows[0], { status: "PENDING", payment_proof_file_id: linkedProof.id });

    const section = (await db.query("INSERT INTO admission_form_sections(tenant_id,period_id,name,created_by) VALUES($1,$2,'Documents',$3) RETURNING id", [tenant.id, period.id, adminRow.id])).rows[0];
    const responseField = (await db.query("INSERT INTO admission_form_fields(tenant_id,section_id,label,field_key,field_type,is_required,created_by) VALUES($1,$2,'Response','RESPONSE','TEXT',false,$3) RETURNING id", [tenant.id, section.id, adminRow.id])).rows[0];
    const fileUploadField = (await db.query("INSERT INTO admission_form_fields(tenant_id,section_id,label,field_key,field_type,is_required,created_by) VALUES($1,$2,'Optional ID','OPTIONAL_ID','FILE_UPLOAD',false,$3) RETURNING id", [tenant.id, section.id, adminRow.id])).rows[0];
    const requiredFileUploadField = (await db.query("INSERT INTO admission_form_fields(tenant_id,section_id,label,field_key,field_type,is_required,created_by) VALUES($1,$2,'Required ID','REQUIRED_ID','FILE_UPLOAD',true,$3) RETURNING id", [tenant.id, section.id, adminRow.id])).rows[0];
    const ownerFamily = (await login("ppdb-four", "application-family@four.test")).access_token;
    await request(`admissions/forms/responses?application_id=${application.id}`, "GET", undefined, otherFamily, 403);
    await request(`admissions/payments/application?application_id=${application.id}`, "GET", undefined, otherFamily, 403);
    const interviewSlot = (await db.query(
      "INSERT INTO admission_interview_slots(tenant_id,period_id,track_id,date,start_time,end_time,quota,created_by) VALUES($1,$2,$3,'2026-12-31','09:00','10:00',2,$4) RETURNING id",
      [tenant.id, period.id, track.id, adminRow.id],
    )).rows[0];
    await db.query(
      "INSERT INTO admission_interview_bookings(tenant_id,application_id,slot_id) VALUES($1,$2,$3)",
      [tenant.id, application.id, interviewSlot.id],
    );
    await request(`admissions/interviews/available?application_id=${application.id}`, "GET", undefined, otherFamily, 403);
    await post("admissions/interviews/book", { application_id: application.id, slot_id: interviewSlot.id }, otherFamily, 403);
    await request(`admissions/interviews/cancel?application_id=${application.id}`, "POST", {}, otherFamily, 403);
    assert.equal((await db.query(
      "SELECT status FROM admission_interview_bookings WHERE tenant_id=$1 AND application_id=$2",
      [tenant.id, application.id],
    )).rows[0].status, "BOOKED");
    await db.query(
      "UPDATE admission_payments SET status='PENDING',payment_proof_file_id=NULL WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=2",
      [tenant.id, application.id, scheme.id],
    );
    const proofCountBeforeRace = await activeProofs();
    const paymentLock = await db.pool.connect();
    try {
      await paymentLock.query("BEGIN");
      await paymentLock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [tenant.id]);
      const racedUpload = fetch(`${origin}/api/v1/admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}&installment_number=2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerFamily },
        body: JSON.stringify(proofPayload),
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await activeProofs() > proofCountBeforeRace) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(await activeProofs(), proofCountBeforeRace + 1, "upload must reach its transaction boundary before payment is marked paid");
      await paymentLock.query(
        "UPDATE admission_payments SET status='PAID' WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=2",
        [tenant.id, application.id, scheme.id],
      );
      await paymentLock.query("COMMIT");
      const racedResponse = await racedUpload;
      assert.equal(racedResponse.status, 409, await racedResponse.text());
    } finally {
      await paymentLock.query("ROLLBACK").catch(() => {});
      paymentLock.release();
    }
    assert.deepEqual((await db.query(
      "SELECT status,payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=2",
      [tenant.id, application.id, scheme.id],
    )).rows[0], { status: "PAID", payment_proof_file_id: null });
    assert.equal(await activeProofs(), proofCountBeforeRace);
    const paidPaymentBeforeUpload = (await db.query(
      "SELECT status,payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=1",
      [tenant.id, application.id, scheme.id],
    )).rows[0];
    await post(`admissions/payments/proof?application_id=${application.id}&scheme_id=${scheme.id}&installment_number=1`, proofPayload, ownerFamily, 409);
    assert.deepEqual((await db.query(
      "SELECT status,payment_proof_file_id FROM admission_payments WHERE tenant_id=$1 AND application_id=$2 AND payment_scheme_id=$3 AND installment_number=1",
      [tenant.id, application.id, scheme.id],
    )).rows[0], paidPaymentBeforeUpload);
    await post("admissions/forms/responses", { application_id: application.id, section_id: section.id, responses: [{ field_id: responseField.id, value_text: "owner value" }] }, ownerFamily);
    await post("admissions/forms/responses", { application_id: application.id, section_id: section.id, responses: [{ field_id: responseField.id, value_text: "attacker value" }] }, otherFamily, 403);
    assert.equal((await db.query("SELECT value_text FROM admission_form_responses WHERE tenant_id=$1 AND application_id=$2 AND field_id=$3", [tenant.id, application.id, responseField.id])).rows[0].value_text, "owner value");
    await post("admissions/forms/responses", { application_id: application.id, section_id: section.id, responses: [{ field_id: fileUploadField.id, file_id: unrelatedProof.id }] }, ownerFamily, 400);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM admission_form_responses WHERE tenant_id=$1 AND application_id=$2 AND field_id=$3", [tenant.id, application.id, fileUploadField.id])).rows[0].count, 0);
    const formUpload = await post("files", {
      category: "PPDB_DOCUMENT", entity_type: "APPLICATION", entity_id: application.id,
      file_name: "required.pdf", mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\\nrequired form upload\\n%%EOF").toString("base64"),
    });
    await post("admissions/forms/responses", {
      application_id: application.id, section_id: section.id,
      responses: [{ field_id: requiredFileUploadField.id, file_id: formUpload.id }],
    }, ownerFamily);
    const mappedDocument = (await db.query(
      "SELECT id,verification_status,file_id FROM application_documents WHERE tenant_id=$1 AND application_id=$2 AND document_type='REQUIRED_ID'",
      [tenant.id, application.id],
    )).rows[0];
    assert.deepEqual(mappedDocument, { id: mappedDocument.id, verification_status: "PENDING", file_id: formUpload.id });
    await post("admissions/payments/record", { application_id: application.id, payment_scheme_id: scheme.id, amount: 100, status: "PAID", installment_number: 2, payment_number: "PAY-002" });
    await request(`admissions/applications/${application.id}/re-registration`, "POST", { nis: "PPDB-4-001", class_id: classRoom.id, final_program: "Regular", parent_confirmed: true, documents: { consent: true }, notes: "Complete" }, admin, 409);
    await request(`admissions/documents/${mappedDocument.id}`, "PATCH", { status: "VERIFIED" }, admin, 200);
    const first = await post(`admissions/applications/${application.id}/re-registration`, { nis: "PPDB-4-001", class_id: classRoom.id, final_program: "Regular", parent_confirmed: true, documents: { consent: true }, notes: "Complete" });
    const second = await post(`admissions/applications/${application.id}/re-registration`, { nis: "PPDB-4-001", class_id: classRoom.id, final_program: "Regular", parent_confirmed: true, documents: { consent: true }, notes: "Complete" });
    assert.equal(first.student.id, second.student.id);
    assert.equal(second.re_registration.application_id, application.id);
    assert.equal(second.re_registration.student_id, second.student.id);
    assert.notEqual(second.re_registration.id, second.student.id);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM students WHERE tenant_id=$1", [tenant.id])).rows[0].count, 1);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM admission_re_registrations WHERE tenant_id=$1 AND application_id=$2", [tenant.id, application.id])).rows[0].count, 1);
    await post("users", { name: "No Re-register", email: "no-rereg@four.test", password: "Password!2026", roles: ["PARENT"] });
    const noReRegister = (await login("ppdb-four", "no-rereg@four.test")).access_token;
    await request(`admissions/applications/${application.id}/re-registration`, "POST", { nis: "X", class_id: classRoom.id, final_program: "Regular", parent_confirmed: true }, noReRegister, 403);
  } finally {
    if (app) await app.close();
    await db.onModuleDestroy();
    process.env.DATABASE_URL = originalUrl;
    await base.query(`DROP SCHEMA ${schema} CASCADE`);
    await base.onModuleDestroy();
  }
});
