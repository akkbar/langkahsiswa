import React, { useEffect, useState } from "react";
import type { Actor, Entity } from "../../../../packages/shared-types/src";
import { can, ErrorBox, type Catalog } from "../components";
import { api, send } from "../api";
import { ResourcePage } from "./resources";
import "./planning.css";
export function PlanningDrawer({
  title,
  busy,
  error,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup drawer"
        disabled={busy}
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="school-drawer-header">
          <h2>{title}</h2>
          <button disabled={busy} onClick={onClose} aria-label="Tutup">
            ×
          </button>
        </div>
        <div className="stack-form planning-drawer-body">
          <ErrorBox error={error} />
          {children}
        </div>
      </aside>
    </div>
  );
}
export function SubjectsPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<{ minutes: number; weights: any[] }>({
    minutes: 40,
    weights: [],
  });
  const [editor, setEditor] = useState<Entity | "settings" | null>(null);
  const [ready, setReady] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState(40),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const d = await api("lesson-planning/curriculum");
    setData(d);
    return d;
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const open = async (row: Entity | "settings") => {
    setEditor(row);
    setReady(false);
    setError("");
    setBusy(true);
    try {
      const d = await load();
      setReady(true);
      setMinutes(d.minutes);
      setWeights(
        Object.fromEntries(
          d.weights
            .filter((w: any) => row !== "settings" && w.subject_id === row.id)
            .map((w: any) => [w.grade_level_id, w.weekly_weight]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const grades =
    editor && editor !== "settings"
      ? (catalog["grade-levels"] || []).filter(
          (g) => g.school_id === editor.school_id,
        )
      : [];
  return (
    <>
      <ErrorBox error={!editor ? error : ""} />
      <ResourcePage
        resource="subjects"
        user={user}
        catalog={catalog}
        refresh={refresh}
        headerActions={
          can(user, "school.update") && (
            <button onClick={() => void open("settings")}>
              Pengaturan bobot: {data.minutes} menit
            </button>
          )
        }
        extraColumn={{
          title: "Bobot per pekan / tingkat",
          render: (row) => (
            <>
              {data.weights
                .filter((w) => w.subject_id === row.id)
                .map((w) => (
                  <div key={w.grade_level_id}>
                    {
                      catalog["grade-levels"]?.find(
                        (g) => g.id === w.grade_level_id,
                      )?.name
                    }
                    : {w.weekly_weight} bobot · {w.weekly_weight * data.minutes}{" "}
                    menit
                  </div>
                ))}
            </>
          ),
        }}
        rowActions={(row) => (
          <button onClick={() => void open(row)}>Tingkat & bobot</button>
        )}
      />
      {editor && (
        <PlanningDrawer
          title={
            editor === "settings"
              ? "Pengaturan bobot pelajaran"
              : `Tingkat & bobot — ${editor.name}`
          }
          busy={busy}
          error={error}
          onClose={() => setEditor(null)}
        >
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  if (editor === "settings")
                    await send("lesson-planning/settings", { minutes });
                  else
                    await send(`lesson-planning/subjects/${editor.id}`, {
                      weights: grades.map((g) => ({
                        grade_level_id: g.id,
                        weekly_weight: weights[g.id] || 0,
                      })),
                    });
                  await load();
                  setEditor(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {editor === "settings" ? (
              <label>
                Menit untuk 1 bobot
                <input
                  required
                  type="number"
                  min={10}
                  max={120}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
                <small>
                  Durasi baru digunakan saat menyusun ulang jadwal. Jam pada
                  jadwal tersimpan tetap sampai Anda menyimpannya kembali.
                </small>
              </label>
            ) : (
              <>
                <p>
                  1 bobot = {data.minutes} menit. Isi 0 bila pelajaran tidak
                  diberikan pada tingkat tersebut.
                </p>
                {!grades.length && (
                  <p>Belum ada tingkat kelas untuk sekolah ini.</p>
                )}
                {grades.map((g) => (
                  <label key={g.id}>
                    {String(g.name)} — {(weights[g.id] || 0) * data.minutes}{" "}
                    menit/pekan
                    <input
                      disabled={!can(user, "school.update")}
                      type="number"
                      min={0}
                      max={60}
                      required
                      value={weights[g.id] || 0}
                      onChange={(e) =>
                        setWeights({
                          ...weights,
                          [g.id]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </>
            )}
            {can(user, "school.update") && (
              <div className="school-drawer-actions">
                <button className="primary" disabled={busy || !ready}>
                  Simpan
                </button>
              </div>
            )}
          </form>
        </PlanningDrawer>
      )}
    </>
  );
}
