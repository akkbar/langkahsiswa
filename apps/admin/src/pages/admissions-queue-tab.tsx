import { SortableTable } from "../sortable-table";
import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, downloadFile, send } from "../api";
import { can, type Catalog, Empty, ErrorBox, label } from "../components";
import { dateText } from "./finance";

type Row = Record<string, any>;
const today = new Date().toISOString().slice(0, 10);

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    OPEN: "Dibuka",
    CLOSED: "Ditutup",
    DRAFT: "Draft",
    PENDING: "Menunggu",
    SUBMITTED: "Diajukan",
    DOCUMENT_REVIEW: "Perlu Perbaikan Dokumen",
    TEST: "Tes",
    INTERVIEW: "Wawancara",
    UNDER_REVIEW: "Direview",
    VERIFIED: "Terverifikasi",
    ACCEPTED: "Diterima",
    REJECTED: "Ditolak",
    PAID: "Lunas",
    UNPAID: "Belum Bayar",
    SCHEDULED: "Terjadwal",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
    ACTIVE: "Aktif",
    INACTIVE: "Nonaktif",
    SELECTED: "Terpilih",
    WAITING_LIST: "Daftar Tunggu",
    NOT_SELECTED: "Tidak Terpilih",
  };
  return (
    <span className={`badge status-${String(value).toLowerCase()}`}>
      {labels[value] || value}
    </span>
  );
}

function useAction() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { error, success, busy, run };
}

function Notices({ state }: { state: ReturnType<typeof useAction> }) {
  return (
    <>
      <ErrorBox error={state.error} />
      {state.success && <div className="notice success">{state.success}</div>}
    </>
  );
}

export function AdmissionsQueueTab({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const write = can(user, "admission.write");
  const state = useAction();

  const [periods, setPeriods] = useState<Row[]>([]);
  const [tracks, setTracks] = useState<Row[]>([]);
  const [applications, setApplications] = useState<Row[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "kanban">(
    () =>
      (localStorage.getItem("langkahsiswa:admissions:view") as
        "table" | "kanban") || "table",
  );
  const [visibleLimit, setVisibleLimit] = useState(50);

  // Drawer state
  const [drawerMode, setDrawerMode] = useState<
    "detail" | "review" | "documents" | null
  >(null);
  const [currentApp, setCurrentApp] = useState<Row | null>(null);
  const [currentDocs, setCurrentDocs] = useState<Row[]>([]);
  const [reviewForm, setReviewForm] = useState({ decision: "", notes: "" });
  const reviewStage = (status: string) =>
    status === "TEST"
      ? "TEST"
      : status === "INTERVIEW"
        ? "INTERVIEW"
        : "DOCUMENT";
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerMessage, setDrawerMessage] = useState("");

  const load = async () => {
    const [pRes, tRes, aRes] = await Promise.all([
      api("admission-periods"),
      selectedPeriodId
        ? api(`admission-tracks?period_id=${selectedPeriodId}`)
        : Promise.resolve({ data: [] }),
      api(
        `admissions/applications?limit=100${filterStatus ? `&status=${filterStatus}` : ""}${selectedPeriodId ? `&period_id=${selectedPeriodId}` : ""}${selectedTrackId ? `&track_id=${selectedTrackId}` : ""}`,
      ),
    ]);
    setPeriods(pRes.data);
    setTracks(tRes.data);
    setApplications(aRes.data);
  };

  useEffect(() => {
    void load();
  }, [selectedPeriodId, selectedTrackId, filterStatus]);

  const filteredApps = applications.filter((app) => {
    const q = search.trim().toLocaleLowerCase("id-ID");
    if (!q) return true;
    const hay = [
      app.applicant_name,
      app.applicant_email,
      app.applicant_phone,
      app.registration_number,
      app.track_name,
    ]
      .join(" ")
      .toLocaleLowerCase("id-ID");
    return hay.includes(q);
  });

  const visibleApps = filteredApps.slice(0, visibleLimit);

  const loadMore = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      el.scrollTop + el.clientHeight >= el.scrollHeight - 80 &&
      visibleLimit < filteredApps.length
    ) {
      setVisibleLimit((v) => v + 50);
    }
  };

  const closeDrawer = () => {
    if (drawerBusy) return;
    setDrawerMode(null);
    setCurrentApp(null);
    setCurrentDocs([]);
    setReviewForm({ decision: "", notes: "" });
    setDrawerError("");
    setDrawerMessage("");
  };

  const openDetail = async (app: Row) => {
    setDrawerMode("detail");
    setCurrentApp(app);
    setDrawerError("");
    setDrawerBusy(true);
    try {
      const [detail, docs] = await Promise.all([
        api(`admissions/applications/${app.id}`),
        api(`admissions/applications/${app.id}/documents`),
      ]);
      setCurrentApp(detail);
      setCurrentDocs(docs.data);
    } catch (reason) {
      setDrawerError((reason as Error).message);
    } finally {
      setDrawerBusy(false);
    }
  };

  const openReview = async (app: Row) => {
    setDrawerMode("review");
    setCurrentApp(app);
    setReviewForm({ decision: "", notes: "" });
    setDrawerError("");
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentApp) return;
    setDrawerBusy(true);
    setDrawerError("");
    try {
      await send(`admissions/applications/${currentApp.id}/reviews`, {
        ...reviewForm,
        stage: reviewStage(currentApp.status),
        score: null,
      });
      await load();
      setDrawerMessage("Review disimpan.");
      setTimeout(closeDrawer, 800);
    } catch (reason) {
      setDrawerError((reason as Error).message);
    } finally {
      setDrawerBusy(false);
    }
  };

  const handleEnroll = async () => {
    if (!currentApp || !confirm("Konfirmasi enroll siswa ini?")) return;
    setDrawerBusy(true);
    setDrawerError("");
    try {
      await send(`admissions/applications/${currentApp.id}/enroll`, {});
      await load();
      setDrawerMessage("Siswa berhasil di-enroll.");
      setTimeout(closeDrawer, 800);
    } catch (reason) {
      setDrawerError((reason as Error).message);
    } finally {
      setDrawerBusy(false);
    }
  };

  const setView = (next: "table" | "kanban") => {
    setViewMode(next);
    localStorage.setItem("langkahsiswa:admissions:view", next);
    setVisibleLimit(50);
  };

  const periodOptions = periods.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name} · {p.academic_year} ({p.status})
    </option>
  ));

  const trackOptions = tracks.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name} · Rp{Number(t.cost).toLocaleString("id-ID")}
    </option>
  ));

  const statusOptions = [
    "SUBMITTED",
    "DOCUMENT_REVIEW",
    "TEST",
    "INTERVIEW",
    "ACCEPTED",
    "REJECTED",
    "ENROLLED",
    "WITHDRAWN",
  ].map((s) => (
    <option key={s} value={s}>
      {s}
    </option>
  ));
  const kanbanColumns: Array<{ value: string; field: "status" | "selection_status" }> = [
    { value: "SUBMITTED", field: "status" },
    { value: "DOCUMENT_REVIEW", field: "status" },
    { value: "TEST", field: "status" },
    { value: "INTERVIEW", field: "status" },
    { value: "ACCEPTED", field: "status" },
    { value: "REJECTED", field: "status" },
    { value: "SELECTED", field: "selection_status" },
    { value: "WAITING_LIST", field: "selection_status" },
    { value: "NOT_SELECTED", field: "selection_status" },
  ];

  return (
    <>
      <Notices state={state} />

      {/* Header / Toolbar */}
      <div className="page-title">
        <div>
          <h1>Antrean Pendaftar</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <select
              value={selectedPeriodId}
              onChange={(e) => {
                setSelectedPeriodId(e.target.value);
                setSelectedTrackId("");
                setVisibleLimit(50);
              }}
              aria-label="Filter periode"
            >
              <option value="">Semua periode</option>
              {periodOptions}
            </select>
            <select
              value={selectedTrackId}
              onChange={(e) => {
                setSelectedTrackId(e.target.value);
                setVisibleLimit(50);
              }}
              disabled={!selectedPeriodId}
              aria-label="Filter jalur"
            >
              <option value="">Semua jalur</option>
              {trackOptions}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setVisibleLimit(50);
              }}
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              {statusOptions}
            </select>
            <input
              aria-label="Cari pendaftar"
              placeholder="Cari nama, email, no registrasi…"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleLimit(50);
              }}
            />
          </div>
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            <button
              type="button"
              className={viewMode === "table" ? "active" : ""}
              aria-label="Table"
              title="Tabel"
              aria-pressed={viewMode === "table"}
              onClick={() => setView("table")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="1" />
                <path d="M3 9h18M3 14h18M9 4v16" />
              </svg>
            </button>
            <button
              type="button"
              className={viewMode === "kanban" ? "active" : ""}
              aria-label="Kanban"
              title="Kanban / Pipeline"
              aria-pressed={viewMode === "kanban"}
              onClick={() => setView("kanban")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="18" rx="1" />
                <rect x="17" y="3" width="5" height="18" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <section className="card" aria-label="Antrean pendaftar tabel">
          <div className="table-wrap" onScroll={loadMore}>
            <SortableTable
              rowLimit={visibleLimit}
              onSortChange={() => setVisibleLimit(50)}
            >
              <thead>
                <tr>
                  <th data-sortable="false">#</th>
                  <th>No Registrasi</th>
                  <th>Nama Calon Siswa</th>
                  <th>Jalur</th>
                  <th>Status</th>
                  <th>Pembayaran</th>
                  <th>Wawancara</th>
                  <th>Tgl Daftar</th>
                  <th data-sortable="false">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleApps.map((app, idx) => (
                  <tr key={app.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{app.registration_number}</strong>
                    </td>
                    <td>
                      <div>{app.applicant_name}</div>
                      <div className="small muted">{app.applicant_email}</div>
                    </td>
                    <td>{app.track_name}</td>
                    <td>
                      <Status value={app.status} />
                      {app.selection_status && (
                        <div style={{ marginTop: 4 }}>
                          <Status value={app.selection_status} />
                        </div>
                      )}
                    </td>
                    <td>
                      {app.payment_status ? (
                        <Status value={app.payment_status} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {app.interview_status ? (
                        <Status value={app.interview_status} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{dateText(app.submitted_at)}</td>
                    <td>
                      <div className="actions" style={{ gap: 6 }}>
                        <button onClick={() => void openDetail(app)}>
                          Detail
                        </button>
                        {write &&
                          ["SUBMITTED", "DOCUMENT_REVIEW", "TEST", "INTERVIEW"].includes(
                            app.status,
                          ) && (
                            <button onClick={() => void openReview(app)}>
                              Review
                            </button>
                          )}
                        {write &&
                          app.status === "ACCEPTED" &&
                          app.payment_status === "PAID" && (
                            <button className="primary" onClick={handleEnroll}>
                              Enroll
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
            {visibleApps.length < filteredApps.length && (
              <div className="table-lazy-status" role="status">
                Scroll untuk memuat data berikutnya…
              </div>
            )}
          </div>
        </section>
      ) : (
        <section
          className="kanban-board"
          aria-label="Antrean pendaftar kanban"
          style={{
            display: "flex",
            gap: 16,
            overflowX: "auto",
            paddingBottom: 16,
          }}
        >
          {kanbanColumns.map(({ value: colStatus, field }) => (
            <div
              key={`${field}:${colStatus}`}
              className="kanban-column"
              style={{ minWidth: 280, maxWidth: 320, flex: "1 1 280px" }}
            >
              <div
                className="kanban-header"
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Status value={colStatus} />
                  <span className="small muted">
                    {
                      filteredApps.filter(
                        (a) =>
                          a[field] === colStatus &&
                          (field === "selection_status" || a.selection_status === null),
                      ).length
                    }
                  </span>
                </div>
              </div>
              <div
                className="kanban-items"
                style={{
                  maxHeight: "calc(100vh - 280px)",
                  overflowY: "auto",
                  padding: 12,
                }}
              >
                {filteredApps
                  .filter(
                    (a) =>
                      a[field] === colStatus &&
                      (field === "selection_status" || a.selection_status === null),
                  )
                  .map((app, idx) => (
                    <div
                      key={app.id}
                      className="card kanban-card"
                      style={{ marginBottom: 12, cursor: "pointer" }}
                      onClick={() => void openDetail(app)}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {app.registration_number}
                      </div>
                      <div className="small muted" style={{ marginBottom: 8 }}>
                        {app.applicant_name}
                      </div>
                      <div className="small">{app.track_name}</div>
                      {app.payment_status && (
                        <Status value={app.payment_status} />
                      )}
                    </div>
                  ))}
                {!filteredApps.some(
                  (a) =>
                    a[field] === colStatus &&
                    (field === "selection_status" || a.selection_status === null),
                ) && (
                  <div
                    className="small muted"
                    style={{ textAlign: "center", padding: 24 }}
                  >
                    Kosong
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Right Drawer */}
      {drawerMode && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup drawer"
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {drawerMode === "detail"
                    ? "DETAIL PENDAFTAR"
                    : drawerMode === "review"
                      ? "REVIEW PENDAFTAR"
                      : "DOKUMEN"}
                </span>
                <h2 id="drawer-title">
                  {currentApp?.registration_number || "Memuat…"}
                </h2>
              </div>
              <button aria-label="Tutup" onClick={closeDrawer}>
                ×
              </button>
            </div>

            {drawerBusy && !currentApp ? (
              <p className="muted" style={{ padding: 24 }}>
                Memuat data…
              </p>
            ) : drawerMode === "detail" && currentApp ? (
              <div
                style={{
                  padding: 24,
                  maxHeight: "calc(100vh - 140px)",
                  overflowY: "auto",
                }}
              >
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 16px" }}>Data Calon Siswa</h3>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      gap: "8px 16px",
                    }}
                  >
                    <dt>No Registrasi</dt>
                    <dd>
                      <strong>{currentApp.registration_number}</strong>
                    </dd>
                    <dt>Nama</dt>
                    <dd>{currentApp.applicant_name}</dd>
                    <dt>Email</dt>
                    <dd>{currentApp.applicant_email}</dd>
                    <dt>Telepon</dt>
                    <dd>{currentApp.applicant_phone}</dd>
                    <dt>NISN</dt>
                    <dd>{currentApp.nisn || "—"}</dd>
                    <dt>NIK</dt>
                    <dd>{currentApp.nik || "—"}</dd>
                    <dt>Tempat/Tgl Lahir</dt>
                    <dd>
                      {currentApp.birth_place || "—"} /{" "}
                      {dateText(currentApp.birth_date)}
                    </dd>
                    <dt>Jenis Kelamin</dt>
                    <dd>
                      {currentApp.gender === "M"
                        ? "Laki-laki"
                        : currentApp.gender === "F"
                          ? "Perempuan"
                          : "—"}
                    </dd>
                    <dt>Agama</dt>
                    <dd>{currentApp.religion || "—"}</dd>
                    <dt>Alamat</dt>
                    <dd>{currentApp.address || "—"}</dd>
                  </dl>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 16px" }}>Data Orang Tua / Wali</h3>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      gap: "8px 16px",
                    }}
                  >
                    <dt>Ayah</dt>
                    <dd>
                      {currentApp.father_name || "—"} ·{" "}
                      {currentApp.father_phone || "—"} ·{" "}
                      {currentApp.father_job || "—"}
                    </dd>
                    <dt>Ibu</dt>
                    <dd>
                      {currentApp.mother_name || "—"} ·{" "}
                      {currentApp.mother_phone || "—"} ·{" "}
                      {currentApp.mother_job || "—"}
                    </dd>
                    <dt>Wali</dt>
                    <dd>
                      {currentApp.guardian_name || "—"} ·{" "}
                      {currentApp.guardian_phone || "—"} ·{" "}
                      {currentApp.guardian_relation || "—"}
                    </dd>
                  </dl>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 16px" }}>Pembayaran & Wawancara</h3>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr",
                      gap: "8px 16px",
                    }}
                  >
                    <dt>Status Bayar</dt>
                    <dd>
                      {currentApp.payment_status ? (
                        <Status value={currentApp.payment_status} />
                      ) : (
                        "—"
                      )}
                    </dd>
                    <dt>Total Tagihan</dt>
                    <dd>
                      Rp
                      {Number(currentApp.total_bill || 0).toLocaleString(
                        "id-ID",
                      )}
                    </dd>
                    <dt>Sudah Bayar</dt>
                    <dd>
                      Rp
                      {Number(currentApp.total_paid || 0).toLocaleString(
                        "id-ID",
                      )}
                    </dd>
                    <dt>Status Wawancara</dt>
                    <dd>
                      {currentApp.interview_status ? (
                        <Status value={currentApp.interview_status} />
                      ) : (
                        "—"
                      )}
                    </dd>
                    {currentApp.interview_date && (
                      <>
                        <dt>Jadwal Wawancara</dt>
                        <dd>
                          {dateText(currentApp.interview_date)} ·{" "}
                          {currentApp.interview_start_time || ""}–
                          {currentApp.interview_end_time || ""}
                        </dd>
                        <dt>Lokasi</dt>
                        <dd>{currentApp.interview_location || "—"}</dd>
                      </>
                    )}
                  </dl>
                </div>

                <div>
                  <h3 style={{ margin: "0 0 16px" }}>
                    Dokumen ({currentDocs.length})
                  </h3>
                  {!currentDocs.length ? (
                    <p className="muted small">Belum ada dokumen diunggah.</p>
                  ) : (
                    <table className="table" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th>Nama</th>
                          <th>Tipe</th>
                          <th>Status</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDocs.map((doc: Row) => (
                          <tr key={doc.id}>
                            <td>{doc.field_label || doc.name}</td>
                            <td>{doc.mime_type || "—"}</td>
                            <td>
                              <Status
                                value={doc.verification_status || "PENDING"}
                              />
                            </td>
                            <td>
                              <div className="actions">
                                <button
                                  onClick={() =>
                                    void downloadFile(
                                      `files/${doc.file_id}/download`,
                                      doc.name || "dokumen-ppdb",
                                    )
                                  }
                                >
                                  Unduh
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : drawerMode === "review" && currentApp ? (
              <form onSubmit={handleReview} style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 8px" }}>
                    {currentApp.applicant_name}
                  </h3>
                  <p className="small muted">
                    {currentApp.registration_number} · {currentApp.track_name}
                  </p>
                </div>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}

                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Keputusan
                    <select
                      required
                      value={reviewForm.decision}
                      onChange={(e) =>
                        setReviewForm({
                          ...reviewForm,
                          decision: e.target.value,
                        })
                      }
                    >
                      <option value="">Pilih keputusan</option>
                      <option value="PASSED">Lolos</option>
                      <option value="NEEDS_REVISION">Minta Perbaikan</option>
                      <option value="FAILED">Ditolak</option>
                    </select>
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Catatan Review
                    <textarea
                      value={reviewForm.notes}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, notes: e.target.value })
                      }
                      rows={4}
                      placeholder="Catatan internal untuk tim PPDB…"
                    />
                  </label>
                </div>
                <div className="actions" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={drawerBusy}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={drawerBusy || !reviewForm.decision}
                  >
                    {drawerBusy ? "Menyimpan…" : "Simpan Review"}
                  </button>
                </div>
              </form>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}
