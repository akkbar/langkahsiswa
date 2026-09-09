import "../src/config";
import { Database } from "../src/database";
import { createTenant, initializeRoles } from "../src/auth";
export async function seed(db: Database) {
  return db.transaction(null, async (sql) => {
    await initializeRoles(sql);
    const existing = (
      await sql.query("SELECT * FROM tenants WHERE slug='demo'")
    ).rows[0];
    if (existing) return existing;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 12)
      throw new Error("SEED_ADMIN_PASSWORD minimal 12 karakter wajib diisi");
    const tenant = await createTenant(sql, {
      name: "SMP Nusantara",
      slug: "demo",
      admin_name: "Administrator Sekolah",
      admin_email: process.env.SEED_ADMIN_EMAIL || "admin@demo.langkahsiswa.id",
      admin_password: password,
    });
    const insert = async (table: string, data: Record<string, unknown>) => {
      const keys = Object.keys(data);
      return (
        await sql.query(
          `INSERT INTO ${table}(tenant_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [tenant.id, ...Object.values(data)],
        )
      ).rows[0];
    };
    const school = await insert("schools", {
      name: "SMP Nusantara",
      address: "Jl. Pendidikan No. 12, Bandung",
      principal_name: "Dr. Ratna Wulandari",
    });
    const year = await insert("academic_years", {
      school_id: school.id,
      name: "2026/2027",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      is_active: true,
    });
    const semester = await insert("semesters", {
      academic_year_id: year.id,
      name: "Semester 1",
      start_date: "2026-07-01",
      end_date: "2026-12-31",
    });
    const level = await insert("grade_levels", {
      school_id: school.id,
      name: "Kelas 7",
      level: 7,
    });
    const teacher = await insert("teachers", {
      name: "Dewi Lestari",
      nip: "G001",
      email: "dewi@example.test",
    });
    const cls = await insert("classes", {
      academic_year_id: year.id,
      grade_level_id: level.id,
      name: "7A",
      homeroom_teacher_id: teacher.id,
    });
    const parent = await insert("parents", {
      name: "Budi Pratama",
      phone: "081200000001",
    });
    const students = [];
    for (const [i, name] of [
      "Ahmad Pratama",
      "Aisyah Putri",
      "Bagas Saputra",
    ].entries()) {
      const student = await insert("students", {
        name,
        nis: `202600${i + 1}`,
        status: "ACTIVE",
      });
      students.push(student);
      await insert("class_students", {
        class_id: cls.id,
        student_id: student.id,
        academic_year_id: year.id,
      });
    }
    await insert("student_guardians", {
      student_id: students[0].id,
      parent_id: parent.id,
      relationship: "FATHER",
      is_primary: true,
    });
    const subject = await insert("subjects", {
      school_id: school.id,
      name: "Matematika",
      code: "MTK",
    });
    await insert("teacher_subjects", {
      teacher_id: teacher.id,
      subject_id: subject.id,
    });
    const cs = await insert("class_subjects", {
      class_id: cls.id,
      subject_id: subject.id,
      teacher_id: teacher.id,
      semester_id: semester.id,
    });
    await insert("timetables", {
      class_subject_id: cs.id,
      day_of_week: 1,
      start_time: "07:00",
      end_time: "08:30",
      room: "Ruang 7A",
    });
    for (const [name, weight] of [
      ["Tugas", 20],
      ["Kuis", 20],
      ["UTS", 25],
      ["UAS", 35],
    ] as const) {
      const category = await insert("assessment_categories", {
        class_subject_id: cs.id,
        name,
        weight,
      });
      await insert("assessments", {
        category_id: category.id,
        name: `${name} 1`,
        max_score: 100,
        due_date: name === "UAS" ? "2026-12-10" : "2026-09-07",
      });
    }
    return tenant;
  });
}
if (require.main === module) {
  const db = new Database();
  seed(db)
    .then((t) => console.log(`Seed siap. Tenant slug: ${t.slug}, ID: ${t.id}`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.onModuleDestroy());
}
