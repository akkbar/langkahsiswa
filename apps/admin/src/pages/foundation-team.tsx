import React, { useEffect, useMemo, useState } from "react";
import type {
  Actor,
  Entity,
  Page,
} from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Catalog, Empty, ErrorBox } from "../components";

type TeamType = "teachers" | "staff";
type Competency = { id?: string; subject_id: string; grade_level_id: string };
type PrivateRecord = {
  employment_status: "PERMANENT" | "CONTRACT" | "HONORARY" | "INTERN";
  hire_date: string | null;
  base_salary: number | null;
  allowance: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  tax_number: string | null;
  national_id: string | null;
  notes: string | null;
};

const employmentLabels: Record<PrivateRecord["employment_status"], string> = {
  PERMANENT: "Tetap",
  CONTRACT: "Kontrak",
  HONORARY: "Honorer",
  INTERN: "Magang",
};
const blankPrivate = (): PrivateRecord => ({
  employment_status: "PERMANENT",
  hire_date: null,
  base_salary: null,
  allowance: null,
  bank_name: null,
  bank_account_number: null,
  tax_number: null,
  national_id: null,
  notes: null,
});
const blankProfile = () => ({
  name: "",
  identifier: "",
  position: "",
  email: "",
  phone: "",
  address: "",
  user_id: "",
});

export function FoundationTeamPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [type, setType] = useState<TeamType>("teachers");
  const [editor, setEditor] = useState<"new" | Entity | null>(null);
  const [profile, setProfile] = useState(blankProfile);
  const [privateRecord, setPrivateRecord] = useState(blankPrivate);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const rows = catalog[type] || [];
  const accounts = catalog.users || [];
  const subjects = catalog.subjects || [];
  const levels = catalog["grade-levels"] || [];
  const canCreate = can(user, "people.create");
  const canEdit = can(user, "people.update");
  const canReadPrivate = can(user, "hr_private.read");
  const canEditPrivate = can(user, "hr_private.update");

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!query) return rows;
    return rows.filter((row) =>
      [
        row.name,
        row.email,
        row.phone,
        row.nip,
        row.employee_number,
        row.position,
      ]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(query),
    );
  }, [rows, search]);
  const visible = filtered.slice(0, visibleLimit);

  useEffect(() => setVisibleLimit(30), [search, type]);
  useEffect(() => {
    setSearch("");
    setEditor(null);
  }, [type]);
  useEffect(() => {
    if (!editor) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeDrawer();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [editor, busy]);

  function closeDrawer() {
    if (busy) return;
    setEditor(null);
    setError("");
  }

  function openNew() {
    setEditor("new");
    setProfile(blankProfile());
    setPrivateRecord(blankPrivate());
    setCompetencies([]);
    setError("");
  }

  async function openEdit(row: Entity) {
    setEditor(row);
    setDetailLoading(true);
    setError("");
    setCompetencies([]);
    setPrivateRecord(blankPrivate());
    try {
      const requests: Promise<unknown>[] = [api(`${type}/${row.id}`)];
      if (type === "teachers")
        requests.push(
          api<Page<Entity>>(
            `teacher-competencies?teacher_id=${row.id}&limit=200`,
          ),
        );
      if (canReadPrivate)
        requests.push(api(`personnel/${type}/${row.id}/private`));
      const results = await Promise.all(requests);
      const detail = results[0] as Entity;
      setProfile({
        name: String(detail.name || ""),
        identifier: String(
          type === "teachers" ? detail.nip || "" : detail.employee_number || "",
        ),
        position: String(detail.position || ""),
        email: String(detail.email || ""),
        phone: String(detail.phone || ""),
        address: String(detail.address || ""),
        user_id: String(detail.user_id || ""),
      });
      let index = 1;
      if (type === "teachers") {
        const result = results[index++] as Page<Entity>;
        setCompetencies(
          result.data.map((item) => ({
            id: item.id,
            subject_id: String(item.subject_id),
            grade_level_id: String(item.grade_level_id),
          })),
        );
      }
      if (canReadPrivate) setPrivateRecord(results[index] as PrivateRecord);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const isNew = editor === "new";
      const payload = {
        name: profile.name.trim(),
        email: profile.email.trim() || null,
        phone: profile.phone.trim() || null,
        address: profile.address.trim() || null,
        user_id: profile.user_id || null,
        ...(type === "teachers"
          ? { nip: profile.identifier.trim() }
          : {
              employee_number: profile.identifier.trim(),
              position: profile.position.trim(),
            }),
      };
      const saved = isNew
        ? await send<Entity>(type, payload)
        : await send<Entity>(`${type}/${editor.id}`, payload, "PATCH");
      const personId = isNew ? saved.id : editor.id;

      if (type === "teachers") {
        const keys = competencies
          .filter((item) => item.subject_id && item.grade_level_id)
          .map((item) => `${item.subject_id}:${item.grade_level_id}`);
        if (new Set(keys).size !== keys.length)
          throw new Error(
            "Kombinasi mata pelajaran dan tingkat tidak boleh ganda",
          );
        const current = (
          await api<Page<Entity>>(
            `teacher-competencies?teacher_id=${personId}&limit=200`,
          )
        ).data;
        const desired = new Set(keys);
        for (const item of current)
          if (!desired.has(`${item.subject_id}:${item.grade_level_id}`))
            await api(`teacher-competencies/${item.id}`, { method: "DELETE" });
        const existing = new Set(
          current.map((item) => `${item.subject_id}:${item.grade_level_id}`),
        );
        for (const item of competencies)
          if (
            item.subject_id &&
            item.grade_level_id &&
            !existing.has(`${item.subject_id}:${item.grade_level_id}`)
          )
            await send("teacher-competencies", {
              teacher_id: personId,
              subject_id: item.subject_id,
              grade_level_id: item.grade_level_id,
            });
      }
      if (canEditPrivate)
        await send(
          `personnel/${type}/${personId}/private`,
          privateRecord,
          "PUT",
        );
      await refresh();
      setEditor(null);
      setMessage(
        `${type === "teachers" ? "Guru" : "Staff"} berhasil disimpan.`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const accountName = (userId: unknown) =>
    accounts.find((account) => account.id === userId)?.email || "Belum di-bind";
  const competencySummary = (teacherId: string) =>
    (catalog["teacher-competencies"] || [])
      .filter((item) => item.teacher_id === teacherId)
      .map((item) => {
        const subject = subjects.find((row) => row.id === item.subject_id);
        const level = levels.find((row) => row.id === item.grade_level_id);
        return `${subject?.name || "Mapel"} · ${level?.name || "Tingkat"}`;
      })
      .join(", ") || "Belum diatur";

  return (
    <div className="resource-page personnel-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">YAYASAN</span>
          <h1>Guru dan Staff</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              type="search"
              aria-label="Cari guru atau staff"
              placeholder="Cari nama, nomor pegawai, atau jabatan…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {canCreate && (
            <button className="primary" onClick={openNew}>
              + Tambah {type === "teachers" ? "guru" : "staff"}
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={editor ? "" : error} />
      {message && <p className="notice success">{message}</p>}
      <div className="tabs personnel-tabs" aria-label="Jenis tenaga kerja">
        <button
          className={type === "teachers" ? "primary" : ""}
          onClick={() => setType("teachers")}
        >
          Guru
        </button>
        <button
          className={type === "staff" ? "primary" : ""}
          onClick={() => setType("staff")}
        >
          Staff
        </button>
      </div>
      <section className="card">
        {!visible.length ? (
          <Empty text={search ? "Data tidak ditemukan." : "Belum ada data."} />
        ) : (
          <div
            className="table-wrap"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (
                element.scrollTop + element.clientHeight >=
                  element.scrollHeight - 80 &&
                visibleLimit < filtered.length
              )
                setVisibleLimit((current) => current + 30);
            }}
          >
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>{type === "teachers" ? "NIP" : "Nomor pegawai"}</th>
                  {type === "staff" && <th>Jabatan</th>}
                  <th>Binding akun</th>
                  {type === "teachers" && <th>Mapel & tingkat</th>}
                  <th>Data rahasia</th>
                  {canEdit && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{String(row.name)}</strong>
                      <br />
                      <span className="muted">{String(row.email || "—")}</span>
                    </td>
                    <td>
                      {String(
                        type === "teachers" ? row.nip : row.employee_number,
                      )}
                    </td>
                    {type === "staff" && <td>{String(row.position)}</td>}
                    <td>{String(accountName(row.user_id))}</td>
                    {type === "teachers" && (
                      <td>{competencySummary(row.id)}</td>
                    )}
                    <td>
                      <span className="badge">
                        {canReadPrivate ? "Akses terbatas" : "Terkunci"}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <button onClick={() => void openEdit(row)}>Edit</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length < filtered.length && (
              <div className="table-lazy-status" role="status">
                Scroll untuk memuat data berikutnya…
              </div>
            )}
          </div>
        )}
      </section>

      {editor && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup editor guru dan staff"
            disabled={busy}
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer personnel-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="personnel-editor-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {type === "teachers" ? "DATA GURU" : "DATA STAFF"}
                </span>
                <h2 id="personnel-editor-title">
                  {editor === "new" ? "Tambah" : "Edit"}{" "}
                  {type === "teachers" ? "guru" : "staff"}
                </h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={closeDrawer}>
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {detailLoading ? (
              <p className="muted">Memuat data personel…</p>
            ) : (
              <form
                className="school-editor-form personnel-form"
                onSubmit={save}
              >
                <fieldset>
                  <legend>Identitas dan binding akun</legend>
                  <div className="form-grid">
                    <label>
                      Nama *
                      <input
                        required
                        autoFocus
                        value={profile.name}
                        onChange={(event) =>
                          setProfile({ ...profile, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {type === "teachers" ? "NIP" : "Nomor pegawai"} *
                      <input
                        required
                        value={profile.identifier}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            identifier: event.target.value,
                          })
                        }
                      />
                    </label>
                    {type === "staff" && (
                      <label>
                        Jabatan *
                        <input
                          required
                          value={profile.position}
                          onChange={(event) =>
                            setProfile({
                              ...profile,
                              position: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Akun pengguna
                      <select
                        value={profile.user_id}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            user_id: event.target.value,
                          })
                        }
                      >
                        <option value="">Belum di-bind</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {String(account.name)} · {String(account.email)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(event) =>
                          setProfile({ ...profile, email: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Telepon
                      <input
                        value={profile.phone}
                        onChange={(event) =>
                          setProfile({ ...profile, phone: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Alamat
                    <textarea
                      rows={2}
                      value={profile.address}
                      onChange={(event) =>
                        setProfile({ ...profile, address: event.target.value })
                      }
                    />
                  </label>
                </fieldset>

                {type === "teachers" && (
                  <fieldset>
                    <legend>Binding mata pelajaran dan tingkat</legend>
                    {competencies.map((item, index) => (
                      <div className="account-competency-row" key={index}>
                        <label>
                          Mata pelajaran
                          <select
                            required
                            value={item.subject_id}
                            onChange={(event) =>
                              setCompetencies((current) =>
                                current.map((row, position) =>
                                  position === index
                                    ? { ...row, subject_id: event.target.value }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="">Pilih mata pelajaran</option>
                            {subjects.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {String(subject.name)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Tingkat
                          <select
                            required
                            value={item.grade_level_id}
                            onChange={(event) =>
                              setCompetencies((current) =>
                                current.map((row, position) =>
                                  position === index
                                    ? {
                                        ...row,
                                        grade_level_id: event.target.value,
                                      }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="">Pilih tingkat</option>
                            {levels.map((level) => (
                              <option key={level.id} value={level.id}>
                                {String(level.name)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="danger"
                          type="button"
                          onClick={() =>
                            setCompetencies((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setCompetencies((current) => [
                          ...current,
                          { subject_id: "", grade_level_id: "" },
                        ])
                      }
                    >
                      + Tambah binding
                    </button>
                  </fieldset>
                )}

                {canReadPrivate ? (
                  <fieldset className="private-personnel-section">
                    <legend>Data rahasia · akses terbatas</legend>
                    <p className="notice private-data-notice">
                      Data kompensasi, rekening, dan identitas hanya dapat
                      dilihat oleh pihak dengan permission HR privat.
                    </p>
                    <div className="form-grid">
                      <label>
                        Status kepegawaian
                        <select
                          disabled={!canEditPrivate}
                          value={privateRecord.employment_status}
                          onChange={(event) =>
                            setPrivateRecord({
                              ...privateRecord,
                              employment_status: event.target
                                .value as PrivateRecord["employment_status"],
                            })
                          }
                        >
                          {Object.entries(employmentLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        Tanggal mulai
                        <input
                          type="date"
                          disabled={!canEditPrivate}
                          value={privateRecord.hire_date || ""}
                          onChange={(event) =>
                            setPrivateRecord({
                              ...privateRecord,
                              hire_date: event.target.value || null,
                            })
                          }
                        />
                      </label>
                      {(["base_salary", "allowance"] as const).map((field) => (
                        <label key={field}>
                          {field === "base_salary" ? "Gaji pokok" : "Tunjangan"}
                          <input
                            type="number"
                            min={0}
                            disabled={!canEditPrivate}
                            value={privateRecord[field] ?? ""}
                            onChange={(event) =>
                              setPrivateRecord({
                                ...privateRecord,
                                [field]: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                          />
                        </label>
                      ))}
                      {(
                        [
                          ["bank_name", "Nama bank"],
                          ["bank_account_number", "Nomor rekening"],
                          ["tax_number", "NPWP"],
                          ["national_id", "NIK"],
                        ] as const
                      ).map(([field, label]) => (
                        <label key={field}>
                          {label}
                          <input
                            disabled={!canEditPrivate}
                            value={privateRecord[field] || ""}
                            onChange={(event) =>
                              setPrivateRecord({
                                ...privateRecord,
                                [field]: event.target.value || null,
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Catatan internal
                      <textarea
                        rows={3}
                        disabled={!canEditPrivate}
                        value={privateRecord.notes || ""}
                        onChange={(event) =>
                          setPrivateRecord({
                            ...privateRecord,
                            notes: event.target.value || null,
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ) : (
                  <p className="notice">
                    Data rahasia memerlukan permission HR privat.
                  </p>
                )}
                <div className="school-drawer-actions">
                  <button type="button" disabled={busy} onClick={closeDrawer}>
                    Batal
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan data"}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
