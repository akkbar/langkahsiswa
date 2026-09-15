import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { Actor } from "../../../../../packages/shared-types/src";
import { reportSchema, uuid } from "../../../../../packages/validation/src";
import { Database, Sql } from "../../database/database.service";
import {
  classSemester,
  enrolled,
  record,
  teachClass,
} from "../academics/academic-policy";
import { allow } from "../auth/permissions";
import {
  calculateFinalGrade,
  CategoryGrade,
} from "../gradebook/gradebook.service";
import { notifyStudent } from "../notifications/notification-delivery";

export async function reportPdf(report: any): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: {
      Title: `Raport ${report.snapshot.student.name}`,
      Author: "LangkahSiswa",
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const snap = report.snapshot;
  doc
    .fillColor("#0e6655")
    .fontSize(10)
    .text("LANGKAHSISWA / LAPORAN HASIL BELAJAR");
  doc
    .moveDown()
    .fillColor("#132b36")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(snap.school.name);
  if (snap.school.address)
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#51616b")
      .text(snap.school.address);
  doc.moveDown().font("Helvetica").fontSize(11).fillColor("#132b36");
  doc.text(`Nama: ${snap.student.name}`);
  doc.text(`NIS: ${snap.student.nis}`);
  doc.text(
    `Kelas: ${snap.class.name} | ${snap.academic_year.name} | ${snap.semester.name}`,
  );
  doc.text(
    `Status: ${report.status}${report.status === "PUBLISHED" ? "" : " - BELUM DIPUBLIKASIKAN"}`,
  );
  doc.moveDown(1.5);
  const header = () => {
    const y = doc.y;
    doc.rect(48, y, 499, 28).fill("#edf4f1");
    doc
      .fillColor("#132b36")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("MATA PELAJARAN", 60, y + 9, { width: 380 });
    doc.text("NILAI", 465, y + 9, { width: 70, align: "right" });
    doc.y = y + 38;
  };
  header();
  for (const item of report.items) {
    const height = Math.max(
      32,
      doc
        .font("Helvetica")
        .fontSize(11)
        .heightOfString(item.subject_name, { width: 365 }) + 16,
    );
    if (doc.y + height > 735) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    doc
      .fillColor("#132b36")
      .font("Helvetica")
      .fontSize(11)
      .text(item.subject_name, 60, y, { width: 365 });
    doc
      .font("Helvetica-Bold")
      .text(Number(item.final_grade).toFixed(2), 465, y, {
        width: 70,
        align: "right",
      });
    doc
      .moveTo(48, y + height - 8)
      .lineTo(547, y + height - 8)
      .strokeColor("#dce5e3")
      .stroke();
    doc.y = y + height;
  }
  doc.x = 48;
  if (doc.y > 610) doc.addPage();
  doc.moveDown().font("Helvetica-Bold").fontSize(11).text("Kehadiran");
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      Object.entries(snap.attendance)
        .map(([key, value]) => `${key}: ${value}`)
        .join("   "),
      { width: 499 },
    );
  doc.moveDown().font("Helvetica-Bold").text("Catatan wali kelas");
  doc.font("Helvetica").text(report.notes || "-", { width: 499 });
  doc.moveDown().text(`Wali kelas: ${snap.homeroom_name || "-"}`);
  doc.text(`Kepala sekolah: ${snap.school.principal_name || "-"}`);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor("#71817f")
      .text(`LangkahSiswa | ${report.id} | ${i + 1}/${range.count}`, 48, 780, {
        lineBreak: false,
      });
  }
  doc.end();
  return done;
}
@Injectable()
export class ReportsService {
  constructor(
    @Inject(Database)
    private readonly db: Database,
  ) {}
  private async visible(sql: Sql, actor: Actor, id: string) {
    const report = await record(
      sql,
      "report_cards",
      actor.tenant_id,
      uuid.parse(id),
    );
    if (
      !actor.permissions.includes("*") &&
      !actor.permissions.includes("report.read")
    ) {
      allow(actor, "report.own");
      const linked = await sql.query(
        `SELECT 1 FROM students s WHERE s.tenant_id=$1 AND s.id=$2 AND
    (s.user_id=$3 OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$3))`,
        [actor.tenant_id, report.student_id, actor.id],
      );
      if (report.status !== "PUBLISHED" || !linked.rowCount)
        throw new NotFoundException("Raport tidak ditemukan");
    }
    report.items = (
      await sql.query(
        "SELECT * FROM report_card_items WHERE tenant_id=$1 AND report_card_id=$2 ORDER BY subject_name",
        [actor.tenant_id, id],
      )
    ).rows;
    return report;
  }
  async list(actor: Actor, classId?: string, semesterId?: string) {
    const staff =
      actor.permissions.includes("*") ||
      actor.permissions.includes("report.read");
    if (!staff) allow(actor, "report.own");
    const values: unknown[] = [actor.tenant_id];
    const filters = ["r.tenant_id=$1"];
    if (classId) {
      values.push(uuid.parse(classId));
      filters.push(`r.class_id=$${values.length}`);
    }
    if (semesterId) {
      values.push(uuid.parse(semesterId));
      filters.push(`r.semester_id=$${values.length}`);
    }
    if (!staff) {
      values.push(actor.id);
      filters.push(
        `r.status='PUBLISHED' AND EXISTS(SELECT 1 FROM students s WHERE s.tenant_id=r.tenant_id AND s.id=r.student_id AND (s.user_id=$${values.length} OR EXISTS(SELECT 1 FROM student_guardians g JOIN parents p ON p.tenant_id=g.tenant_id AND p.id=g.parent_id WHERE g.tenant_id=s.tenant_id AND g.student_id=s.id AND p.user_id=$${values.length})))`,
      );
    }
    const data = (
      await this.db.query(
        `SELECT r.* FROM report_cards r WHERE ${filters.join(" AND ")} ORDER BY r.calculated_at DESC`,
        values,
      )
    ).rows;
    return { data, total: data.length };
  }
  get(actor: Actor, id: string) {
    return this.visible(this.db, actor, id);
  }
  async pdf(actor: Actor, id: string, res: Response) {
    const report = await this.visible(this.db, actor, id);
    const bytes = await reportPdf(report);
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="raport-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      })
      .send(bytes);
  }
  async calculate(actor: Actor, body: unknown) {
    allow(actor, "report.calculate");
    const input = reportSchema.parse(body);
    const tenant = actor.tenant_id;
    return this.db.transaction(tenant, async (sql) => {
      await teachClass(sql, actor, input.class_id, true);
      const { cls, semester } = await classSemester(
        sql,
        tenant,
        input.class_id,
        input.semester_id,
      );
      await enrolled(sql, tenant, input.class_id, input.student_id);
      const old = (
        await sql.query(
          "SELECT * FROM report_cards WHERE tenant_id=$1 AND student_id=$2 AND semester_id=$3",
          [tenant, input.student_id, input.semester_id],
        )
      ).rows[0];
      if (old && old.status !== "DRAFT")
        throw new ConflictException(
          "Raport harus dibuka kembali sebelum dihitung ulang",
        );
      const subjects = (
        await sql.query(
          "SELECT cs.*,s.name AS subject_name FROM class_subjects cs JOIN subjects s ON s.tenant_id=cs.tenant_id AND s.id=cs.subject_id WHERE cs.tenant_id=$1 AND cs.class_id=$2 AND cs.semester_id=$3",
          [tenant, input.class_id, input.semester_id],
        )
      ).rows;
      if (!subjects.length)
        throw new BadRequestException("Kelas belum memiliki pelajaran");
      const items = [];
      for (const subject of subjects) {
        const categories = (
          await sql.query(
            "SELECT * FROM assessment_categories WHERE tenant_id=$1 AND class_subject_id=$2 ORDER BY name",
            [tenant, subject.id],
          )
        ).rows;
        const grades: CategoryGrade[] = [];
        for (const category of categories) {
          const assessments = (
            await sql.query(
              `SELECT a.name,a.max_score,ss.score FROM assessments a LEFT JOIN student_scores ss ON ss.tenant_id=a.tenant_id AND ss.assessment_id=a.id AND ss.student_id=$3 WHERE a.tenant_id=$1 AND a.category_id=$2 ORDER BY a.name`,
              [tenant, category.id, input.student_id],
            )
          ).rows;
          grades.push({
            name: category.name,
            weight: category.weight,
            assessments,
          });
        }
        items.push({
          subject_id: subject.subject_id,
          subject_name: subject.subject_name,
          ...calculateFinalGrade(grades),
        });
      }
      const student = await record(sql, "students", tenant, input.student_id);
      const year = await record(
        sql,
        "academic_years",
        tenant,
        cls.academic_year_id,
      );
      const school = await record(sql, "schools", tenant, year.school_id);
      const attendance = {
        PRESENT: 0,
        LATE: 0,
        SICK: 0,
        PERMISSION: 0,
        ABSENT: 0,
      };
      const counts = (
        await sql.query(
          "SELECT ar.status,count(*)::int AS count FROM attendance_records ar JOIN attendance_sessions s ON s.tenant_id=ar.tenant_id AND s.id=ar.session_id WHERE ar.tenant_id=$1 AND ar.student_id=$2 AND s.class_id=$3 AND s.semester_id=$4 GROUP BY ar.status",
          [tenant, input.student_id, input.class_id, input.semester_id],
        )
      ).rows;
      for (const count of counts)
        attendance[count.status as keyof typeof attendance] = count.count;
      const homeroom = cls.homeroom_teacher_id
        ? await record(sql, "teachers", tenant, cls.homeroom_teacher_id)
        : null;
      const snapshot = {
        student: { name: student.name, nis: student.nis },
        class: { name: cls.name },
        academic_year: { name: year.name },
        semester: { name: semester.name },
        school: {
          name: school.name,
          address: school.address,
          principal_name: school.principal_name,
        },
        homeroom_name: homeroom?.name,
        attendance,
      };
      const report = (
        await sql.query(
          `INSERT INTO report_cards(tenant_id,student_id,class_id,semester_id,snapshot) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(tenant_id,student_id,semester_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,calculated_at=now(),class_id=EXCLUDED.class_id RETURNING *`,
          [
            tenant,
            input.student_id,
            input.class_id,
            input.semester_id,
            JSON.stringify(snapshot),
          ],
        )
      ).rows[0];
      await sql.query(
        "DELETE FROM report_card_items WHERE tenant_id=$1 AND report_card_id=$2",
        [tenant, report.id],
      );
      for (const item of items)
        await sql.query(
          "INSERT INTO report_card_items(tenant_id,report_card_id,subject_id,subject_name,final_grade,details) VALUES($1,$2,$3,$4,$5,$6)",
          [
            tenant,
            report.id,
            item.subject_id,
            item.subject_name,
            item.final_grade,
            JSON.stringify(item.details),
          ],
        );
      return { ...report, items };
    });
  }
  async transition(actor: Actor, id: string, action: string, body: unknown) {
    uuid.parse(id);
    const input = z
      .object({ notes: z.string().max(3000).optional() })
      .strict()
      .parse(body || {});
    const permissions: Record<string, string> = {
      review: "report.review",
      approve: "report.approve",
      publish: "report.publish",
      reopen: "report.review",
    };
    if (!permissions[action]) throw new NotFoundException();
    allow(actor, permissions[action]);
    return this.db.transaction(actor.tenant_id, async (sql) => {
      const report = await record(sql, "report_cards", actor.tenant_id, id);
      const settings = (
        await sql.query("SELECT * FROM tenant_settings WHERE tenant_id=$1", [
          actor.tenant_id,
        ])
      ).rows[0];
      if (report.status === "PUBLISHED")
        throw new ConflictException(
          "Raport yang dipublikasikan bersifat tetap",
        );
      let status: string;
      if (action === "review") {
        await teachClass(sql, actor, report.class_id, true);
        if (report.status !== "DRAFT")
          throw new ConflictException("Hanya draft dapat direview");
        status = "REVIEWED";
      } else if (action === "approve") {
        if (report.status !== "REVIEWED")
          throw new ConflictException("Raport harus direview dahulu");
        status = "APPROVED";
      } else if (action === "publish") {
        if (
          !["REVIEWED", "APPROVED"].includes(report.status) ||
          (settings.principal_approval_required && report.status !== "APPROVED")
        )
          throw new ConflictException(
            "Review atau persetujuan kepala sekolah belum selesai",
          );
        status = "PUBLISHED";
      } else {
        await teachClass(sql, actor, report.class_id, true);
        if (!["REVIEWED", "APPROVED"].includes(report.status))
          throw new ConflictException("Raport bukan dalam tahap review");
        status = "DRAFT";
      }
      if (status === "PUBLISHED") {
        await notifyStudent(
          sql,
          actor.tenant_id,
          report.student_id,
          "Raport dipublikasikan",
          "Raport siswa sudah tersedia untuk dilihat dan diunduh.",
          { type: "REPORT", student_id: report.student_id, report_id: id },
          `report:${id}:published`,
        );
      }
      return (
        await sql.query(
          `UPDATE report_cards SET status=$3,notes=COALESCE($4,notes),reviewed_by=CASE WHEN $3='REVIEWED' THEN $5::uuid WHEN $3='DRAFT' THEN NULL ELSE reviewed_by END,
    approved_by=CASE WHEN $3='APPROVED' THEN $5::uuid WHEN $3='DRAFT' THEN NULL ELSE approved_by END,published_at=CASE WHEN $3='PUBLISHED' THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 RETURNING *`,
          [actor.tenant_id, id, status, input.notes ?? null, actor.id],
        )
      ).rows[0];
    });
  }
}
