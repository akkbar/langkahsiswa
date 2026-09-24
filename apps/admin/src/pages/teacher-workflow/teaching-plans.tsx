import React, { useEffect, useState } from "react";
import type { Actor, Entity } from "../../../../../packages/shared-types/src";
import { api, send } from "../../api";
import { can, Empty, ErrorBox } from "../../components";
import { SortableTable } from "../../sortable-table";

type PlanItem = {
  id?: string;
  meeting_number: number;
  topic: string;
  learning_objective?: string;
  teacher_notes?: string;
  status?: string;
};

type Plan = {
  id: string;
  academic_year_id: string;
  semester_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  title: string;
  description?: string;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string;
  items?: PlanItem[];
  created_at?: string;
  updated_at?: string;
};

const blankPlan = (): Plan => ({
  id: "",
  academic_year_id: "",
  semester_id: "",
  teacher_id: "",
  class_id: "",
  subject_id: "",
  title: "",
  description: "",
  items: [],
});

export function TeachingPlansPage({ user }: { user: Actor }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await api<Plan[]>("teacher/plans");
        setPlans(result);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save() {
    if (!drawer) return;
    setBusy(true);
    setError("");
    try {
      const url = drawer.id ? `teacher/plans/${drawer.id}` : "teacher/plans";
      const method = drawer.id ? "PATCH" : "POST";
      const result = await send(url, drawer, method);
      setDrawer(null);
      const updated = await api<Plan[]>("teacher/plans");
      setPlans(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: Plan) {
    if (!confirm("Hapus rencana ini?")) return;
    try {
      await api(`teacher/plans/${plan.id}`, { method: "DELETE" });
      setPlans(plans.filter((p) => p.id !== plan.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const update = (field: string, value: unknown) => {
    setDrawer((d) => d ? { ...d, [field]: value } : d);
  };

  return (
    <div className="resource-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GURU</span>
          <h1>Rencana Mengajar</h1>
        </div>
        <div className="page-actions">
          <button className="primary" onClick={() => setDrawer(blankPlan())} disabled={!can(user, "teaching_plan.create")}>+ Tambah Rencana</button>
        </div>
      </div>

      <ErrorBox error={error} />

      {loading ? (
        <Empty text="Memuat data..." />
      ) : plans.length === 0 ? (
        <Empty text="Belum ada rencana belajar. Tambahkan rencana pertama untuk memulai." />
      ) : (
        <SortableTable>
          <thead>
            <tr>
              <th>Judul</th>
              <th>Kelas</th>
              <th>Mata Pelajaran</th>
              <th>Guru</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.title}</td>
                <td>{plan.class_name}</td>
                <td>{plan.subject_name}</td>
                <td>{plan.teacher_name}</td>
                <td>
                  <button onClick={() => setDrawer(plan)}>Detail</button>
                  <button onClick={() => setDrawer(plan)} disabled={!can(user, "teaching_plan.update")}>Edit</button>
                  <button onClick={() => remove(plan)} disabled={!can(user, "teaching_plan.delete")}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      )}

      {drawer && (
        <div className="school-drawer-layer">
          <button className="school-drawer-backdrop" onClick={() => !busy && setDrawer(null)} />
          <aside className="school-drawer">
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">GURU</span>
                <h2>{drawer.id ? "Edit Rencana Mengajar" : "Tambah Rencana Mengajar"}</h2>
              </div>
              <button onClick={() => setDrawer(null)} disabled={busy}>×</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); save(); }}>
              <label>
                Judul *
                <input
                  required
                  disabled={busy}
                  value={drawer.title}
                  onChange={(e) => update("title", e.target.value)}
                />
              </label>
              <label>
                Deskripsi
                <textarea
                  disabled={busy}
                  value={drawer.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
              <div className="drawer-actions">
                <button type="button" onClick={() => setDrawer(null)} disabled={busy}>Batal</button>
                <button type="submit" disabled={busy}>{drawer.id ? "Simpan" : "Tambah"}</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

function allowOperational(user: Actor) {
  if (user.account_level !== "OPERATIONAL")
    throw new Error("Halaman ini hanya untuk akun operational");
}

function allow(user: Actor, permission: string) {
  if (!user.permissions.includes("*") && !user.permissions.includes(permission))
    throw new Error("Hak akses tidak mencukupi");
}