import "../src/config";
import { hash } from "bcryptjs";
import { Database } from "../src/database";
import { createTenant, initializeRoles } from "../src/auth";
import { generateSchedule, type Lesson } from "../src/schedule-engine";
export async function seedSimulation(db: Database) {
  const password = process.env.SEED_SIMULATION_PASSWORD || "Simulasi!2026";
  const passwordHash = await hash(password, 12);
  return db.transaction(null, async (sql) => {
    await sql.query("SELECT pg_advisory_xact_lock(2026091401)");
    const existing = (
      await sql.query("SELECT * FROM tenants WHERE slug='simulasi'")
    ).rows[0];
    if (existing) return { tenant: existing, created: false };
    await initializeRoles(sql);
    const tenant = await createTenant(sql, {
      name: "Yayasan Simulasi Nusantara",
      slug: "simulasi",
      admin_name: "Admin Simulasi",
      admin_email: "admin@simulasi.example.test",
      admin_password: password,
    });
    const org = (
      await sql.query(
        "SELECT organization_id FROM organization_sites WHERE tenant_id=$1",
        [tenant.id],
      )
    ).rows[0].organization_id;
    const insert = async (table: string, data: Record<string, unknown>) => {
      const keys = Object.keys(data);
      return (
        await sql.query(
          `INSERT INTO ${table}(tenant_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [tenant.id, ...Object.values(data)],
        )
      ).rows[0];
    };
    const account = async (name: string, email: string, role: string) => {
      const level = role === "TEACHER" ? "OPERATIONAL" : "FAMILY";
      const a = (
        await sql.query(
          "INSERT INTO accounts(name,email,account_level) VALUES($1,$2,$3) RETURNING id",
          [name, email, level],
        )
      ).rows[0];
      if (level === "FAMILY")
        await sql.query(
          "INSERT INTO family_accounts(account_id,created_via) VALUES($1,'SCHOOL_ADMIN')",
          [a.id],
        );
      else
        await sql.query(
          "INSERT INTO operational_accounts(account_id,position) VALUES($1,'TEACHER')",
          [a.id],
        );
      const u = await insert("users", {
        account_id: a.id,
        name,
        email,
        password_hash: passwordHash,
      });
      await insert("user_roles", { user_id: u.id, role_id: role });
      await sql.query(
        "INSERT INTO user_bindings(account_id,organization_id,tenant_id,role_id) VALUES($1,$2,$3,$4)",
        [a.id, org, tenant.id, role],
      );
      return u.id;
    };
    const school = await insert("schools", {
      name: "SMP Simulasi Nusantara",
      school_level: "SMP",
      education_authority: "KEMENDIKBUD",
      address: "Jl. Pendidikan Simulasi No. 1",
      principal_name: "Ratna Wulandari",
    });
    const year = await insert("academic_years", {
      school_id: school.id,
      name: "2026/2027",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      is_active: true,
      status: "ACTIVE",
    });
    const semester = await insert("semesters", {
      academic_year_id: year.id,
      name: "Semester 1",
      start_date: "2026-07-01",
      end_date: "2026-12-31",
    });
    await insert("semesters", {
      academic_year_id: year.id,
      name: "Semester 2",
      start_date: "2027-01-01",
      end_date: "2027-06-30",
    });
    const grades = [];
    for (let level = 7; level <= 9; level++) {
      const g = (
        await sql.query(
          "INSERT INTO grade_levels(tenant_id,school_id,name,level) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,school_id,level) DO UPDATE SET name=excluded.name RETURNING *",
          [tenant.id, school.id, `Kelas ${level}`, level],
        )
      ).rows[0];
      grades.push(g);
    }
    const subjects = (
      await sql.query(
        "SELECT * FROM subjects WHERE tenant_id=$1 AND school_id=$2 ORDER BY code",
        [tenant.id, school.id],
      )
    ).rows;
    const weights: Record<string, number> = {
      PA: 3,
      PPKN: 2,
      BIN: 5,
      MTK: 5,
      IPA: 4,
      IPS: 3,
      BING: 4,
      INF: 2,
      PJOK: 3,
      SENI: 2,
      MULOK: 2,
    };
    const names = [
      "Dewi Lestari",
      "Ahmad Fauzi",
      "Siti Rahmawati",
      "Bambang Setiawan",
      "Rina Anggraini",
      "Hendra Saputra",
      "Nur Aisyah",
      "Agus Santoso",
      "Fitri Handayani",
      "Dedi Kurniawan",
      "Ratna Puspita",
    ];
    const teachers = [];
    for (const [i, s] of subjects.entries()) {
      const email = `guru${String(i + 1).padStart(2, "0")}@simulasi.example.test`;
      const teacher = await insert("teachers", {
        name: names[i] || `Guru ${i + 1}`,
        nip: `SIM-G${String(i + 1).padStart(3, "0")}`,
        email,
        user_id: await account(names[i] || `Guru ${i + 1}`, email, "TEACHER"),
      });
      teachers.push(teacher);
      await insert("teacher_subjects", {
        teacher_id: teacher.id,
        subject_id: s.id,
      });
      for (const grade of grades) {
        await insert("teacher_competencies", {
          teacher_id: teacher.id,
          subject_id: s.id,
          grade_level_id: grade.id,
        });
        await insert("subject_weekly_weights", {
          subject_id: s.id,
          grade_level_id: grade.id,
          weekly_weight: weights[s.code] || 2,
        });
        await insert("year_subject_curricula", {
          academic_year_id: year.id,
          subject_id: s.id,
          grade_level_id: grade.id,
          weekly_hours: weights[s.code] || 2,
          period_minutes: 40,
        });
      }
    }
    const male = [
      "Ahmad",
      "Bagas",
      "Candra",
      "Dimas",
      "Eka",
      "Fajar",
      "Gilang",
      "Hasan",
      "Ilham",
      "Joko",
      "Kevin",
      "Lutfi",
      "Muhammad",
      "Naufal",
      "Oscar",
      "Putra",
      "Rafi",
      "Surya",
      "Taufik",
      "Umar",
      "Vino",
      "Wahyu",
      "Yusuf",
      "Zaki",
      "Arif",
    ];
    const female = [
      "Aisyah",
      "Bella",
      "Citra",
      "Dewi",
      "Elsa",
      "Farah",
      "Gita",
      "Hana",
      "Intan",
      "Jihan",
      "Kirana",
      "Laila",
      "Maya",
      "Nadia",
      "Olivia",
      "Putri",
      "Qonita",
      "Rani",
      "Salsa",
      "Tiara",
      "Ulfa",
      "Vina",
      "Wulan",
      "Yasmin",
      "Zahra",
    ];
    const surnames = [
      "Pratama",
      "Saputra",
      "Wijaya",
      "Nugraha",
      "Utami",
      "Permata",
    ];
    const lessons: Lesson[] = [];
    let number = 0;
    for (const [gi, grade] of grades.entries())
      for (const [genderIndex, gender] of ["MALE", "FEMALE"].entries()) {
        const name = `${grade.level}-${genderIndex === 0 ? "Putra" : "Putri"}`;
        const room = await insert("classrooms", {
          school_id: school.id,
          name: `Ruang ${name}`,
          code: `SIM-${name}`,
          capacity: 25,
          building: "Gedung Simulasi",
          floor: String(gi + 1),
        });
        const cls = await insert("classes", {
          academic_year_id: year.id,
          grade_level_id: grade.id,
          name,
          capacity: 25,
          classroom_id: room.id,
          homeroom_teacher_id: teachers[gi * 2 + genderIndex].id,
        });
        for (let i = 0; i < 25; i++) {
          number++;
          const code = String(number).padStart(3, "0");
          const studentName = `${(gender === "MALE" ? male : female)[i]} ${surnames[gi * 2 + genderIndex]}`;
          const email = `siswa${code}@simulasi.example.test`,
            parentEmail = `ortu${code}@simulasi.example.test`,
            parentName = `Wali ${studentName}`;
          const student = await insert("students", {
            name: studentName,
            nis: `SIM2026${code}`,
            gender,
            email,
            birth_date: `${2014 - gi}-03-${String((i % 28) + 1).padStart(2, "0")}`,
            user_id: await account(studentName, email, "STUDENT"),
            status: "ACTIVE",
          });
          const parent = await insert("parents", {
            name: parentName,
            email: parentEmail,
            phone: `08120000${String(number).padStart(4, "0")}`,
            user_id: await account(parentName, parentEmail, "PARENT"),
          });
          await insert("student_guardians", {
            student_id: student.id,
            parent_id: parent.id,
            relationship: "GUARDIAN",
            is_primary: true,
          });
          await insert("class_students", {
            class_id: cls.id,
            student_id: student.id,
            academic_year_id: year.id,
          });
          await insert("student_enrollments", {
            student_id: student.id,
            academic_year_id: year.id,
            school_id: school.id,
            grade_level_id: grade.id,
            classroom_id: cls.id,
            enrollment_status: "ACTIVE",
          });
        }
        for (const [i, s] of subjects.entries()) {
          const binding = await insert("class_subjects", {
            class_id: cls.id,
            subject_id: s.id,
            teacher_id: teachers[i].id,
            semester_id: semester.id,
          });
          await insert("teacher_assignments", {
            academic_year_id: year.id,
            teacher_id: teachers[i].id,
            subject_id: s.id,
            classroom_id: cls.id,
            weekly_hours: weights[s.code] || 2,
          });
          lessons.push({
            id: binding.id,
            class_id: cls.id,
            teacher_id: teachers[i].id,
            weekly_weight: weights[s.code] || 2,
            name: s.name,
            room: room.name,
          });
        }
      }
    const slots = generateSchedule(lessons, {
      days: [1, 2, 3, 4, 5],
      periods: 8,
      start: "07:00",
      minutes: 40,
      break_after: 4,
      break_minutes: 30,
    });
    for (const slot of slots)
      await insert("timetables", {
        class_subject_id: slot.class_subject_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        room: slot.room,
      });
    return {
      tenant,
      created: true,
      students: 150,
      parents: 150,
      teachers: teachers.length,
      classes: 6,
      slots: slots.length,
    };
  });
}
if (require.main === module) {
  const db = new Database();
  seedSimulation(db)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.onModuleDestroy());
}
