import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, type Catalog, Empty, ErrorBox } from "../components";
import { dateText } from "./finance";
import { SortableTable } from "../sortable-table";

type Row = Record<string, any>;
const today = new Date().toISOString().slice(0, 10);

type SettingsSubTab = "form" | "payment" | "interview" | "templates";

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

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    OPEN: "Dibuka",
    CLOSED: "Ditutup",
    DRAFT: "Draft",
    PENDING: "Menunggu",
    SUBMITTED: "Diajukan",
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
  };
  return (
    <span className={`badge status-${String(value).toLowerCase()}`}>
      {labels[value] || value}
    </span>
  );
}

export function AdmissionsSettingsTab({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const write = can(user, "admission.write");
  if (!write) {
    return <Empty text="Anda tidak memiliki akses untuk mengatur PPDB." />;
  }

  const state = useAction();
  const [periods, setPeriods] = useState<Row[]>([]);
  const [tracks, setTracks] = useState<Row[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("form");
  const [formSections, setFormSections] = useState<Row[]>([]);
  const [formFields, setFormFields] = useState<Row[]>([]);
  const [paymentSchemes, setPaymentSchemes] = useState<Row[]>([]);
  const [interviewSlots, setInterviewSlots] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);

  // Drawer state
  const [drawerMode, setDrawerMode] = useState<
    "section" | "field" | "scheme" | "slot" | "template" | null
  >(null);
  const [editingItem, setEditingItem] = useState<Row | null>(null);
  const [drawerForm, setDrawerForm] = useState<Row>({});
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerMessage, setDrawerMessage] = useState("");

  // Form options
  const fieldTypes = [
    "TEXT",
    "TEXTAREA",
    "EMAIL",
    "PHONE",
    "DATE",
    "SELECT",
    "RADIO",
    "CHECKBOX",
    "FILE_UPLOAD",
    "NUMBER",
    "RICH_TEXT",
  ];
  const dueDateTypes = [
    "IMMEDIATE",
    "ON_ACCEPTANCE",
    "MONTHLY_START",
    "CUSTOM_DATE",
  ];
  const specialKeys = ["nisn", "nik", "kk", "kip", "kks", "pkt"];

  async function loadPeriods() {
    const res = await api("admission-periods");
    setPeriods(res.data);
    if (res.data.length && !selectedPeriodId) {
      setSelectedPeriodId(res.data[0].id);
    }
  }

  async function loadTracks() {
    if (!selectedPeriodId) return;
    const res = await api(`admission-tracks?period_id=${selectedPeriodId}`);
    setTracks(res.data);
    if (res.data.length && !selectedTrackId) {
      setSelectedTrackId(res.data[0].id);
    } else if (!res.data.length) {
      setSelectedTrackId("");
    }
  }

  async function loadFormSections() {
    if (!selectedPeriodId) return;
    const res = await api(
      `admissions/forms/sections?period_id=${selectedPeriodId}`,
    );
    setFormSections(res.data);
  }

  async function loadFormFields(sectionId: string) {
    const res = await api(`admissions/forms/fields?section_id=${sectionId}`);
    setFormFields(res.data);
  }

  async function loadPaymentSchemes() {
    if (!selectedTrackId) {
      setPaymentSchemes([]);
      return;
    }
    const res = await api(
      `admissions/payments/schemes?track_id=${selectedTrackId}`,
    );
    setPaymentSchemes(res.data);
  }

  async function loadInterviewSlots() {
    if (!selectedPeriodId) return;
    const res = await api(
      `admissions/interviews/slots?period_id=${selectedPeriodId}`,
    );
    setInterviewSlots(res.data);
  }

  async function loadTemplates() {
    if (!selectedPeriodId) return;
    const res = await api(`admissions/templates?period_id=${selectedPeriodId}`);
    setTemplates(res.data);
  }

  useEffect(() => {
    void loadPeriods();
  }, []);

  useEffect(() => {
    void loadTracks();
  }, [selectedPeriodId]);

  useEffect(() => {
    void loadFormSections();
    void loadInterviewSlots();
    void loadTemplates();
  }, [selectedPeriodId]);

  useEffect(() => {
    void loadPaymentSchemes();
  }, [selectedTrackId]);

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

  const closeDrawer = () => {
    if (drawerBusy) return;
    setDrawerMode(null);
    setEditingItem(null);
    setDrawerForm({});
    setDrawerError("");
    setDrawerMessage("");
  };

  // Section drawer
  const openSectionDrawer = (section?: Row) => {
    setEditingItem(section || null);
    setDrawerMode("section");
    setDrawerForm(
      section
        ? {
            name: section.name,
            description: section.description || "",
            order_index: section.order_index,
            is_required: section.is_required,
          }
        : { name: "", description: "", order_index: 0, is_required: true },
    );
    setDrawerError("");
  };

  const handleSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void state.run(
      async () => {
        if (editingItem) {
          await send(
            `admissions/forms/sections/${editingItem.id}`,
            drawerForm,
            "PATCH",
          );
        } else {
          await send("admissions/forms/sections", {
            ...drawerForm,
            period_id: selectedPeriodId,
          });
        }
        await loadFormSections();
        closeDrawer();
      },
      editingItem ? "Section diperbarui." : "Section dibuat.",
    );
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm("Hapus section ini?")) return;
    void state.run(async () => {
      await send(`admissions/forms/sections/${id}`, {}, "DELETE");
      await loadFormSections();
    }, "Section dihapus.");
  };

  // Field drawer
  const openFieldDrawer = (section: Row, field?: Row) => {
    setEditingItem(field || null);
    setDrawerMode("field");
    setDrawerForm(
      field
        ? { ...field, options: field.options || [] }
        : {
            section_id: section.id,
            label: "",
            field_key: "",
            field_type: "TEXT",
            options: [],
            placeholder: "",
            help_text: "",
            is_required: false,
            is_special_key: false,
            order_index: 0,
            validation: {},
            conditional_logic: {},
          },
    );
    setDrawerError("");
  };

  const handleFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void state.run(
      async () => {
        if (editingItem) {
          await send(
            `admissions/forms/fields/${editingItem.id}`,
            drawerForm,
            "PATCH",
          );
        } else {
          await send("admissions/forms/fields", drawerForm);
        }
        await loadFormFields(drawerForm.section_id);
        closeDrawer();
      },
      editingItem ? "Field diperbarui." : "Field dibuat.",
    );
  };

  const handleDeleteField = async (id: string, sectionId: string) => {
    if (!confirm("Hapus field ini?")) return;
    void state.run(async () => {
      await send(`admissions/forms/fields/${id}`, {}, "DELETE");
      await loadFormFields(sectionId);
    }, "Field dihapus.");
  };

  // Scheme drawer
  const openSchemeDrawer = (scheme?: Row) => {
    setEditingItem(scheme || null);
    setDrawerMode("scheme");
    setDrawerForm(
      scheme
        ? { ...scheme, due_date: scheme.due_date || "" }
        : {
            track_id: selectedTrackId,
            name: "",
            code: "",
            amount: 0,
            is_required: true,
            due_date_type: "IMMEDIATE",
            due_date: "",
            installment_count: 1,
            installment_interval_months: 1,
            description: "",
            order_index: 0,
          },
    );
    setDrawerError("");
  };

  const handleSchemeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void state.run(
      async () => {
        if (editingItem) {
          await send(
            `admissions/payments/schemes/${editingItem.id}`,
            drawerForm,
            "PATCH",
          );
        } else {
          await send("admissions/payments/schemes", {
            ...drawerForm,
            track_id: selectedTrackId,
          });
        }
        await loadPaymentSchemes();
        closeDrawer();
      },
      editingItem ? "Skema diperbarui." : "Skema dibuat.",
    );
  };

  const handleDeleteScheme = async (id: string) => {
    if (!confirm("Hapus skema ini?")) return;
    void state.run(async () => {
      await send(`admissions/payments/schemes/${id}`, {}, "DELETE");
      await loadPaymentSchemes();
    }, "Skema dihapus.");
  };

  // Slot drawer
  const openSlotDrawer = (slot?: Row) => {
    setEditingItem(slot || null);
    setDrawerMode("slot");
    setDrawerForm(
      slot
        ? {
            ...slot,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
          }
        : {
            period_id: selectedPeriodId,
            track_id: "",
            date: today,
            start_time: "08:00",
            end_time: "12:00",
            quota: 1,
            location: "",
            notes: "",
          },
    );
    setDrawerError("");
  };

  const handleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void state.run(
      async () => {
        if (editingItem) {
          await send(
            `admissions/interviews/slots/${editingItem.id}`,
            drawerForm,
            "PATCH",
          );
        } else {
          await send("admissions/interviews/slots", {
            ...drawerForm,
            period_id: selectedPeriodId,
          });
        }
        await loadInterviewSlots();
        closeDrawer();
      },
      editingItem ? "Slot diperbarui." : "Slot dibuat.",
    );
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm("Hapus slot ini?")) return;
    void state.run(async () => {
      await send(`admissions/interviews/slots/${id}`, {}, "DELETE");
      await loadInterviewSlots();
    }, "Slot dihapus.");
  };

  // Template drawer
  const openTemplateDrawer = (template?: Row) => {
    setEditingItem(template || null);
    setDrawerMode("template");
    setDrawerForm(
      template
        ? { ...template }
        : {
            period_id: selectedPeriodId,
            name: "",
            description: "",
            template_html: "",
            template_type: "CONSENT_FORM",
            is_default: false,
          },
    );
    setDrawerError("");
  };

  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void state.run(
      async () => {
        if (editingItem) {
          await send(
            `admissions/templates/${editingItem.id}`,
            drawerForm,
            "PATCH",
          );
        } else {
          await send("admissions/templates", {
            ...drawerForm,
            period_id: selectedPeriodId,
          });
        }
        await loadTemplates();
        closeDrawer();
      },
      editingItem ? "Template diperbarui." : "Template dibuat.",
    );
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Hapus template ini?")) return;
    void state.run(async () => {
      await send(`admissions/templates/${id}`, {}, "DELETE");
      await loadTemplates();
    }, "Template dihapus.");
  };

  return (
    <>
      <Notices state={state} />

      {/* Header / Toolbar */}
      <div className="page-title">
        <div>
          <h1>Pengaturan PPDB</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              aria-label="Filter periode PPDB"
            >
              <option value="">Pilih periode</option>
              {periodOptions}
            </select>
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              disabled={!selectedPeriodId}
              aria-label="Filter jalur PPDB"
            >
              <option value="">Pilih jalur</option>
              {trackOptions}
            </select>
            {selectedPeriodId && (
              <button
                className="secondary"
                onClick={() => {
                  setSelectedPeriodId("");
                  setSelectedTrackId("");
                }}
              >
                Ganti Periode
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div
        className="view-toggle has-text"
        role="group"
        aria-label="Sub-tab Pengaturan PPDB"
        style={{ marginBottom: 20 }}
      >
        {[
          {
            key: "form",
            label: "Formulir",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            ),
          },
          {
            key: "payment",
            label: "Skema Pembayaran",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            ),
          },
          {
            key: "interview",
            label: "Jadwal Wawancara",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            ),
          },
          {
            key: "templates",
            label: "Template Dokumen",
            icon: (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            ),
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSubTab === tab.key}
            aria-pressed={activeSubTab === tab.key}
            className={activeSubTab === tab.key ? "active" : ""}
            onClick={() => setActiveSubTab(tab.key as SettingsSubTab)}
            title={tab.label}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content panels - each uses SortableTable for lists, right drawer for forms */}

      {/* FORM BUILDER */}
      {activeSubTab === "form" && (
        <section className="card" aria-label="Form Builder PPDB">
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>Section</th>
                  <th>Urutan</th>
                  <th>Wajib</th>
                  <th>Jumlah Field</th>
                  <th data-sortable="false">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {!formSections.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty"
                      style={{ textAlign: "center", padding: 32 }}
                    >
                      Belum ada section. Klik "Tambah Section" untuk memulai.
                    </td>
                  </tr>
                ) : (
                  formSections.map((section, idx) => (
                    <tr key={section.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{section.name}</strong>
                        {section.description && (
                          <div className="small muted">
                            {section.description}
                          </div>
                        )}
                      </td>
                      <td>{section.order_index}</td>
                      <td>{section.is_required ? "Ya" : "Tidak"}</td>
                      <td>
                        {
                          formFields.filter(
                            (f: Row) => f.section_id === section.id,
                          ).length
                        }
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            onClick={() => void openSectionDrawer(section)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDeleteSection(section.id)}
                          >
                            Hapus
                          </button>
                          <button onClick={() => void openFieldDrawer(section)}>
                            + Field
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </SortableTable>
          </div>
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <button onClick={() => void openSectionDrawer()}>
              + Tambah Section
            </button>
          </div>
        </section>
      )}

      {/* PAYMENT SCHEMES */}
      {activeSubTab === "payment" && (
        <section className="card" aria-label="Skema Pembayaran">
          {!selectedTrackId ? (
            <div className="empty" style={{ padding: 32, textAlign: "center" }}>
              <p>
                Pilih jalur PPDB terlebih dahulu untuk mengatur skema
                pembayaran.
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <SortableTable>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Nama</th>
                      <th>Kode</th>
                      <th>Jumlah</th>
                      <th>Jatuh Tempo</th>
                      <th>Wajib</th>
                      <th data-sortable="false">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!paymentSchemes.length ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="empty"
                          style={{ textAlign: "center", padding: 32 }}
                        >
                          Belum ada skema pembayaran.
                        </td>
                      </tr>
                    ) : (
                      paymentSchemes.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{s.name}</td>
                          <td>
                            <code>{s.code}</code>
                          </td>
                          <td>Rp{Number(s.amount).toLocaleString("id-ID")}</td>
                          <td>
                            {s.due_date_type}
                            {s.due_date && ` (${dateText(s.due_date)})`}
                          </td>
                          <td>{s.is_required ? "Ya" : "Tidak"}</td>
                          <td>
                            <div className="actions">
                              <button onClick={() => void openSchemeDrawer(s)}>
                                Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => handleDeleteScheme(s.id)}
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </SortableTable>
              </div>
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <button onClick={() => void openSchemeDrawer()}>
                  + Tambah Skema
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* INTERVIEW SLOTS */}
      {activeSubTab === "interview" && (
        <section className="card" aria-label="Jadwal Wawancara">
          {!selectedPeriodId ? (
            <div className="empty" style={{ padding: 32, textAlign: "center" }}>
              <p>Pilih periode PPDB terlebih dahulu.</p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <SortableTable>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Tanggal</th>
                      <th>Waktu</th>
                      <th>Jalur</th>
                      <th>Kuota</th>
                      <th>Lokasi</th>
                      <th>Status</th>
                      <th data-sortable="false">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!interviewSlots.length ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="empty"
                          style={{ textAlign: "center", padding: 32 }}
                        >
                          Belum ada jadwal wawancara.
                        </td>
                      </tr>
                    ) : (
                      interviewSlots.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{dateText(s.date)}</td>
                          <td>
                            {s.start_time} – {s.end_time}
                          </td>
                          <td>{s.track_name || "Semua jalur"}</td>
                          <td>{s.quota}</td>
                          <td>{s.location || "—"}</td>
                          <td>
                            <Status
                              value={s.is_active ? "ACTIVE" : "INACTIVE"}
                            />
                          </td>
                          <td>
                            <div className="actions">
                              <button onClick={() => void openSlotDrawer(s)}>
                                Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => handleDeleteSlot(s.id)}
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </SortableTable>
              </div>
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <button onClick={() => void openSlotDrawer()}>
                  + Tambah Slot
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* TEMPLATES */}
      {activeSubTab === "templates" && (
        <section className="card" aria-label="Template Dokumen">
          {!selectedPeriodId ? (
            <div className="empty" style={{ padding: 32, textAlign: "center" }}>
              <p>Pilih periode PPDB terlebih dahulu.</p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <SortableTable>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Nama</th>
                      <th>Tipe</th>
                      <th>Default</th>
                      <th data-sortable="false">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!templates.length ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="empty"
                          style={{ textAlign: "center", padding: 32 }}
                        >
                          Belum ada template.
                        </td>
                      </tr>
                    ) : (
                      templates.map((t, i) => (
                        <tr key={t.id}>
                          <td>{i + 1}</td>
                          <td>{t.name}</td>
                          <td>{t.template_type}</td>
                          <td>{t.is_default ? "✓" : ""}</td>
                          <td>
                            <div className="actions">
                              <button
                                onClick={() =>
                                  alert("Preview - implementasi modal HTML")
                                }
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => void openTemplateDrawer(t)}
                              >
                                Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => handleDeleteTemplate(t.id)}
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </SortableTable>
              </div>
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <button onClick={() => void openTemplateDrawer()}>
                  + Buat Template
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* RIGHT DRAWER - shared for all sub-tabs */}
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
                  {drawerMode === "section"
                    ? "SECTION FORMULIR"
                    : drawerMode === "field"
                      ? "FIELD FORMULIR"
                      : drawerMode === "scheme"
                        ? "SKEMA PEMBAYARAN"
                        : drawerMode === "slot"
                          ? "SLOT WAWANCARA"
                          : "TEMPLATE DOKUMEN"}
                </span>
                <h2 id="drawer-title">
                  {editingItem
                    ? `Edit ${drawerForm.name || drawerForm.label || drawerForm.code || ""}`
                    : "Baru"}
                </h2>
              </div>
              <button aria-label="Tutup" onClick={closeDrawer}>
                ×
              </button>
            </div>

            {drawerBusy && !editingItem ? (
              <p className="muted" style={{ padding: 24 }}>
                Memuat…
              </p>
            ) : drawerMode === "section" ? (
              <form onSubmit={handleSectionSubmit} style={{ padding: 24 }}>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}
                <div className="form-grid">
                  <label>
                    Nama Section
                    <input
                      required
                      value={drawerForm.name}
                      onChange={(e) =>
                        setDrawerForm({ ...drawerForm, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Urutan
                    <input
                      type="number"
                      min="0"
                      value={drawerForm.order_index}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          order_index: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={drawerForm.is_required}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          is_required: e.target.checked,
                        })
                      }
                    />
                    Wajib diisi
                  </label>
                </div>
                <label style={{ gridColumn: "1 / -1" }}>
                  Deskripsi
                  <textarea
                    value={drawerForm.description}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        description: e.target.value,
                      })
                    }
                    rows={2}
                  />
                </label>
                <div
                  className="actions"
                  style={{ justifyContent: "flex-end", marginTop: 16 }}
                >
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
                    disabled={drawerBusy}
                  >
                    {drawerBusy
                      ? "Menyimpan…"
                      : editingItem
                        ? "Simpan Perubahan"
                        : "Buat Section"}
                  </button>
                </div>
              </form>
            ) : drawerMode === "field" ? (
              <form onSubmit={handleFieldSubmit} style={{ padding: 24 }}>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}
                <div className="form-grid">
                  <label style={{ gridColumn: "span 2" }}>
                    Section ID
                    <input value={drawerForm.section_id} readOnly />
                  </label>
                  <label>
                    Label
                    <input
                      required
                      value={drawerForm.label}
                      onChange={(e) =>
                        setDrawerForm({ ...drawerForm, label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Field Key
                    <input
                      required
                      value={drawerForm.field_key}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          field_key: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Tipe Field
                    <select
                      value={drawerForm.field_type}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          field_type: e.target.value,
                        })
                      }
                    >
                      {fieldTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Placeholder
                    <input
                      value={drawerForm.placeholder}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          placeholder: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Help Text
                    <input
                      value={drawerForm.help_text}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          help_text: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Urutan
                    <input
                      type="number"
                      min="0"
                      value={drawerForm.order_index}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          order_index: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={drawerForm.is_required}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          is_required: e.target.checked,
                        })
                      }
                    />
                    Wajib diisi
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={drawerForm.is_special_key}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          is_special_key: e.target.checked,
                        })
                      }
                    />
                    Special Key (mapping ke DB)
                  </label>
                </div>

                {["SELECT", "RADIO", "CHECKBOX"].includes(
                  drawerForm.field_type,
                ) && (
                  <FieldOptionsEditor
                    form={drawerForm}
                    setForm={setDrawerForm}
                  />
                )}

                <div
                  className="actions"
                  style={{ justifyContent: "flex-end", marginTop: 16 }}
                >
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
                    disabled={drawerBusy}
                  >
                    {drawerBusy
                      ? "Menyimpan…"
                      : editingItem
                        ? "Simpan Perubahan"
                        : "Buat Field"}
                  </button>
                </div>
              </form>
            ) : drawerMode === "scheme" ? (
              <form onSubmit={handleSchemeSubmit} style={{ padding: 24 }}>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}
                <div className="form-grid">
                  <label>
                    Nama
                    <input
                      required
                      value={drawerForm.name}
                      onChange={(e) =>
                        setDrawerForm({ ...drawerForm, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Kode (uppercase)
                    <input
                      required
                      value={drawerForm.code}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label>
                    Jumlah (IDR)
                    <input
                      type="number"
                      min="0"
                      required
                      value={drawerForm.amount}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Tipe Jatuh Tempo
                    <select
                      value={drawerForm.due_date_type}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          due_date_type: e.target.value,
                        })
                      }
                    >
                      {dueDateTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  {drawerForm.due_date_type === "CUSTOM_DATE" && (
                    <label>
                      Tanggal Jatuh Tempo
                      <input
                        type="date"
                        value={drawerForm.due_date}
                        onChange={(e) =>
                          setDrawerForm({
                            ...drawerForm,
                            due_date: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    Jumlah Cicilan
                    <input
                      type="number"
                      min="1"
                      value={drawerForm.installment_count}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          installment_count: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Interval Bulan
                    <input
                      type="number"
                      min="1"
                      value={drawerForm.installment_interval_months}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          installment_interval_months: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Urutan
                    <input
                      type="number"
                      min="0"
                      value={drawerForm.order_index}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          order_index: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={drawerForm.is_required}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          is_required: e.target.checked,
                        })
                      }
                    />
                    Wajib dibayar
                  </label>
                </div>
                <label style={{ gridColumn: "1 / -1" }}>
                  Deskripsi
                  <textarea
                    value={drawerForm.description}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        description: e.target.value,
                      })
                    }
                    rows={2}
                  />
                </label>
                <div
                  className="actions"
                  style={{ justifyContent: "flex-end", marginTop: 16 }}
                >
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
                    disabled={drawerBusy}
                  >
                    {drawerBusy
                      ? "Menyimpan…"
                      : editingItem
                        ? "Simpan Perubahan"
                        : "Buat Skema"}
                  </button>
                </div>
              </form>
            ) : drawerMode === "slot" ? (
              <form onSubmit={handleSlotSubmit} style={{ padding: 24 }}>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}
                <div className="form-grid">
                  <label>
                    Tanggal
                    <input
                      type="date"
                      required
                      value={drawerForm.date}
                      onChange={(e) =>
                        setDrawerForm({ ...drawerForm, date: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Mulai
                    <input
                      type="time"
                      required
                      value={drawerForm.start_time}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          start_time: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Selesai
                    <input
                      type="time"
                      required
                      value={drawerForm.end_time}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          end_time: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Kuota per Slot
                    <input
                      type="number"
                      min="1"
                      required
                      value={drawerForm.quota}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          quota: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Jalur (opsional)
                    <select
                      value={drawerForm.track_id}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          track_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Semua jalur</option>
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={{ gridColumn: "1 / -1" }}>
                  Lokasi
                  <input
                    value={drawerForm.location}
                    onChange={(e) =>
                      setDrawerForm({ ...drawerForm, location: e.target.value })
                    }
                  />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Catatan
                  <textarea
                    value={drawerForm.notes}
                    onChange={(e) =>
                      setDrawerForm({ ...drawerForm, notes: e.target.value })
                    }
                    rows={2}
                  />
                </label>
                <div
                  className="actions"
                  style={{ justifyContent: "flex-end", marginTop: 16 }}
                >
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
                    disabled={drawerBusy}
                  >
                    {drawerBusy
                      ? "Menyimpan…"
                      : editingItem
                        ? "Simpan Perubahan"
                        : "Buat Slot"}
                  </button>
                </div>
              </form>
            ) : drawerMode === "template" ? (
              <form onSubmit={handleTemplateSubmit} style={{ padding: 24 }}>
                <ErrorBox error={drawerError} />
                {drawerMessage && (
                  <div className="notice success">{drawerMessage}</div>
                )}
                <div className="form-grid">
                  <label>
                    Nama Template
                    <input
                      required
                      value={drawerForm.name}
                      onChange={(e) =>
                        setDrawerForm({ ...drawerForm, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tipe
                    <select
                      value={drawerForm.template_type}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          template_type: e.target.value,
                        })
                      }
                    >
                      <option value="CONSENT_FORM">Formulir Kesanggupan</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={drawerForm.is_default}
                      onChange={(e) =>
                        setDrawerForm({
                          ...drawerForm,
                          is_default: e.target.checked,
                        })
                      }
                    />
                    Jadikan default untuk periode ini
                  </label>
                </div>
                <label style={{ gridColumn: "1 / -1" }}>
                  Deskripsi
                  <textarea
                    value={drawerForm.description}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        description: e.target.value,
                      })
                    }
                    rows={2}
                  />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  <div style={{ marginBottom: 8 }}>
                    Template HTML (placeholder: registration_number,
                    applicant_name, applicant_email, applicant_phone,
                    applicant_address, applicant_birth_date, applicant_gender,
                    guardian_name, guardian_phone, period_name, track_name,
                    track_cost, date_today)
                  </div>
                  <textarea
                    value={drawerForm.template_html}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        template_html: e.target.value,
                      })
                    }
                    rows={15}
                    style={{ fontFamily: "monospace", fontSize: 13 }}
                  />
                </label>
                <div
                  className="actions"
                  style={{ justifyContent: "flex-end", marginTop: 16 }}
                >
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
                    disabled={drawerBusy}
                  >
                    {drawerBusy
                      ? "Menyimpan…"
                      : editingItem
                        ? "Simpan Perubahan"
                        : "Buat Template"}
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

function FieldOptionsEditor({
  form,
  setForm,
}: {
  form: Row;
  setForm: (f: Row) => void;
}) {
  const [optVal, setOptVal] = useState("");
  const [optLab, setOptLab] = useState("");

  const addOpt = () => {
    if (optVal && optLab) {
      setForm({
        ...form,
        options: [...form.options, { value: optVal, label: optLab }],
      });
      setOptVal("");
      setOptLab("");
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px dashed var(--border)",
        borderRadius: 8,
      }}
    >
      <strong>Options (untuk SELECT/RADIO/CHECKBOX)</strong>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <label style={{ flex: 1 }}>
          Value
          <input
            value={optVal}
            onChange={(e) => setOptVal(e.target.value)}
            placeholder="e.g. MALE"
          />
        </label>
        <label style={{ flex: 1 }}>
          Label
          <input
            value={optLab}
            onChange={(e) => setOptLab(e.target.value)}
            placeholder="e.g. Laki-laki"
          />
        </label>
        <label style={{ alignSelf: "flex-end" }}>
          <button type="button" onClick={addOpt}>
            + Tambah
          </button>
        </label>
      </div>
      {form.options.map((opt: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 8,
            marginTop: 4,
            alignItems: "center",
          }}
        >
          <code>{opt.value}</code>
          <span>{opt.label}</span>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                options: form.options.filter(
                  (_: any, idx: number) => idx !== i,
                ),
              })
            }
          >
            Hapus
          </button>
        </div>
      ))}
    </div>
  );
}
