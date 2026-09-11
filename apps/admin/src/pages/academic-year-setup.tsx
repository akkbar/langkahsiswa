import React, { useEffect, useState } from "react";
import type {
  Actor,
  Entity,
  Page,
} from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Catalog, Empty, ErrorBox } from "../components";

type SetupRow = Entity & {
  name: string;
  school_name: string;
  start_date: string;
  end_date: string;
  status: string;
  completed_steps: number;
};
type SetupStep = {
  step_key: string;
  step_order: number;
  setup_level: "FOUNDATION" | "SCHOOL" | "OPERATIONAL";
  status: "PENDING" | "COMPLETE";
  payload: Record<string, unknown>;
};
type SetupDetail = SetupRow & {
  steps: SetupStep[];
  checks: {
    key: string;
    severity: "ERROR" | "WARNING";
    passed: boolean;
    label: string;
  }[];
  can_activate: boolean;
  setup_catalog: {
    classrooms: Entity[];
    grade_levels: Entity[];
    subjects: Entity[];
    teachers: Entity[];
    students: Entity[];
    formations: Entity[];
  };
};

const stepMeta: Record<string, { title: string; hint: string }> = {
  identity: {
    title: "Identitas Tahun Ajaran",
    hint: "Nama, rentang tanggal, semester awal, dan sumber konfigurasi.",
  },
  calendar: {
    title: "Kalender Akademik",
    hint: "Hari efektif, libur, ujian, rapor, kenaikan kelas, dan agenda khusus.",
  },
  structure: {
    title: "Grade & Rombel",
    hint: "Tingkat aktif, rombel, program, wali kelas, dan kapasitas.",
  },
  promotion: {
    title: "Promosi Siswa",
    hint: "Naik kelas, tinggal kelas, mutasi, kelulusan, dan siswa baru.",
  },
  subjects: {
    title: "Mata Pelajaran",
    hint: "Mapel per tingkat, JP mingguan, durasi, jenis, dan kategori.",
  },
  teacher_assignments: {
    title: "Penugasan Guru",
    hint: "Hubungkan guru, mapel, rombel, dan beban JP untuk tahun ini.",
  },
  schedule: {
    title: "Jadwal",
    hint: "Hari sekolah, periode belajar, istirahat, kelas, dan ruangan.",
  },
  assessment_grading: {
    title: "Penilaian & Ketuntasan",
    hint: "Bobot formatif/sumatif, KKM, rentang nilai, dan aturan rapor.",
  },
  attendance: {
    title: "Kehadiran",
    hint: "Jam masuk, toleransi terlambat, status, dan metode pencatatan.",
  },
  student_fees: {
    title: "Keuangan Siswa",
    hint: "SPP, kegiatan, daftar ulang, boarding, makan, dan transport.",
  },
  activities_operations: {
    title: "Kegiatan & Operasional",
    hint: "Ekskul, asrama, wallet, kantin, serta peninjauan tugas staf.",
  },
  review: {
    title: "Review & Aktivasi",
    hint: "Periksa kesiapan kritis sebelum tahun ajaran diaktifkan.",
  },
};
type StepField = {
  key: string;
  label: string;
  type?: "text" | "number" | "time" | "checkbox" | "select";
  options?: string[];
};
const stepFields: Record<string, StepField[]> = {
  calendar: [
    { key: "effective_days", label: "Target hari efektif", type: "number" },
    { key: "school_days", label: "Hari sekolah" },
    { key: "holiday_policy", label: "Acuan hari libur" },
    { key: "report_date", label: "Rencana pembagian rapor" },
  ],
  structure: [
    { key: "active_grades", label: "Tingkat aktif" },
    { key: "class_count", label: "Target jumlah rombel", type: "number" },
    { key: "programs", label: "Jurusan/program" },
    { key: "default_capacity", label: "Kapasitas default", type: "number" },
  ],
  promotion: [
    { key: "promotion_pattern", label: "Pola promosi kelas" },
    { key: "promoted_count", label: "Siswa naik kelas", type: "number" },
    { key: "retained_count", label: "Siswa tinggal kelas", type: "number" },
    { key: "new_student_count", label: "Siswa baru", type: "number" },
  ],
  subjects: [
    { key: "active_subjects", label: "Mapel aktif" },
    { key: "default_weekly_hours", label: "Default JP/minggu", type: "number" },
    { key: "period_minutes", label: "Durasi JP (menit)", type: "number" },
    { key: "curriculum", label: "Kurikulum/acuan" },
  ],
  teacher_assignments: [
    { key: "assigned_count", label: "Penugasan dibuat", type: "number" },
    { key: "unassigned_count", label: "Mapel belum ada guru", type: "number" },
    {
      key: "maximum_weekly_hours",
      label: "Batas JP guru/minggu",
      type: "number",
    },
  ],
  schedule: [
    { key: "school_days", label: "Hari sekolah" },
    { key: "start_time", label: "Jam masuk", type: "time" },
    { key: "period_count", label: "Jumlah periode/hari", type: "number" },
    { key: "period_minutes", label: "Durasi periode", type: "number" },
    { key: "break_minutes", label: "Durasi istirahat", type: "number" },
  ],
  assessment_grading: [
    {
      key: "model",
      label: "Model penilaian",
      type: "select",
      options: ["Kurikulum Merdeka", "Bobot Komponen", "Kustom"],
    },
    { key: "formative_weight", label: "Bobot formatif (%)", type: "number" },
    { key: "summative_weight", label: "Bobot sumatif (%)", type: "number" },
    { key: "minimum_score", label: "Nilai minimum/KKM", type: "number" },
  ],
  attendance: [
    { key: "start_time", label: "Jam masuk", type: "time" },
    {
      key: "late_tolerance",
      label: "Toleransi terlambat (menit)",
      type: "number",
    },
    {
      key: "method",
      label: "Metode",
      type: "select",
      options: ["Manual", "QR", "RFID", "Biometric"],
    },
    {
      key: "allow_early_leave",
      label: "Aktifkan status pulang awal",
      type: "checkbox",
    },
  ],
  student_fees: [
    { key: "billing_period", label: "Periode penagihan" },
    { key: "monthly_tuition", label: "SPP bulanan", type: "number" },
    { key: "registration_fee", label: "Daftar ulang", type: "number" },
    {
      key: "auto_generate",
      label: "Generate tagihan otomatis",
      type: "checkbox",
    },
  ],
  activities_operations: [
    {
      key: "extracurricular_reviewed",
      label: "Ekskul sudah ditinjau",
      type: "checkbox",
    },
    {
      key: "boarding_reviewed",
      label: "Asrama sudah ditinjau",
      type: "checkbox",
    },
    {
      key: "wallet_carry_over",
      label: "Carry-over saldo wallet",
      type: "checkbox",
    },
    {
      key: "staff_reviewed",
      label: "Tugas dan akses staf sudah ditinjau",
      type: "checkbox",
    },
  ],
};
const emptyCreate = {
  name: "",
  start_date: "",
  end_date: "",
  semester_name: "Ganjil",
  semester_start_date: "",
  semester_end_date: "",
  source_academic_year_id: "",
};

export function AcademicYearSetupPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [result, setResult] = useState<Page<SetupRow>>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [drawer, setDrawer] = useState<"create" | "wizard" | null>(null);
  const [detail, setDetail] = useState<SetupDetail | null>(null);
  const [selectedStep, setSelectedStep] = useState(2);
  const [stepForm, setStepForm] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState(emptyCreate);
  const activeSchool = (catalog.schools || [])[0];
  const years = (catalog["academic-years"] || []).filter(
    (year) => year.school_id === activeSchool?.id,
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Page<SetupRow>>(
      `academic-year-setups?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
    )
      .then((value) => active && setResult(value))
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, search, version]);

  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && !busy && setDrawer(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer, busy]);

  function payloadForStep(value: SetupDetail, step?: SetupStep) {
    const payload = step?.payload || {};
    if (
      step?.step_key === "structure" &&
      !Array.isArray(payload.formations) &&
      value.setup_catalog.formations.length
    )
      return { ...payload, formations: value.setup_catalog.formations };
    return payload;
  }

  async function openWizard(id: string, step?: number) {
    setBusy(true);
    setError("");
    try {
      const value = await api<SetupDetail>(`academic-year-setups/${id}`);
      const nextStep =
        step || Math.min(12, Math.max(1, value.current_step as number));
      setDetail(value);
      setSelectedStep(nextStep);
      const selected = value.steps.find((item) => item.step_order === nextStep);
      setStepForm(payloadForStep(value, selected));
      setDrawer("wizard");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function chooseStep(step: SetupStep) {
    setSelectedStep(step.step_order);
    setStepForm(detail ? payloadForStep(detail, step) : step.payload || {});
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSchool) return setError("Sekolah aktif belum tersedia");
    setBusy(true);
    setError("");
    try {
      const created = await send<SetupRow>("academic-year-setups", {
        ...form,
        school_id: activeSchool.id,
        source_academic_year_id: form.source_academic_year_id || null,
      });
      await refresh();
      setForm(emptyCreate);
      setVersion((value) => value + 1);
      await openWizard(String(created.id), 2);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStep(complete: boolean) {
    if (!detail) return;
    const step = detail.steps.find((item) => item.step_order === selectedStep);
    if (!step || ["identity", "review"].includes(step.step_key)) return;
    setBusy(true);
    setError("");
    try {
      await send(
        `academic-year-setups/${detail.id}/steps/${step.step_key}`,
        { payload: stepForm, complete },
        "PATCH",
      );
      await openWizard(
        String(detail.id),
        Math.min(12, selectedStep + (complete ? 1 : 0)),
      );
      setVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (
      !detail ||
      !window.confirm(
        `Aktifkan tahun ajaran ${detail.name}? Tahun aktif sebelumnya akan ditutup.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await send(`academic-year-setups/${detail.id}/activate`, {});
      await Promise.all([refresh(), openWizard(String(detail.id), 12)]);
      setVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: SetupRow) {
    if (!window.confirm(`Hapus setup ${row.name}?`)) return;
    setBusy(true);
    try {
      await api(`academic-year-setups/${row.id}`, { method: "DELETE" });
      await refresh();
      setVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = detail?.steps.find(
    (item) => item.step_order === selectedStep,
  );
  const rows = (key: string) =>
    Array.isArray(stepForm[key])
      ? (stepForm[key] as Record<string, unknown>[])
      : [];
  const addRow = (key: string, value: Record<string, unknown>) =>
    setStepForm({ ...stepForm, [key]: [...rows(key), value] });
  const updateRow = (
    key: string,
    index: number,
    field: string,
    value: unknown,
  ) =>
    setStepForm({
      ...stepForm,
      [key]: rows(key).map((row, position) =>
        position === index ? { ...row, [field]: value } : row,
      ),
    });
  const removeRow = (key: string, index: number) =>
    setStepForm({
      ...stepForm,
      [key]: rows(key).filter((_, position) => position !== index),
    });

  function structuredEditor() {
    if (!detail || !current) return null;
    const data = detail.setup_catalog;
    if (current.step_key === "calendar")
      return (
        <div className="wizard-row-editor">
          {rows("events").map((row, index) => (
            <div className="wizard-data-row" key={index}>
              <label>
                Agenda
                <input
                  value={String(row.title || "")}
                  onChange={(e) =>
                    updateRow("events", index, "title", e.target.value)
                  }
                />
              </label>
              <label>
                Jenis
                <select
                  value={String(row.event_type || "SCHOOL_EVENT")}
                  onChange={(e) =>
                    updateRow("events", index, "event_type", e.target.value)
                  }
                >
                  {[
                    ["EFFECTIVE_DAY", "Hari efektif"],
                    ["NATIONAL_HOLIDAY", "Libur nasional"],
                    ["SCHOOL_HOLIDAY", "Libur sekolah/yayasan"],
                    ["MPLS", "MPLS"],
                    ["MIDTERM", "PTS/UTS"],
                    ["FINAL", "PAS/UAS"],
                    ["REPORT", "Pembagian rapor"],
                    ["PROMOTION", "Kenaikan kelas"],
                    ["GRADUATION", "Kelulusan"],
                    ["SCHOOL_EVENT", "Agenda sekolah"],
                    ["ANNOUNCEMENT", "Pengumuman"],
                    ["PARENT_MEETING", "Pertemuan orang tua/wali"],
                    ["TEACHER_MEETING", "Rapat guru/staf"],
                    ["STUDENT_ACTIVITY", "Kegiatan siswa"],
                    ["DEADLINE", "Tenggat"],
                    ["REMINDER", "Pengingat"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mulai
                <input
                  type="date"
                  value={String(row.start_date || "")}
                  onChange={(e) =>
                    updateRow("events", index, "start_date", e.target.value)
                  }
                />
              </label>
              <label>
                Selesai
                <input
                  type="date"
                  value={String(row.end_date || "")}
                  onChange={(e) =>
                    updateRow("events", index, "end_date", e.target.value)
                  }
                />
              </label>
              <button
                className="danger"
                onClick={() => removeRow("events", index)}
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              addRow("events", {
                title: "",
                event_type: "SCHOOL_EVENT",
                start_date: "",
                end_date: "",
              })
            }
          >
            + Tambah agenda kalender
          </button>
        </div>
      );
    if (current.step_key === "structure")
      return (
        <div className="wizard-row-editor">
          {rows("formations").map((row, index) => (
            <div className="wizard-data-row" key={index}>
              <label>
                Nama rombel
                <input
                  value={String(row.name || "")}
                  onChange={(e) =>
                    updateRow("formations", index, "name", e.target.value)
                  }
                />
              </label>
              <label>
                Tingkat
                <select
                  value={String(row.grade_level_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "formations",
                      index,
                      "grade_level_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih tingkat</option>
                  {data.grade_levels.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ruang kelas
                <select
                  value={String(row.classroom_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "formations",
                      index,
                      "classroom_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih ruang</option>
                  {data.classrooms.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)} · {String(item.code)} (
                      {String(item.capacity)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Wali kelas
                <select
                  value={String(row.homeroom_teacher_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "formations",
                      index,
                      "homeroom_teacher_id",
                      e.target.value || null,
                    )
                  }
                >
                  <option value="">Belum ditentukan</option>
                  {data.teachers.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kapasitas rombel
                <input
                  type="number"
                  min="1"
                  value={String(row.capacity || "")}
                  onChange={(e) =>
                    updateRow(
                      "formations",
                      index,
                      "capacity",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </label>
              <button
                className="danger"
                onClick={() => removeRow("formations", index)}
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              addRow("formations", {
                name: "",
                grade_level_id: "",
                classroom_id: "",
                homeroom_teacher_id: null,
                capacity: null,
              })
            }
          >
            + Tambah formasi kelas
          </button>
        </div>
      );
    if (current.step_key === "subjects")
      return (
        <div className="wizard-row-editor">
          {rows("items").map((row, index) => (
            <div className="wizard-data-row" key={index}>
              <label>
                Mata pelajaran
                <select
                  value={String(row.subject_id || "")}
                  onChange={(e) =>
                    updateRow("items", index, "subject_id", e.target.value)
                  }
                >
                  <option value="">Pilih mapel</option>
                  {data.subjects.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tingkat
                <select
                  value={String(row.grade_level_id || "")}
                  onChange={(e) =>
                    updateRow("items", index, "grade_level_id", e.target.value)
                  }
                >
                  <option value="">Pilih tingkat</option>
                  {data.grade_levels.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                JP/minggu
                <input
                  type="number"
                  min="1"
                  value={String(row.weekly_hours || 1)}
                  onChange={(e) =>
                    updateRow(
                      "items",
                      index,
                      "weekly_hours",
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                Durasi JP
                <input
                  type="number"
                  min="1"
                  value={String(row.period_minutes || 40)}
                  onChange={(e) =>
                    updateRow(
                      "items",
                      index,
                      "period_minutes",
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                Jenis
                <select
                  value={String(row.subject_type || "REQUIRED")}
                  onChange={(e) =>
                    updateRow("items", index, "subject_type", e.target.value)
                  }
                >
                  <option value="REQUIRED">Wajib</option>
                  <option value="ELECTIVE">Pilihan</option>
                </select>
              </label>
              <button
                className="danger"
                onClick={() => removeRow("items", index)}
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              addRow("items", {
                subject_id: "",
                grade_level_id: "",
                weekly_hours: 1,
                period_minutes: 40,
                subject_type: "REQUIRED",
              })
            }
          >
            + Tambah mata pelajaran tahunan
          </button>
        </div>
      );
    if (current.step_key === "promotion")
      return (
        <div className="wizard-row-editor">
          {rows("enrollments").map((row, index) => (
            <div className="wizard-data-row" key={index}>
              <label>
                Siswa
                <select
                  value={String(row.student_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "enrollments",
                      index,
                      "student_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih siswa</option>
                  {data.students.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)} · {String(item.nis)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tingkat
                <select
                  value={String(row.grade_level_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "enrollments",
                      index,
                      "grade_level_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih tingkat</option>
                  {data.grade_levels.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Formasi kelas
                <select
                  value={String(row.classroom_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "enrollments",
                      index,
                      "classroom_id",
                      e.target.value || null,
                    )
                  }
                >
                  <option value="">Belum ditempatkan</option>
                  {data.formations.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={String(row.enrollment_status || "ACTIVE")}
                  onChange={(e) =>
                    updateRow(
                      "enrollments",
                      index,
                      "enrollment_status",
                      e.target.value,
                    )
                  }
                >
                  {[
                    ["ACTIVE", "Aktif"],
                    ["NEW", "Siswa baru"],
                    ["RETAINED", "Tinggal kelas"],
                    ["TRANSFERRED", "Pindah sekolah"],
                    ["GRADUATED", "Lulus"],
                    ["WITHDRAWN", "Keluar"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="danger"
                onClick={() => removeRow("enrollments", index)}
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              addRow("enrollments", {
                student_id: "",
                grade_level_id: "",
                classroom_id: null,
                enrollment_status: "ACTIVE",
              })
            }
          >
            + Tambah formasi siswa
          </button>
        </div>
      );
    if (current.step_key === "teacher_assignments")
      return (
        <div className="wizard-row-editor">
          {rows("assignments").map((row, index) => (
            <div className="wizard-data-row" key={index}>
              <label>
                Guru
                <select
                  value={String(row.teacher_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "assignments",
                      index,
                      "teacher_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih guru</option>
                  {data.teachers.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mapel
                <select
                  value={String(row.subject_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "assignments",
                      index,
                      "subject_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih mapel</option>
                  {data.subjects.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Formasi kelas
                <select
                  value={String(row.classroom_id || "")}
                  onChange={(e) =>
                    updateRow(
                      "assignments",
                      index,
                      "classroom_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Pilih kelas</option>
                  {data.formations.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {String(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                JP/minggu
                <input
                  type="number"
                  min="1"
                  value={String(row.weekly_hours || 1)}
                  onChange={(e) =>
                    updateRow(
                      "assignments",
                      index,
                      "weekly_hours",
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <button
                className="danger"
                onClick={() => removeRow("assignments", index)}
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              addRow("assignments", {
                teacher_id: "",
                subject_id: "",
                classroom_id: "",
                weekly_hours: 1,
              })
            }
          >
            + Tambah formasi guru
          </button>
        </div>
      );
    return null;
  }
  return (
    <div className="resource-page academic-setup-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">ADMINISTRASI</span>
          <h1>Setup Tahun Ajaran</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              type="search"
              placeholder="Cari tahun ajaran…"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <span className="muted">{result.total} data</span>
          </div>
          {can(user, "academic_setup.create") && (
            <button
              className="primary"
              onClick={() => {
                setError("");
                setDrawer("create");
              }}
            >
              + Setup Tahun Ajaran
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={!drawer ? error : ""} />
      <section className="card">
        {loading ? (
          <div className="empty">Memuat data…</div>
        ) : result.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tahun ajaran</th>
                  <th>Sekolah</th>
                  <th>Periode</th>
                  <th>Progres</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.school_name}</td>
                    <td>
                      {row.start_date} — {row.end_date}
                    </td>
                    <td>{row.completed_steps}/12 langkah</td>
                    <td>
                      <span
                        className={`setup-status ${row.status.toLowerCase()}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="actions">
                      <button onClick={() => void openWizard(String(row.id))}>
                        Buka
                      </button>
                      {can(user, "academic_setup.delete") &&
                        row.status !== "ACTIVE" && (
                          <button
                            disabled={busy}
                            onClick={() => void remove(row)}
                          >
                            Hapus
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Belum ada setup tahun ajaran." />
        )}
        <div className="pagination">
          <span>
            Halaman {page} dari {Math.max(1, Math.ceil(result.total / 20))}
          </span>
          <div>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ← Sebelumnya
            </button>
            <button
              disabled={page * 20 >= result.total || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Berikutnya →
            </button>
          </div>
        </div>
      </section>

      {drawer && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup"
            disabled={busy}
            onClick={() => setDrawer(null)}
          />
          <aside
            className="school-drawer academic-setup-drawer"
            role="dialog"
            aria-modal="true"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {drawer === "create"
                    ? "SETUP BARU"
                    : `LANGKAH ${selectedStep} DARI 12`}
                </span>
                <h2>
                  {drawer === "create" ? "Setup Tahun Ajaran" : detail?.name}
                </h2>
              </div>
              <button disabled={busy} onClick={() => setDrawer(null)}>
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {drawer === "create" ? (
              <form className="school-editor-form" onSubmit={create}>
                <div className="form-grid">
                  <label>
                    Sekolah *
                    <input
                      readOnly
                      value={String(activeSchool?.name || "")}
                      placeholder="Pilih sekolah melalui kartu sekolah di sidebar"
                    />
                  </label>
                  <label>
                    Nama tahun ajaran
                    <input
                      required
                      placeholder="2026/2027"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Salin dari tahun sebelumnya
                    <select
                      value={form.source_academic_year_id}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          source_academic_year_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Mulai kosong</option>
                      {years.map((year) => (
                        <option key={String(year.id)} value={String(year.id)}>
                          {String(year.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tanggal mulai
                    <input
                      required
                      type="date"
                      value={form.start_date}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          start_date: e.target.value,
                          semester_start_date: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Tanggal selesai
                    <input
                      required
                      type="date"
                      value={form.end_date}
                      onChange={(e) =>
                        setForm({ ...form, end_date: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Semester awal
                    <input
                      required
                      value={form.semester_name}
                      onChange={(e) =>
                        setForm({ ...form, semester_name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Mulai semester
                    <input
                      required
                      type="date"
                      value={form.semester_start_date}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          semester_start_date: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Selesai semester
                    <input
                      required
                      type="date"
                      value={form.semester_end_date}
                      onChange={(e) =>
                        setForm({ ...form, semester_end_date: e.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="notice">
                  Setup ini hanya berlaku untuk sekolah aktif. Untuk menyiapkan
                  sekolah lain, ganti sekolah melalui kartu sekolah di sidebar,
                  lalu buat setup tersendiri.
                </p>
                <div className="school-drawer-actions">
                  <button type="button" onClick={() => setDrawer(null)}>
                    Batal
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Membuat…" : "Buat dan lanjutkan"}
                  </button>
                </div>
              </form>
            ) : (
              detail && (
                <div className="academic-wizard">
                  <div className="wizard-steps">
                    {detail.steps.map((step) => (
                      <button
                        key={step.step_key}
                        className={`${selectedStep === step.step_order ? "active" : ""} ${step.status === "COMPLETE" ? "complete" : ""}`}
                        onClick={() => chooseStep(step)}
                      >
                        <span>
                          {step.status === "COMPLETE" ? "✓" : step.step_order}
                        </span>
                        <div>
                          <strong>{stepMeta[step.step_key].title}</strong>
                          <small>{step.setup_level}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                  <section className="wizard-content">
                    <span className="eyebrow">{current?.setup_level}</span>
                    <h3>{current && stepMeta[current.step_key].title}</h3>
                    <p>{current && stepMeta[current.step_key].hint}</p>
                    {current?.step_key === "identity" ? (
                      <dl className="detail-list">
                        <div>
                          <dt>Sekolah</dt>
                          <dd>{detail.school_name}</dd>
                        </div>
                        <div>
                          <dt>Periode</dt>
                          <dd>
                            {detail.start_date} — {detail.end_date}
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{detail.status}</dd>
                        </div>
                      </dl>
                    ) : current?.step_key === "review" ? (
                      <div className="preflight-list">
                        {detail.checks.map((check) => (
                          <div
                            key={check.key}
                            className={
                              check.passed
                                ? "passed"
                                : check.severity.toLowerCase()
                            }
                          >
                            <span>
                              {check.passed
                                ? "✓"
                                : check.severity === "ERROR"
                                  ? "×"
                                  : "!"}
                            </span>
                            <p>{check.label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {[
                          "calendar",
                          "structure",
                          "promotion",
                          "subjects",
                          "teacher_assignments",
                        ].includes(current?.step_key || "") ? (
                          structuredEditor()
                        ) : (
                          <div className="form-grid wizard-form-grid">
                            {(stepFields[current?.step_key || ""] || []).map(
                              (field) => (
                                <label key={field.key}>
                                  {field.label}
                                  {field.type === "select" ? (
                                    <select
                                      value={String(stepForm[field.key] || "")}
                                      onChange={(event) =>
                                        setStepForm({
                                          ...stepForm,
                                          [field.key]: event.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Pilih…</option>
                                      {field.options?.map((option) => (
                                        <option key={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : field.type === "checkbox" ? (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(stepForm[field.key])}
                                      onChange={(event) =>
                                        setStepForm({
                                          ...stepForm,
                                          [field.key]: event.target.checked,
                                        })
                                      }
                                    />
                                  ) : (
                                    <input
                                      type={field.type || "text"}
                                      min={
                                        field.type === "number" ? 0 : undefined
                                      }
                                      value={String(stepForm[field.key] ?? "")}
                                      onChange={(event) =>
                                        setStepForm({
                                          ...stepForm,
                                          [field.key]:
                                            field.type === "number" &&
                                            event.target.value !== ""
                                              ? Number(event.target.value)
                                              : event.target.value,
                                        })
                                      }
                                    />
                                  )}
                                </label>
                              ),
                            )}
                          </div>
                        )}
                        <label>
                          Catatan
                          <textarea
                            rows={4}
                            placeholder="Catatan keputusan atau tindak lanjut…"
                            value={String(stepForm.notes || "")}
                            onChange={(event) =>
                              setStepForm({
                                ...stepForm,
                                notes: event.target.value,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    <div className="school-drawer-actions">
                      <button
                        disabled={busy || selectedStep === 1}
                        onClick={() =>
                          detail.steps[selectedStep - 2] &&
                          chooseStep(detail.steps[selectedStep - 2])
                        }
                      >
                        ← Sebelumnya
                      </button>
                      {current &&
                        !["identity", "review"].includes(current.step_key) &&
                        can(user, "academic_setup.update") && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => void saveStep(false)}
                            >
                              Simpan draft
                            </button>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => void saveStep(true)}
                            >
                              Tandai selesai & lanjut
                            </button>
                          </>
                        )}
                      {current?.step_key === "identity" && (
                        <button
                          className="primary"
                          onClick={() => chooseStep(detail.steps[1])}
                        >
                          Lanjut →
                        </button>
                      )}
                      {current?.step_key === "review" &&
                        can(user, "academic_setup.update") && (
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !detail.can_activate ||
                              detail.status === "ACTIVE"
                            }
                            onClick={() => void activate()}
                          >
                            {detail.status === "ACTIVE"
                              ? "Sudah aktif"
                              : "Aktifkan Tahun Ajaran"}
                          </button>
                        )}
                    </div>
                  </section>
                </div>
              )
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
