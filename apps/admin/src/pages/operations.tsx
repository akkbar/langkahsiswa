import { SortableTable } from "../sortable-table";
import React, { useContext, useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send, token } from "../api";
import { can, Empty, ErrorBox, type Catalog } from "../components";
import { dateText, money, PageHeading, Status } from "./finance";

type Row = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  rows?: Row[];
  rowLabel?: (row: Row) => string;
  nullable?: boolean;
  nullValue?: boolean;
  required?: boolean;
};
const TableSearchContext = React.createContext("");

function useOperation(load: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(action: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(load);
  }, []);
  const clearMessages = () => {
    setError("");
    setSuccess("");
  };
  return { busy, error, success, run, clearMessages };
}
function Notices({ state }: { state: ReturnType<typeof useOperation> }) {
  return (
    <>
      <ErrorBox error={state.error} />
      {state.success && <div className="notice success">{state.success}</div>}
    </>
  );
}
function SimpleForm({
  title,
  fields,
  submit,
  busy,
  button = "Simpan",
  drawer = false,
  onSaved,
  initialValues,
}: {
  title: string;
  fields: Field[];
  submit: (value: Row) => Promise<boolean | void>;
  busy: boolean;
  button?: string;
  drawer?: boolean;
  onSaved?: () => void;
  initialValues?: Row;
}) {
  const defaults = () =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.nullable ? "" : field.type === "number" ? "0" : "",
      ]),
    );
  const [form, setForm] = useState<Row>(initialValues || defaults());
  return (
    <form
      className={
        drawer ? "stack-form boarding-drawer-form" : "card padded stack-form"
      }
      onSubmit={(event) => {
        event.preventDefault();
        const value = Object.fromEntries(
          fields.map((field) => {
            const raw = form[field.key];
            if (field.nullable && field.nullValue && raw === "")
              return [field.key, null];
            if (field.type === "number") return [field.key, Number(raw)];
            if (field.type === "boolean") return [field.key, raw === "true"];
            if (field.type === "datetime-local")
              return [field.key, new Date(raw).toISOString()];
            return [field.key, raw];
          }),
        );
        void submit(value).then((saved) => {
          if (saved === false) return;
          setForm(defaults());
          onSaved?.();
        });
      }}
    >
      {!drawer && <h2>{title}</h2>}
      <div className="form-grid">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.options || field.rows ? (
              <select
                required={!field.nullable}
                value={form[field.key]}
                onChange={(e) =>
                  setForm({ ...form, [field.key]: e.target.value })
                }
              >
                <option value="">Pilih {field.label.toLowerCase()}</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {field.rows?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {field.rowLabel ? field.rowLabel(row) : row.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={!field.nullable}
                min={field.type === "number" ? 0 : undefined}
                type={field.type || "text"}
                value={form[field.key]}
                onChange={(e) =>
                  setForm({ ...form, [field.key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
      </div>
      {drawer ? (
        <div className="school-drawer-actions">
          <button className="primary" disabled={busy}>
            {busy ? "Menyimpan..." : button}
          </button>
        </div>
      ) : (
        <button disabled={busy}>{button}</button>
      )}
    </form>
  );
}

function BoardingFormDrawer({
  open,
  formIndex,
  busy,
  error,
  onClose,
  children,
}: {
  open: boolean;
  formIndex: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const forms = React.Children.toArray(children) as React.ReactElement<{
    title: string;
    drawer?: boolean;
    onSaved?: () => void;
  }>[];
  const form = forms[formIndex];
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, busy, onClose]);
  if (!open || !form) return null;
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup form Boarding School"
        disabled={busy}
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boarding-drawer-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">BOARDING SCHOOL</span>
            <h2 id="boarding-drawer-title">{form.props.title}</h2>
          </div>
          <button aria-label="Tutup" disabled={busy} onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>
        <ErrorBox error={error} />
        {React.cloneElement(form, {
          key: form.props.title,
          drawer: true,
          onSaved: onClose,
        })}
      </aside>
    </div>
  );
}

function BoardingModuleDrawer({
  module,
  busy,
  error,
  onClose,
  onSave,
}: {
  module: Row | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (enabled: boolean) => Promise<boolean>;
}) {
  const [enabled, setEnabled] = useState(Boolean(module?.enabled));
  useEffect(() => {
    if (!module) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [module, busy, onClose]);
  if (!module) return null;
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup pengaturan modul"
        disabled={busy}
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boarding-module-drawer-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">AKTIVASI MODUL</span>
            <h2 id="boarding-module-drawer-title">{module.module_key}</h2>
          </div>
          <button aria-label="Tutup" disabled={busy} onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>
        <ErrorBox error={error} />
        <form
          className="stack-form boarding-drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(enabled).then((saved) => saved && onClose());
          }}
        >
          <div className="form-grid">
            <label>
              Sekolah
              <input value={module.school_name || "-"} disabled />
            </label>
            <label>
              Status modul
              <select
                value={enabled ? "true" : "false"}
                onChange={(event) => setEnabled(event.target.value === "true")}
              >
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </label>
          </div>
          <div className="school-drawer-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan pengaturan"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

type WorkflowAction = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<boolean>;
};

function BoardingWorkflowDrawer({
  action,
  busy,
  error,
  onClose,
}: {
  action: WorkflowAction | null;
  busy: boolean;
  error: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!action) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [action, busy, onClose]);
  if (!action) return null;
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup konfirmasi aksi"
        disabled={busy}
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boarding-workflow-drawer-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">KONFIRMASI AKSI</span>
            <h2 id="boarding-workflow-drawer-title">{action.title}</h2>
          </div>
          <button aria-label="Tutup" disabled={busy} onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>
        <ErrorBox error={error} />
        <p className="boarding-action-summary">{action.description}</p>
        <div className="school-drawer-actions boarding-confirm-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void action.run().then((done) => done && onClose())}
          >
            {busy ? "Memproses..." : action.confirmLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}
function Table({
  rows,
  columns,
  empty,
  actions,
}: {
  rows: Row[];
  columns: {
    key: string;
    label: string;
    render?: (row: Row) => React.ReactNode;
  }[];
  empty: string;
  actions?: (row: Row) => React.ReactNode;
}) {
  const search = useContext(TableSearchContext).trim().toLocaleLowerCase("id");
  const [visibleCount, setVisibleCount] = useState(25);
  const visibleRows = search
    ? rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("id")
            .includes(search),
        ),
      )
    : rows;
  useEffect(() => setVisibleCount(25), [rows, search]);
  if (!visibleRows.length)
    return <Empty text={search ? "Data tidak ditemukan." : empty} />;
  const renderedRows = visibleRows.slice(0, visibleCount);
  return (
    <div
      className="table-wrap"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        if (
          viewport.scrollTop + viewport.clientHeight >=
          viewport.scrollHeight - 80
        )
          setVisibleCount((current) =>
            Math.min(current + 25, visibleRows.length),
          );
      }}
    >
      <SortableTable
        rowLimit={visibleCount}
        onSortChange={() => setVisibleCount(25)}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            {actions && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} data-sort-value={row[column.key]}>
                  {column.render
                    ? column.render(row)
                    : String(row[column.key] ?? "—")}
                </td>
              ))}
              {actions && (
                <td>
                  <div className="actions">{actions(row)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </SortableTable>
      {renderedRows.length < visibleRows.length && (
        <div className="table-lazy-status" role="status">
          Scroll untuk memuat data berikutnya...
        </div>
      )}
    </div>
  );
}

export function DomainsPage({ user }: { user: Actor }) {
  const [domains, setDomains] = useState<Row[]>([]);
  const [domain, setDomain] = useState("");
  const load = async () => setDomains((await api("domains")).data);
  const state = useOperation(load);
  const write = can(user, "domain.write");
  return (
    <>
      <PageHeading
        eyebrow="WEBSITE SEKOLAH"
        title="Custom Domain"
        description="Hubungkan domain sekolah melalui CNAME atau bukti kepemilikan TXT."
      />
      <Notices state={state} />
      {write && (
        <form
          className="card padded stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void state.run(async () => {
              await send("domains", { domain: domain.trim().toLowerCase() });
              setDomain("");
              await load();
            }, "Domain ditambahkan. Pasang DNS lalu lakukan verifikasi.");
          }}
        >
          <h2>Tambahkan domain</h2>
          <div className="form-grid">
            <label>
              Domain
              <input
                required
                placeholder="www.sekolah.sch.id"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </label>
            <div className="notice success">
              CNAME diarahkan ke <strong>domains.langkahsiswa.id</strong>.
              Alternatif TXT ditampilkan setelah domain disimpan.
            </div>
          </div>
          <button disabled={state.busy}>Tambahkan domain</button>
        </form>
      )}
      <section className="card">
        <div className="toolbar">
          <strong>Domain terdaftar</strong>
          <span className="badge">{domains.length}</span>
        </div>
        <Table
          rows={domains}
          empty="Belum ada custom domain."
          columns={[
            {
              key: "domain",
              label: "Domain",
              render: (row) => (
                <>
                  <strong>{row.domain}</strong>
                  {row.is_primary && <span className="badge green">Utama</span>}
                  <div className="muted small">
                    CNAME: {row.cname_target}
                    <br />
                    TXT: langkahsiswa-verification={row.verification_token}
                  </div>
                </>
              ),
            },
            {
              key: "verification_status",
              label: "DNS",
              render: (row) => <Status value={row.verification_status} />,
            },
            {
              key: "ssl_status",
              label: "SSL",
              render: (row) => <Status value={row.ssl_status} />,
            },
            {
              key: "last_checked_at",
              label: "Pemeriksaan",
              render: (row) => dateText(row.last_checked_at),
            },
          ]}
          actions={
            write
              ? (row) => (
                  <>
                    <button
                      disabled={state.busy}
                      onClick={() =>
                        void state.run(async () => {
                          await send(`domains/${row.id}/verify`, {});
                          await load();
                        }, "DNS terverifikasi. Sertifikat SSL menunggu edge/proxy.")
                      }
                    >
                      Verifikasi DNS
                    </button>
                    {row.verified_at && !row.is_primary && (
                      <button
                        onClick={() =>
                          void state.run(async () => {
                            await send(`domains/${row.id}/primary`, {});
                            await load();
                          }, "Domain utama diperbarui.")
                        }
                      >
                        Jadikan utama
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={() =>
                        void state.run(async () => {
                          await api(`domains/${row.id}`, { method: "DELETE" });
                          await load();
                        }, "Domain dihapus.")
                      }
                    >
                      Hapus
                    </button>
                  </>
                )
              : undefined
          }
        />
      </section>
    </>
  );
}

export function BoardingPage({
  user,
  catalog,
  section,
  title,
}: {
  user: Actor;
  catalog: Catalog;
  section: string;
  title: string;
}) {
  const [data, setData] = useState<Row>({
    dormitories: [],
    rooms: [],
    beds: [],
    assignments: [],
    leaves: [],
    visits: [],
    discipline: [],
    tahfidz: [],
    activities: [],
    laundry: [],
    modules: [],
    tahfidz_targets: [],
    worship_habits: [],
    worship_records: [],
    worship_weekly: [],
    character: [],
    health: [],
    diniyah_subjects: [],
    diniyah_progress: [],
    inspections: [],
  });
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formIndex, setFormIndex] = useState(0);
  const [moduleEditor, setModuleEditor] = useState<Row | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowAction | null>(null);
  const load = async () => setData(await api("boarding/overview"));
  const state = useOperation(load);
  const write = can(user, "boarding.write");
  const mutate = (path: string, message: string) => async (value: Row) =>
    state.run(async () => {
      await send(path, value);
      await load();
    }, message);
  const students = catalog.students || [];
  const parentRows = catalog.parents || [];
  const schools = catalog.schools || [];
  const academicYears = catalog["academic-years"] || [];
  const teachers = catalog.teachers || [];
  const users = catalog.users || [];
  const formTitles: Record<string, string[]> = {
    hunian: [
      "Tambah asrama",
      "Tambah kamar",
      "Tambah tempat tidur",
      "Tempatkan siswa",
      "Inspeksi kamar",
    ],
    perizinan: ["Izin keluar", "Kunjungan wali"],
    pembinaan: [
      "Catatan kedisiplinan",
      "Setoran tahfidz",
      "Target tahfidz/tahsin",
      "Catatan adab dan akhlak",
    ],
    mutabaah: ["Tambah checklist ibadah", "Catat mutabaah"],
    kesehatan: ["Catat kunjungan UKS"],
    diniyah: ["Tambah pelajaran diniyah", "Catat progres bab"],
    kegiatan: ["Aktivitas harian", "Terima laundry"],
    modul: [],
  };
  const activeFormTitles = formTitles[section] || [];
  const closeDrawer = () => setDrawerOpen(false);
  const openDrawer = () => {
    state.clearMessages();
    setDrawerOpen(true);
  };
  const requestAction =
    (path: string, value: Row, success: string): (() => Promise<boolean>) =>
    async () =>
      state.run(async () => {
        await send(path, value);
        await load();
      }, success);
  const openWorkflow = (action: WorkflowAction) => {
    state.clearMessages();
    setWorkflow(action);
  };
  useEffect(() => {
    setSearch("");
    setFormIndex(0);
    setDrawerOpen(false);
    setModuleEditor(null);
    setWorkflow(null);
  }, [section]);
  const studentField: Field = {
    key: "student_id",
    label: "Siswa",
    rows: students,
    rowLabel: (row) => `${row.name} · ${row.nis}`,
  };
  return (
    <>
      <PageHeading
        eyebrow="BOARDING SCHOOL"
        title={title}
        actions={
          <>
            <div className="filter-toolbar">
              <input
                aria-label={`Cari data ${title}`}
                placeholder="Cari data..."
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {write && activeFormTitles.length > 0 && (
              <>
                {activeFormTitles.length > 1 && (
                  <select
                    className="boarding-action-select"
                    aria-label="Jenis data baru"
                    value={formIndex}
                    onChange={(event) =>
                      setFormIndex(Number(event.target.value))
                    }
                  >
                    {activeFormTitles.map((formTitle, index) => (
                      <option value={index} key={formTitle}>
                        {formTitle}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="primary"
                  disabled={state.busy}
                  onClick={openDrawer}
                >
                  + Tambah data
                </button>
              </>
            )}
          </>
        }
      />
      <Notices state={state} />
      <TableSearchContext.Provider value={search}>
        <div className="boarding-page">
          {section === "hunian" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Tambah asrama"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/dormitories",
                      "Asrama ditambahkan.",
                    )}
                    fields={[
                      { key: "name", label: "Nama" },
                      {
                        key: "gender",
                        label: "Penghuni",
                        options: [
                          { value: "MALE", label: "Putra" },
                          { value: "FEMALE", label: "Putri" },
                          { value: "MIXED", label: "Campuran" },
                        ],
                      },
                      {
                        key: "description",
                        label: "Keterangan",
                        nullable: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Tambah kamar"
                    busy={state.busy}
                    submit={mutate("boarding/rooms", "Kamar ditambahkan.")}
                    fields={[
                      {
                        key: "dormitory_id",
                        label: "Asrama",
                        rows: data.dormitories,
                      },
                      { key: "name", label: "Nama kamar" },
                      { key: "floor", label: "Lantai", type: "number" },
                      { key: "capacity", label: "Kapasitas", type: "number" },
                      {
                        key: "supervisor_user_id",
                        label: "Musyrif/pembina",
                        rows: users,
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "cleaning_schedule",
                        label: "Jadwal piket",
                        nullable: true,
                        nullValue: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Tambah tempat tidur"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/beds",
                      "Tempat tidur ditambahkan.",
                    )}
                    fields={[
                      {
                        key: "room_id",
                        label: "Kamar",
                        rows: data.rooms,
                        rowLabel: (row) =>
                          `${row.dormitory_name} · ${row.name}`,
                      },
                      { key: "code", label: "Kode tempat tidur" },
                    ]}
                  />
                  <SimpleForm
                    title="Tempatkan siswa"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/assignments",
                      "Siswa ditempatkan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "bed_id",
                        label: "Tempat tidur",
                        rows: data.beds.filter(
                          (row: Row) => row.status === "AVAILABLE",
                        ),
                        rowLabel: (row) =>
                          `${row.dormitory_name} · ${row.room_name} · ${row.code}`,
                      },
                      { key: "start_date", label: "Mulai", type: "date" },
                    ]}
                  />
                  <SimpleForm
                    title="Inspeksi kamar"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/inspections",
                      "Inspeksi kamar disimpan.",
                    )}
                    fields={[
                      {
                        key: "room_id",
                        label: "Kamar",
                        rows: data.rooms,
                        rowLabel: (row) =>
                          `${row.dormitory_name} · ${row.name}`,
                      },
                      {
                        key: "inspected_at",
                        label: "Waktu inspeksi",
                        type: "datetime-local",
                      },
                      {
                        key: "cleanliness_score",
                        label: "Nilai kebersihan",
                        type: "number",
                      },
                      { key: "facility_condition", label: "Kondisi fasilitas" },
                      { key: "notes", label: "Catatan", nullable: true },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Penempatan siswa</strong>
                </div>
                <Table
                  rows={data.assignments}
                  empty="Belum ada penempatan."
                  columns={[
                    { key: "student_name", label: "Siswa" },
                    { key: "dormitory_name", label: "Asrama" },
                    { key: "room_name", label: "Kamar" },
                    { key: "bed_code", label: "Tempat tidur" },
                    {
                      key: "start_date",
                      label: "Mulai",
                      render: (r) => dateText(r.start_date),
                    },
                    {
                      key: "end_date",
                      label: "Selesai",
                      render: (r) =>
                        r.end_date ? (
                          dateText(r.end_date)
                        ) : (
                          <span className="badge green">Aktif</span>
                        ),
                    },
                  ]}
                  actions={
                    write
                      ? (row) =>
                          !row.end_date && (
                            <button
                              onClick={() =>
                                openWorkflow({
                                  title: "Akhiri penempatan",
                                  description: `Akhiri penempatan aktif ${row.student_name} di ${row.dormitory_name} / ${row.room_name}.`,
                                  confirmLabel: "Akhiri penempatan",
                                  run: requestAction(
                                    `boarding/assignments/${row.id}/end`,
                                    {
                                      end_date: new Date()
                                        .toISOString()
                                        .slice(0, 10),
                                    },
                                    "Penempatan diakhiri.",
                                  ),
                                })
                              }
                            >
                              Akhiri
                            </button>
                          )
                      : undefined
                  }
                />
              </section>
              <section className="card">
                <div className="toolbar">
                  <strong>Riwayat inspeksi kamar</strong>
                </div>
                <Table
                  rows={data.inspections}
                  empty="Belum ada inspeksi kamar."
                  columns={[
                    {
                      key: "inspected_at",
                      label: "Waktu",
                      render: (r) => dateText(r.inspected_at),
                    },
                    { key: "dormitory_name", label: "Asrama" },
                    { key: "room_name", label: "Kamar" },
                    { key: "cleanliness_score", label: "Kebersihan" },
                    { key: "facility_condition", label: "Fasilitas" },
                    { key: "notes", label: "Catatan" },
                  ]}
                />
              </section>
            </>
          )}
          {section === "perizinan" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Izin keluar"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/leaves",
                      "Permohonan izin dibuat.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "leave_type",
                        label: "Jenis izin",
                        options: [
                          { value: "OUTING", label: "Keluar sementara" },
                          { value: "HOME", label: "Pulang" },
                          { value: "SICK", label: "Sakit" },
                        ],
                      },
                      {
                        key: "start_at",
                        label: "Waktu keluar",
                        type: "datetime-local",
                      },
                      {
                        key: "end_at",
                        label: "Rencana kembali",
                        type: "datetime-local",
                      },
                      { key: "reason", label: "Alasan" },
                      {
                        key: "pickup_name",
                        label: "Nama penjemput",
                        nullable: true,
                        nullValue: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Kunjungan wali"
                    busy={state.busy}
                    submit={mutate("boarding/visits", "Kunjungan dicatat.")}
                    fields={[
                      studentField,
                      {
                        key: "parent_id",
                        label: "Data wali",
                        rows: parentRows,
                        nullable: true,
                        nullValue: true,
                      },
                      { key: "visitor_name", label: "Nama pengunjung" },
                      {
                        key: "visit_at",
                        label: "Waktu kunjungan",
                        type: "datetime-local",
                      },
                      { key: "purpose", label: "Keperluan", nullable: true },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Izin siswa</strong>
                </div>
                <Table
                  rows={data.leaves}
                  empty="Belum ada izin."
                  columns={[
                    { key: "student_name", label: "Siswa" },
                    {
                      key: "start_at",
                      label: "Keluar",
                      render: (r) => dateText(r.start_at),
                    },
                    {
                      key: "end_at",
                      label: "Kembali",
                      render: (r) => dateText(r.end_at),
                    },
                    { key: "reason", label: "Alasan" },
                    { key: "leave_type", label: "Jenis" },
                    {
                      key: "presence_status",
                      label: "Posisi",
                      render: (r) => <Status value={r.presence_status} />,
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                  ]}
                  actions={
                    write
                      ? (row) => (
                          <>
                            {row.status === "PENDING" && (
                              <>
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Setujui izin siswa",
                                      description: `Setujui permohonan izin ${row.student_name}.`,
                                      confirmLabel: "Setujui izin",
                                      run: requestAction(
                                        `boarding/leaves/${row.id}/review`,
                                        { decision: "APPROVED", notes: "" },
                                        "Izin disetujui.",
                                      ),
                                    })
                                  }
                                >
                                  Setujui
                                </button>
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Tolak izin siswa",
                                      description: `Tolak permohonan izin ${row.student_name}.`,
                                      confirmLabel: "Tolak izin",
                                      run: requestAction(
                                        `boarding/leaves/${row.id}/review`,
                                        { decision: "REJECTED", notes: "" },
                                        "Izin ditolak.",
                                      ),
                                    })
                                  }
                                >
                                  Tolak
                                </button>
                              </>
                            )}
                            {row.status === "APPROVED" &&
                              !row.actual_out_at && (
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Catat siswa keluar",
                                      description: `Catat ${row.student_name} telah keluar melalui gerbang.`,
                                      confirmLabel: "Catat keluar",
                                      run: requestAction(
                                        "boarding/leaves/gate",
                                        {
                                          gate_token: row.gate_token,
                                          direction: "OUT",
                                        },
                                        "Siswa dicatat keluar.",
                                      ),
                                    })
                                  }
                                >
                                  Catat keluar
                                </button>
                              )}
                            {row.status === "APPROVED" && row.actual_out_at && (
                              <button
                                onClick={() =>
                                  openWorkflow({
                                    title: "Catat siswa kembali",
                                    description: `Catat ${row.student_name} telah kembali melalui gerbang.`,
                                    confirmLabel: "Catat kembali",
                                    run: requestAction(
                                      "boarding/leaves/gate",
                                      {
                                        gate_token: row.gate_token,
                                        direction: "IN",
                                      },
                                      "Kepulangan siswa dicatat.",
                                    ),
                                  })
                                }
                              >
                                Catat kembali
                              </button>
                            )}
                          </>
                        )
                      : undefined
                  }
                />
              </section>
              <section className="card">
                <div className="toolbar">
                  <strong>Kunjungan wali</strong>
                </div>
                <Table
                  rows={data.visits}
                  empty="Belum ada kunjungan."
                  columns={[
                    { key: "student_name", label: "Siswa" },
                    { key: "visitor_name", label: "Pengunjung" },
                    {
                      key: "visit_at",
                      label: "Waktu",
                      render: (r) => dateText(r.visit_at),
                    },
                    { key: "purpose", label: "Keperluan" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                  ]}
                  actions={
                    write
                      ? (row) =>
                          row.status === "SCHEDULED" && (
                            <button
                              onClick={() =>
                                openWorkflow({
                                  title: "Selesaikan kunjungan",
                                  description: `Tandai kunjungan ${row.visitor_name} untuk ${row.student_name} sebagai selesai.`,
                                  confirmLabel: "Selesaikan kunjungan",
                                  run: requestAction(
                                    `boarding/visits/${row.id}/status`,
                                    { status: "COMPLETED" },
                                    "Kunjungan diselesaikan.",
                                  ),
                                })
                              }
                            >
                              Selesai
                            </button>
                          )
                      : undefined
                  }
                />
              </section>
            </>
          )}
          {section === "pembinaan" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Catatan kedisiplinan"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/discipline",
                      "Catatan kedisiplinan disimpan.",
                    )}
                    fields={[
                      studentField,
                      { key: "incident_date", label: "Tanggal", type: "date" },
                      { key: "category", label: "Kategori" },
                      { key: "points", label: "Poin", type: "number" },
                      { key: "description", label: "Kejadian" },
                      {
                        key: "follow_up",
                        label: "Tindak lanjut",
                        nullable: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Setoran tahfidz"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/tahfidz",
                      "Setoran tahfidz disimpan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "record_type",
                        label: "Jenis setoran",
                        options: [
                          { value: "TAHFIDZ", label: "Tahfidz" },
                          { value: "TAHSIN", label: "Tahsin" },
                          { value: "MURAJAAH", label: "Murajaah" },
                        ],
                      },
                      { key: "record_date", label: "Tanggal", type: "date" },
                      { key: "surah", label: "Surah" },
                      { key: "from_verse", label: "Ayat awal", type: "number" },
                      { key: "to_verse", label: "Ayat akhir", type: "number" },
                      {
                        key: "score",
                        label: "Nilai",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "fluency_score",
                        label: "Kelancaran",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "tajwid_score",
                        label: "Tajwid",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "makhraj_score",
                        label: "Makhraj",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "adab_score",
                        label: "Adab",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "memorization_status",
                        label: "Status hafalan",
                        options: [
                          { value: "PROGRESS", label: "Proses" },
                          { value: "FLUENT", label: "Lancar" },
                          { value: "REPEAT", label: "Perlu diulang" },
                        ],
                      },
                      {
                        key: "needs_repeat",
                        label: "Masuk daftar pengulangan",
                        type: "boolean",
                        options: [
                          { value: "false", label: "Tidak" },
                          { value: "true", label: "Ya" },
                        ],
                      },
                      { key: "notes", label: "Catatan", nullable: true },
                    ]}
                  />
                  <SimpleForm
                    title="Target tahfidz/tahsin"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/tahfidz-targets",
                      "Target disimpan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "academic_year_id",
                        label: "Tahun ajaran",
                        rows: academicYears,
                      },
                      {
                        key: "target_type",
                        label: "Jenis target",
                        options: [
                          { value: "TAHFIDZ", label: "Tahfidz" },
                          { value: "TAHSIN", label: "Tahsin" },
                        ],
                      },
                      { key: "target_name", label: "Target" },
                      {
                        key: "target_juz",
                        label: "Jumlah/juz",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      { key: "start_date", label: "Mulai", type: "date" },
                      { key: "end_date", label: "Selesai", type: "date" },
                    ]}
                  />
                  <SimpleForm
                    title="Catatan adab dan akhlak"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/character",
                      "Catatan adab disimpan.",
                    )}
                    fields={[
                      studentField,
                      { key: "record_date", label: "Tanggal", type: "date" },
                      { key: "dimension", label: "Dimensi karakter" },
                      {
                        key: "record_type",
                        label: "Jenis catatan",
                        options: [
                          { value: "POSITIVE", label: "Apresiasi positif" },
                          { value: "DEVELOPMENT", label: "Perlu pembinaan" },
                          { value: "VIOLATION", label: "Pelanggaran" },
                        ],
                      },
                      {
                        key: "severity",
                        label: "Tingkat",
                        options: [
                          { value: "LIGHT", label: "Ringan" },
                          { value: "MEDIUM", label: "Sedang" },
                          { value: "HEAVY", label: "Berat" },
                        ],
                        nullable: true,
                        nullValue: true,
                      },
                      { key: "points", label: "Poin", type: "number" },
                      { key: "notes", label: "Catatan" },
                      {
                        key: "follow_up",
                        label: "Tindak lanjut",
                        nullable: true,
                      },
                      {
                        key: "approval_status",
                        label: "Persetujuan",
                        options: [
                          { value: "NOT_REQUIRED", label: "Tidak diperlukan" },
                          { value: "PENDING", label: "Perlu persetujuan" },
                        ],
                      },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <div className="split-grid">
                <section className="card">
                  <div className="toolbar">
                    <strong>Kedisiplinan</strong>
                  </div>
                  <Table
                    rows={data.discipline}
                    empty="Belum ada catatan."
                    columns={[
                      { key: "student_name", label: "Siswa" },
                      {
                        key: "incident_date",
                        label: "Tanggal",
                        render: (r) => dateText(r.incident_date),
                      },
                      { key: "category", label: "Kategori" },
                      { key: "points", label: "Poin" },
                      { key: "description", label: "Kejadian" },
                    ]}
                  />
                </section>
                <section className="card">
                  <div className="toolbar">
                    <strong>Tahfidz</strong>
                  </div>
                  <Table
                    rows={data.tahfidz}
                    empty="Belum ada setoran."
                    columns={[
                      { key: "student_name", label: "Siswa" },
                      { key: "record_type", label: "Jenis" },
                      {
                        key: "record_date",
                        label: "Tanggal",
                        render: (r) => dateText(r.record_date),
                      },
                      { key: "surah", label: "Surah" },
                      {
                        key: "from_verse",
                        label: "Ayat",
                        render: (r) => `${r.from_verse}–${r.to_verse}`,
                      },
                      { key: "score", label: "Nilai" },
                      {
                        key: "memorization_status",
                        label: "Status",
                        render: (r) => <Status value={r.memorization_status} />,
                      },
                    ]}
                  />
                </section>
              </div>
              <div className="split-grid">
                <section className="card">
                  <div className="toolbar">
                    <strong>Target tahfidz/tahsin</strong>
                  </div>
                  <Table
                    rows={data.tahfidz_targets}
                    empty="Belum ada target."
                    columns={[
                      { key: "student_name", label: "Siswa" },
                      { key: "academic_year_name", label: "Tahun ajaran" },
                      { key: "target_type", label: "Jenis" },
                      { key: "target_name", label: "Target" },
                      {
                        key: "status",
                        label: "Status",
                        render: (r) => <Status value={r.status} />,
                      },
                    ]}
                  />
                </section>
                <section className="card">
                  <div className="toolbar">
                    <strong>Adab dan akhlak</strong>
                  </div>
                  <Table
                    rows={data.character}
                    empty="Belum ada catatan adab."
                    columns={[
                      {
                        key: "record_date",
                        label: "Tanggal",
                        render: (r) => dateText(r.record_date),
                      },
                      { key: "student_name", label: "Siswa" },
                      { key: "dimension", label: "Dimensi" },
                      { key: "record_type", label: "Jenis" },
                      { key: "points", label: "Poin" },
                      {
                        key: "approval_status",
                        label: "Persetujuan",
                        render: (r) => <Status value={r.approval_status} />,
                      },
                    ]}
                    actions={
                      write
                        ? (row) =>
                            row.approval_status === "PENDING" && (
                              <>
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Setujui catatan karakter",
                                      description: `Setujui catatan ${row.dimension} untuk ${row.student_name}.`,
                                      confirmLabel: "Setujui catatan",
                                      run: requestAction(
                                        `boarding/character/${row.id}/review`,
                                        { decision: "APPROVED" },
                                        "Catatan disetujui.",
                                      ),
                                    })
                                  }
                                >
                                  Setujui
                                </button>
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Tolak catatan karakter",
                                      description: `Tolak catatan ${row.dimension} untuk ${row.student_name}.`,
                                      confirmLabel: "Tolak catatan",
                                      run: requestAction(
                                        `boarding/character/${row.id}/review`,
                                        { decision: "REJECTED" },
                                        "Catatan ditolak.",
                                      ),
                                    })
                                  }
                                >
                                  Tolak
                                </button>
                              </>
                            )
                        : undefined
                    }
                  />
                </section>
              </div>
            </>
          )}
          {section === "mutabaah" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Tambah checklist ibadah"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/worship-habits",
                      "Checklist ibadah ditambahkan.",
                    )}
                    fields={[
                      { key: "school_id", label: "Sekolah", rows: schools },
                      { key: "name", label: "Nama kebiasaan" },
                      { key: "category", label: "Kategori" },
                    ]}
                  />
                  <SimpleForm
                    title="Catat mutabaah"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/worship-records",
                      "Mutabaah disimpan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "habit_id",
                        label: "Checklist",
                        rows: data.worship_habits,
                      },
                      { key: "record_date", label: "Tanggal", type: "date" },
                      {
                        key: "status",
                        label: "Status",
                        options: [
                          { value: "DONE", label: "Dikerjakan" },
                          { value: "MISSED", label: "Tidak dikerjakan" },
                          { value: "EXCUSED", label: "Berhalangan" },
                        ],
                      },
                      { key: "notes", label: "Catatan", nullable: true },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Catatan mutabaah harian</strong>
                </div>
                <Table
                  rows={data.worship_records}
                  empty="Belum ada catatan mutabaah."
                  columns={[
                    {
                      key: "record_date",
                      label: "Tanggal",
                      render: (r) => dateText(r.record_date),
                    },
                    { key: "student_name", label: "Siswa" },
                    { key: "habit_name", label: "Ibadah/kebiasaan" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                    { key: "notes", label: "Catatan" },
                  ]}
                />
              </section>
              <section className="card">
                <div className="toolbar">
                  <strong>Rekap mutabaah mingguan</strong>
                </div>
                <Table
                  rows={data.worship_weekly}
                  empty="Belum ada rekap mingguan."
                  columns={[
                    {
                      key: "week_start",
                      label: "Pekan",
                      render: (r) => dateText(r.week_start),
                    },
                    { key: "student_name", label: "Siswa" },
                    { key: "done", label: "Dikerjakan" },
                    { key: "missed", label: "Terlewat" },
                    { key: "excused", label: "Berhalangan" },
                    { key: "total", label: "Total" },
                  ]}
                />
              </section>
            </>
          )}
          {section === "kesehatan" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Catat kunjungan UKS"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/health",
                      "Catatan kesehatan disimpan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "visited_at",
                        label: "Waktu kunjungan",
                        type: "datetime-local",
                      },
                      { key: "complaint", label: "Keluhan" },
                      {
                        key: "diagnosis",
                        label: "Diagnosis",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "treatment",
                        label: "Tindakan",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "medicine",
                        label: "Obat",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "referral",
                        label: "Rujukan",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "allergy_notes",
                        label: "Catatan alergi",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "activity_excuse_until",
                        label: "Dispensasi sampai",
                        type: "date",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "guardian_notified",
                        label: "Notifikasi wali",
                        type: "boolean",
                        options: [
                          { value: "false", label: "Tidak dikirim" },
                          { value: "true", label: "Kirim notifikasi" },
                        ],
                      },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Riwayat kesehatan santri</strong>
                </div>
                <Table
                  rows={data.health}
                  empty="Belum ada catatan kesehatan."
                  columns={[
                    {
                      key: "visited_at",
                      label: "Waktu",
                      render: (r) => dateText(r.visited_at),
                    },
                    { key: "student_name", label: "Siswa" },
                    { key: "complaint", label: "Keluhan" },
                    { key: "diagnosis", label: "Diagnosis" },
                    { key: "medicine", label: "Obat" },
                    { key: "referral", label: "Rujukan" },
                  ]}
                />
              </section>
            </>
          )}
          {section === "diniyah" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Tambah pelajaran diniyah"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/diniyah-subjects",
                      "Pelajaran diniyah ditambahkan.",
                    )}
                    fields={[
                      { key: "school_id", label: "Sekolah", rows: schools },
                      { key: "name", label: "Nama pelajaran" },
                      {
                        key: "book_name",
                        label: "Kitab/buku",
                        nullable: true,
                        nullValue: true,
                      },
                      {
                        key: "teacher_id",
                        label: "Pengajar",
                        rows: teachers,
                        nullable: true,
                        nullValue: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Catat progres bab"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/diniyah-progress",
                      "Progres diniyah disimpan.",
                    )}
                    fields={[
                      studentField,
                      {
                        key: "diniyah_subject_id",
                        label: "Pelajaran",
                        rows: data.diniyah_subjects,
                      },
                      { key: "chapter", label: "Bab/materi" },
                      {
                        key: "status",
                        label: "Status",
                        options: [
                          { value: "NOT_STARTED", label: "Belum mulai" },
                          { value: "IN_PROGRESS", label: "Dalam proses" },
                          { value: "COMPLETED", label: "Selesai" },
                          { value: "REPEAT", label: "Perlu diulang" },
                        ],
                      },
                      {
                        key: "score",
                        label: "Nilai",
                        type: "number",
                        nullable: true,
                        nullValue: true,
                      },
                      { key: "notes", label: "Catatan", nullable: true },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Progres diniyah</strong>
                </div>
                <Table
                  rows={data.diniyah_progress}
                  empty="Belum ada progres diniyah."
                  columns={[
                    { key: "student_name", label: "Siswa" },
                    { key: "subject_name", label: "Pelajaran" },
                    { key: "book_name", label: "Kitab/buku" },
                    { key: "chapter", label: "Bab" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                    { key: "score", label: "Nilai" },
                  ]}
                />
              </section>
            </>
          )}
          {section === "kegiatan" && (
            <>
              {write && (
                <BoardingFormDrawer
                  open={drawerOpen}
                  formIndex={formIndex}
                  busy={state.busy}
                  error={state.error}
                  onClose={closeDrawer}
                >
                  <SimpleForm
                    title="Aktivitas harian"
                    busy={state.busy}
                    submit={mutate(
                      "boarding/activities",
                      "Aktivitas disimpan.",
                    )}
                    fields={[
                      {
                        key: "dormitory_id",
                        label: "Asrama",
                        rows: data.dormitories,
                        nullable: true,
                        nullValue: true,
                      },
                      { key: "activity_date", label: "Tanggal", type: "date" },
                      { key: "name", label: "Kegiatan" },
                      { key: "start_time", label: "Mulai", type: "time" },
                      { key: "end_time", label: "Selesai", type: "time" },
                      {
                        key: "description",
                        label: "Keterangan",
                        nullable: true,
                      },
                    ]}
                  />
                  <SimpleForm
                    title="Terima laundry"
                    busy={state.busy}
                    submit={mutate("boarding/laundry", "Laundry diterima.")}
                    fields={[
                      studentField,
                      { key: "bag_code", label: "Kode tas" },
                      { key: "weight_kg", label: "Berat (kg)", type: "number" },
                      { key: "amount", label: "Biaya (Rp)", type: "number" },
                    ]}
                  />
                </BoardingFormDrawer>
              )}
              <section className="card">
                <div className="toolbar">
                  <strong>Aktivitas</strong>
                </div>
                <Table
                  rows={data.activities}
                  empty="Belum ada aktivitas."
                  columns={[
                    {
                      key: "activity_date",
                      label: "Tanggal",
                      render: (r) => dateText(r.activity_date),
                    },
                    { key: "name", label: "Kegiatan" },
                    { key: "dormitory_name", label: "Asrama" },
                    {
                      key: "start_time",
                      label: "Jam",
                      render: (r) => `${r.start_time}–${r.end_time}`,
                    },
                  ]}
                />
              </section>
              <section className="card">
                <div className="toolbar">
                  <strong>Laundry</strong>
                </div>
                <Table
                  rows={data.laundry}
                  empty="Belum ada laundry."
                  columns={[
                    { key: "bag_code", label: "Kode" },
                    { key: "student_name", label: "Siswa" },
                    {
                      key: "weight_kg",
                      label: "Berat",
                      render: (r) => `${r.weight_kg} kg`,
                    },
                    {
                      key: "amount",
                      label: "Biaya",
                      render: (r) => money(r.amount),
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                  ]}
                  actions={
                    write
                      ? (row) => (
                          <>
                            {!row.wallet_transaction_id &&
                              Number(row.amount) > 0 && (
                                <button
                                  onClick={() =>
                                    openWorkflow({
                                      title: "Bayar laundry dari dompet",
                                      description: `Potong biaya laundry ${row.student_name} sebesar ${money(row.amount)} dari dompet siswa.`,
                                      confirmLabel: "Bayar dari dompet",
                                      run: requestAction(
                                        `boarding/laundry/${row.id}/charge`,
                                        {},
                                        "Biaya dipotong dari wallet.",
                                      ),
                                    })
                                  }
                                >
                                  Bayar wallet
                                </button>
                              )}
                            {row.status === "WASHING" && (
                              <button
                                onClick={() =>
                                  openWorkflow({
                                    title: "Tandai laundry siap",
                                    description: `Tandai laundry ${row.bag_code} milik ${row.student_name} siap diambil.`,
                                    confirmLabel: "Tandai siap",
                                    run: requestAction(
                                      `boarding/laundry/${row.id}/status`,
                                      { status: "READY" },
                                      "Laundry siap diambil.",
                                    ),
                                  })
                                }
                              >
                                Siap
                              </button>
                            )}
                            {row.status === "READY" && (
                              <button
                                onClick={() =>
                                  openWorkflow({
                                    title: "Konfirmasi pengambilan laundry",
                                    description: `Konfirmasi laundry ${row.bag_code} milik ${row.student_name} telah diambil.`,
                                    confirmLabel: "Konfirmasi diambil",
                                    run: requestAction(
                                      `boarding/laundry/${row.id}/status`,
                                      { status: "COLLECTED" },
                                      "Laundry diambil.",
                                    ),
                                  })
                                }
                              >
                                Diambil
                              </button>
                            )}
                          </>
                        )
                      : undefined
                  }
                />
              </section>
            </>
          )}
          {section === "modul" && (
            <section className="card">
              <div className="toolbar">
                <strong>Modul per sekolah</strong>
              </div>
              <Table
                rows={data.modules}
                empty="Belum ada konfigurasi modul sekolah."
                columns={[
                  { key: "school_name", label: "Sekolah" },
                  { key: "module_key", label: "Modul" },
                  {
                    key: "enabled",
                    label: "Status",
                    render: (row) => (
                      <span className={`badge ${row.enabled ? "green" : ""}`}>
                        {row.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                    ),
                  },
                ]}
                actions={
                  write
                    ? (row) => (
                        <button
                          onClick={() => {
                            state.clearMessages();
                            setModuleEditor(row);
                          }}
                        >
                          Atur
                        </button>
                      )
                    : undefined
                }
              />
              <BoardingModuleDrawer
                module={moduleEditor}
                busy={state.busy}
                error={state.error}
                onClose={() => setModuleEditor(null)}
                onSave={(enabled) =>
                  state.run(async () => {
                    if (!moduleEditor) return;
                    await send(`boarding/modules/${moduleEditor.module_key}`, {
                      school_id: moduleEditor.school_id,
                      enabled,
                      config: moduleEditor.config || {},
                    });
                    await load();
                  }, `Modul ${moduleEditor?.module_key} diperbarui.`)
                }
              />
            </section>
          )}
        </div>
      </TableSearchContext.Provider>
      <BoardingWorkflowDrawer
        action={workflow}
        busy={state.busy}
        error={state.error}
        onClose={() => setWorkflow(null)}
      />
    </>
  );
}

export function LibraryPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [data, setData] = useState<Row>({
    books: [],
    copies: [],
    borrowings: [],
    penalties: [],
    shelves: [],
  });
  const [selectedBook, setSelectedBook] = useState<Row | null>(null);
  const [tab, setTab] = useState("sirkulasi");
  const load = async () => setData(await api("library/overview"));
  const state = useOperation(load);
  const write = can(user, "library.write");
  const mutate = (path: string, message: string) => async (value: Row) =>
    state.run(async () => {
      await send(path, value);
      await load();
    }, message);
  const students = catalog.students || [];
  return (
    <>
      <PageHeading
        eyebrow="PERPUSTAKAAN"
        title="Library"
        description="Kelola katalog, eksemplar, sirkulasi, pengembalian, dan denda."
      />
      <Notices state={state} />
      <div className="metric-grid">
        <div className="metric">
          <span className="muted">Judul</span>
          <strong>{data.books.length}</strong>
        </div>
        <div className="metric">
          <span className="muted">Tersedia</span>
          <strong>
            {data.copies.filter((r: Row) => r.status === "AVAILABLE").length}
          </strong>
        </div>
        <div className="metric accent">
          <span className="muted">Dipinjam</span>
          <strong>
            {data.borrowings.filter((r: Row) => !r.returned_at).length}
          </strong>
        </div>
      </div>
      <div className="tabs">
        <button
          className={tab === "sirkulasi" ? "primary" : ""}
          onClick={() => setTab("sirkulasi")}
        >
          Sirkulasi
        </button>
        <button
          className={tab === "catalog" ? "primary" : ""}
          onClick={() => setTab("catalog")}
        >
          Katalog
        </button>
        <button
          className={tab === "ekspemplar" ? "primary" : ""}
          onClick={() => setTab("ekspemplar")}
        >
          Eksemplar
        </button>
        <button
          className={tab === "penalty" ? "primary" : ""}
          onClick={() => setTab("penalty")}
        >
          Denda
        </button>
      </div>
      {tab === "catalog" && (
        <>
          {write && (
            <div className="split-grid">
              <SimpleForm
                title="Tambah buku"
                busy={state.busy}
                submit={mutate("library/books", "Buku ditambahkan.")}
                fields={[
                  { key: "isbn", label: "ISBN", nullable: true },
                  { key: "title", label: "Judul" },
                  { key: "author", label: "Penulis" },
                  { key: "publisher", label: "Penerbit", nullable: true },
                  {
                    key: "publication_year",
                    label: "Tahun",
                    type: "number",
                    nullable: true,
                    nullValue: true,
                  },
                  { key: "category", label: "Kategori", nullable: true },
                ]}
              />
              <SimpleForm
                title="Tambah eksemplar"
                busy={state.busy}
                submit={mutate("library/copies", "Eksemplar ditambahkan.")}
                fields={[
                  {
                    key: "book_id",
                    label: "Buku",
                    rows: data.books,
                    rowLabel: (r) => `${r.title} · ${r.author}`,
                  },
                  { key: "barcode", label: "Barcode" },
                ]}
              />
            </div>
          )}
          <section className="card">
            <div className="toolbar">
              <strong>Katalog</strong>
            </div>
            <Table
              rows={data.books}
              empty="Belum ada buku."
              columns={[
                { key: "title", label: "Judul" },
                { key: "author", label: "Penulis" },
                { key: "isbn", label: "ISBN" },
                { key: "copies", label: "Eksemplar" },
                { key: "available", label: "Tersedia" },
              ]}
              actions={(row) => (
                <button
                  type="button"
                  className="secondary text-xs"
                  onClick={() => setSelectedBook(row)}
                >
                  Detail & Eksemplar ({row.copies || 0})
                </button>
              )}
            />
          </section>
          {selectedBook && (
            <BookDetailDrawer
              book={selectedBook}
              data={data}
              user={user}
              state={state}
              load={load}
              onClose={() => setSelectedBook(null)}
            />
          )}
        </>
      )}
      {tab === "ekspemplar" && (
        <LibraryEksemplarPage
          user={user}
          catalog={catalog}
          data={data}
          state={state}
          load={load}
        />
      )}
      {tab === "sirkulasi" && (
        <>
          {write && (
            <SimpleForm
              title="Pinjamkan buku"
              busy={state.busy}
              button="Catat peminjaman"
              submit={mutate("library/borrowings", "Peminjaman dicatat.")}
              fields={[
                {
                  key: "student_id",
                  label: "Siswa",
                  rows: students,
                  rowLabel: (r) => `${r.name} · ${r.nis}`,
                },
                {
                  key: "copy_id",
                  label: "Eksemplar",
                  rows: data.copies.filter(
                    (r: Row) => r.status === "AVAILABLE",
                  ),
                  rowLabel: (r) => `${r.barcode} · ${r.title}`,
                },
                { key: "due_date", label: "Jatuh tempo", type: "date" },
              ]}
            />
          )}
          <section className="card">
            <div className="toolbar">
              <strong>Riwayat peminjaman</strong>
            </div>
            <Table
              rows={data.borrowings}
              empty="Belum ada peminjaman."
              columns={[
                { key: "title", label: "Buku" },
                { key: "student_name", label: "Siswa" },
                { key: "barcode", label: "Barcode" },
                {
                  key: "due_date",
                  label: "Jatuh tempo",
                  render: (r) => (
                    <span className={r.overdue ? "amount-negative" : ""}>
                      {dateText(r.due_date)}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
              ]}
              actions={
                write
                  ? (row) =>
                      !row.returned_at && (
                        <>
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `library/borrowings/${row.id}/return`,
                                  {
                                    condition: "GOOD",
                                    damage_fee: 0,
                                    lost_fee: 0,
                                  },
                                );
                                await load();
                              }, "Buku dikembalikan.")
                            }
                          >
                            Kembalikan
                          </button>
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `library/borrowings/${row.id}/return`,
                                  {
                                    condition: "LOST",
                                    damage_fee: 0,
                                    lost_fee: 50000,
                                  },
                                );
                                await load();
                              }, "Buku dicatat hilang dan denda dibuat.")
                            }
                          >
                            Hilang
                          </button>
                        </>
                      )
                  : undefined
              }
            />
          </section>
        </>
      )}
      {tab === "penalty" && (
        <section className="card">
          <div className="toolbar">
            <strong>Denda perpustakaan</strong>
          </div>
          <Table
            rows={data.penalties}
            empty="Belum ada denda."
            columns={[
              { key: "student_name", label: "Siswa" },
              { key: "title", label: "Buku" },
              { key: "type", label: "Jenis" },
              {
                key: "amount",
                label: "Jumlah",
                render: (r) => money(r.amount),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
            ]}
            actions={
              write
                ? (row) =>
                    row.status === "UNPAID" && (
                      <>
                        <button
                          onClick={() =>
                            void state.run(async () => {
                              await send(
                                `library/penalties/${row.id}/resolve`,
                                { method: "WALLET" },
                              );
                              await load();
                            }, "Denda dibayar dari wallet.")
                          }
                        >
                          Bayar wallet
                        </button>
                        <button
                          onClick={() =>
                            void state.run(async () => {
                              await send(
                                `library/penalties/${row.id}/resolve`,
                                { method: "WAIVE" },
                              );
                              await load();
                            }, "Denda dibebaskan.")
                          }
                        >
                          Bebaskan
                        </button>
                      </>
                    )
                : undefined
            }
          />
        </section>
      )}
    </>
  );
}

export function CopyStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AVAILABLE: "green",
    BORROWED: "blue",
    RESERVED: "orange",
    MAINTENANCE: "purple",
    LOST: "red",
    DAMAGED: "red",
  };
  const labels: Record<string, string> = {
    AVAILABLE: "Tersedia",
    BORROWED: "Dipinjam",
    RESERVED: "Direservasi",
    MAINTENANCE: "Perbaikan",
    LOST: "Hilang",
    DAMAGED: "Rusak",
  };
  return (
    <span className={`badge ${colors[status] || ""}`}>
      {labels[status] || status}
    </span>
  );
}

export function CopyConditionBadge({ condition }: { condition: string }) {
  const colors: Record<string, string> = {
    GOOD: "green",
    FAIR: "orange",
    DAMAGED: "red",
    LOST: "gray",
  };
  const labels: Record<string, string> = {
    GOOD: "Baik",
    FAIR: "Layak Pakai",
    DAMAGED: "Rusak",
    LOST: "Hilang",
  };
  return (
    <span className={`badge ${colors[condition] || ""}`}>
      {labels[condition] || condition}
    </span>
  );
}

function LibraryEksemplarPage({
  user,
  catalog,
  data,
  state,
  load,
}: {
  user: Actor;
  catalog: Catalog;
  data: Row;
  state: ReturnType<typeof useOperation>;
  load: () => Promise<void>;
}) {
  const write = can(user, "library.write");
  const [editor, setEditor] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    condition: "",
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });

  const filteredCopies = data.copies
    .filter((r: Row) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        return (
          r.barcode?.toLowerCase().includes(s) ||
          r.title?.toLowerCase().includes(s) ||
          r.isbn?.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .filter((r: Row) => !filters.status || r.status === filters.status)
    .filter(
      (r: Row) => !filters.condition || r.condition === filters.condition,
    );

  const openCreate = () => {
    setEditor({
      book_id: "",
      shelf_id: "",
      acquisition_date: new Date().toISOString().split("T")[0],
      condition: "GOOD",
      status: "AVAILABLE",
      barcode: "",
      price: 0,
      notes: "",
    });
  };

  const openEdit = (row: Row) => {
    setEditor({ ...row });
  };

  const openView = (row: Row) => {
    setView(row);
  };

  const handleSave = async (value: Row) => {
    if (editor?.id) {
      await send(`library/copies/${editor.id}`, value, "PATCH");
    } else {
      await send("library/copies", value);
    }
    await load();
    setEditor(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus eksemplar ini?")) return;
    await send(`library/copies/${id}`, {}, "DELETE");
    await load();
  };

  const handleBulkGenerate = async () => {
    const count = prompt("Berapa eksemplar yang ingin dibuat?");
    if (!count) return;
    const bookId = prompt("Book ID untuk eksemplar baru:");
    if (!bookId) return;
    await send("library/book-copies/bulk", {
      book_id: bookId,
      count: parseInt(count),
    });
    await load();
  };

  const handleImport = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    await send("library/book-copies/import", formData);
    await load();
  };

  const handleExport = async () => {
    const res = await fetch(`/api/v1/library/book-copies/export`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eksemplar-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: string) => {
    return <CopyStatusBadge status={status} />;
  };

  const conditionBadge = (condition: string) => {
    return <CopyConditionBadge condition={condition} />;
  };

  return (
    <>
      <PageHeading
        eyebrow="PERPUSTAKAAN / EKSEMPLAR"
        title="Kelola Eksemplar Buku"
        description="CRUD eksemplar, barcode bulk generate, import/export CSV."
      />
      <Notices state={state} />

      <section className="card">
        <div className="toolbar">
          <strong>Daftar Eksemplar</strong>
          <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
            {write && (
              <>
                <button onClick={openCreate}>+ Tambah Eksemplar</button>
                <button onClick={handleBulkGenerate}>
                  Bulk Generate Barcode
                </button>
                <button onClick={handleExport}>Export CSV</button>
              </>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "1rem",
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Cari barcode, judul, ISBN..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            style={{ flex: 1, minWidth: "200px" }}
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Semua Status</option>
            <option value="AVAILABLE">Tersedia</option>
            <option value="BORROWED">Dipinjam</option>
            <option value="RESERVED">Direservasi</option>
            <option value="MAINTENANCE">Perbaikan</option>
            <option value="LOST">Hilang</option>
            <option value="DAMAGED">Rusak</option>
          </select>
          <select
            value={filters.condition}
            onChange={(e) =>
              setFilters({ ...filters, condition: e.target.value })
            }
          >
            <option value="">Semua Kondisi</option>
            <option value="GOOD">Baik</option>
            <option value="FAIR">Layak Pakai</option>
            <option value="DAMAGED">Rusak</option>
            <option value="LOST">Hilang</option>
          </select>
          {write && (
            <>
              <input
                type="file"
                accept=".csv"
                onChange={(e) =>
                  e.target.files?.[0] && handleImport(e.target.files[0])
                }
                style={{ display: "none" }}
                id="import-file"
              />
              <label htmlFor="import-file" style={{ cursor: "pointer" }}>
                <button>Import CSV</button>
              </label>
            </>
          )}
        </div>
        <div className="table-wrap">
          <SortableTable>
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Judul Buku</th>
                <th>ISBN</th>
                <th>Rak</th>
                <th>Tgl Perolehan</th>
                <th>Kondisi</th>
                <th>Status</th>
                <th>Harga</th>
                {write && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filteredCopies.length === 0 ? (
                <tr>
                  <td colSpan={write ? 9 : 8} className="empty">
                    Belum ada eksemplar.
                  </td>
                </tr>
              ) : (
                filteredCopies.map((row: Row) => (
                  <tr key={row.id}>
                    <td>{row.barcode}</td>
                    <td>{row.title}</td>
                    <td>{row.isbn}</td>
                    <td>{row.shelf_code || "—"}</td>
                    <td>{dateText(row.acquisition_date)}</td>
                    <td>{conditionBadge(row.condition)}</td>
                    <td>{statusBadge(row.status)}</td>
                    <td>{money(row.price)}</td>
                    {write && (
                      <td>
                        <button onClick={() => openView(row)}>Lihat</button>
                        <button onClick={() => openEdit(row)}>Edit</button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          style={{ color: "var(--danger)" }}
                        >
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </SortableTable>
        </div>
      </section>

      {editor && (
        <EksemplarDrawer
          editor={editor}
          books={data.books}
          shelves={data.shelves}
          busy={state.busy}
          onClose={() => setEditor(null)}
          onSave={handleSave}
        />
      )}

      {view && (
        <EksemplarViewDrawer copy={view} onClose={() => setView(null)} />
      )}
    </>
  );
}

function EksemplarDrawer({
  editor,
  books,
  shelves,
  busy,
  onClose,
  onSave,
}: {
  editor: Row;
  books: Row[];
  shelves: Row[];
  busy: boolean;
  onClose: () => void;
  onSave: (value: Row) => Promise<void>;
}) {
  const isEdit = !!editor.id;
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, onClose]);
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup form eksemplar"
        disabled={busy}
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eksemplar-drawer-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">PERPUSTAKAAN</span>
            <h2 id="eksemplar-drawer-title">
              {isEdit ? "Edit Eksemplar" : "Tambah Eksemplar"}
            </h2>
          </div>
          <button aria-label="Tutup" disabled={busy} onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>
        <SimpleForm
          title=""
          busy={busy}
          submit={onSave}
          drawer
          fields={[
            {
              key: "book_id",
              label: "Buku",
              rows: books,
              rowLabel: (r) => `${r.title} · ${r.author} (${r.isbn})`,
              required: true,
            },
            {
              key: "shelf_id",
              label: "Rak",
              rows: shelves,
              rowLabel: (r) => `${r.code} · ${r.name}`,
              nullable: true,
            },
            {
              key: "acquisition_date",
              label: "Tanggal Perolehan",
              type: "date",
              required: true,
            },
            {
              key: "condition",
              label: "Kondisi",
              type: "select",
              options: [
                { value: "GOOD", label: "Baik" },
                { value: "FAIR", label: "Layak Pakai" },
                { value: "DAMAGED", label: "Rusak" },
                { value: "LOST", label: "Hilang" },
              ],
              required: true,
            },
            {
              key: "status",
              label: "Status",
              type: "select",
              options: [
                { value: "AVAILABLE", label: "Tersedia" },
                { value: "BORROWED", label: "Dipinjam" },
                { value: "RESERVED", label: "Direservasi" },
                { value: "MAINTENANCE", label: "Perbaikan" },
                { value: "LOST", label: "Hilang" },
                { value: "DAMAGED", label: "Rusak" },
              ],
              required: true,
            },
            { key: "barcode", label: "Barcode", nullable: true },
            { key: "price", label: "Harga", type: "number", nullable: true },
            {
              key: "notes",
              label: "Catatan",
              type: "textarea",
              nullable: true,
            },
          ]}
          initialValues={editor}
        />
      </aside>
    </div>
  );
}

function EksemplarViewDrawer({
  copy,
  onClose,
}: {
  copy: Row;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup detail eksemplar"
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eksemplar-view-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">PERPUSTAKAAN</span>
            <h2 id="eksemplar-view-title">Eksemplar: {copy.barcode}</h2>
          </div>
          <button aria-label="Tutup" onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>
        <div style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
          <div>
            <strong>Barcode:</strong> {copy.barcode}
          </div>
          <div>
            <strong>Buku:</strong> {copy.title} · {copy.author}
          </div>
          <div>
            <strong>ISBN:</strong> {copy.isbn}
          </div>
          <div>
            <strong>Rak:</strong> {copy.shelf_code || "—"}
          </div>
          <div>
            <strong>Tanggal Perolehan:</strong>{" "}
            {dateText(copy.acquisition_date)}
          </div>
          <div>
            <strong>Kondisi:</strong>{" "}
            <CopyConditionBadge condition={copy.condition} />
          </div>
          <div>
            <strong>Status:</strong> <CopyStatusBadge status={copy.status} />
          </div>
          <div>
            <strong>Harga:</strong> {money(copy.price)}
          </div>
          <div>
            <strong>Catatan:</strong> {copy.notes || "—"}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function BookDetailDrawer({
  book,
  data,
  user,
  state,
  load,
  onClose,
}: {
  book: Row;
  data: Row;
  user: Actor;
  state: ReturnType<typeof useOperation>;
  load: () => Promise<void>;
  onClose: () => void;
}) {
  const write = can(user, "library.write");
  const [editor, setEditor] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !editor && !view) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editor, view, onClose]);

  const bookCopies = (data.copies || []).filter(
    (c: Row) => c.book_id === book.id,
  );

  const openCreate = () => {
    setEditor({
      book_id: book.id,
      shelf_id: "",
      acquisition_date: new Date().toISOString().split("T")[0],
      condition: "GOOD",
      status: "AVAILABLE",
      barcode: "",
      price: 0,
      notes: "",
    });
  };

  const openEdit = (row: Row) => {
    setEditor({ ...row });
  };

  const handleSave = async (value: Row) => {
    if (editor?.id) {
      await send(`library/copies/${editor.id}`, value, "PATCH");
    } else {
      await send("library/copies", { ...value, book_id: book.id });
    }
    await load();
    setEditor(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus eksemplar ini?")) return;
    await send(`library/copies/${id}`, {}, "DELETE");
    await load();
  };

  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup detail buku"
        onClick={onClose}
      />
      <aside
        className="school-drawer wide-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-detail-title"
        style={{ maxWidth: "800px", width: "100%" }}
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">DETAIL BUKU & EKSEMPLAR</span>
            <h2 id="book-detail-title">{book.title}</h2>
          </div>
          <button aria-label="Tutup" onClick={onClose}>
            {"\u00d7"}
          </button>
        </div>

        <div style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
          <div
            className="card"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              padding: "1rem",
              background: "var(--bg-subtle, #f9fafb)",
            }}
          >
            <div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Penulis
              </span>
              <div>
                <strong>{book.author || "—"}</strong>
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                ISBN
              </span>
              <div>
                <strong>{book.isbn || "—"}</strong>
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Penerbit
              </span>
              <div>
                <strong>{book.publisher || "—"}</strong>
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Tahun Terbit
              </span>
              <div>
                <strong>{book.publication_year || "—"}</strong>
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Kategori
              </span>
              <div>
                <strong>{book.category || "—"}</strong>
              </div>
            </div>
          </div>

          <div
            className="metric-grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            <div className="metric">
              <span className="muted">Total Eksemplar</span>
              <strong>{bookCopies.length}</strong>
            </div>
            <div className="metric">
              <span className="muted">Tersedia</span>
              <strong>
                {bookCopies.filter((c: Row) => c.status === "AVAILABLE").length}
              </strong>
            </div>
            <div className="metric accent">
              <span className="muted">Dipinjam</span>
              <strong>
                {bookCopies.filter((c: Row) => c.status === "BORROWED").length}
              </strong>
            </div>
          </div>

          <section className="card" style={{ marginTop: "0.5rem" }}>
            <div className="toolbar">
              <strong>Daftar Eksemplar</strong>
              {write && (
                <button
                  type="button"
                  className="primary"
                  onClick={openCreate}
                  style={{ marginLeft: "auto" }}
                >
                  + Tambah Eksemplar
                </button>
              )}
            </div>
            <div className="table-wrap">
              <SortableTable>
                <thead>
                  <tr>
                    <th>Barcode</th>
                    <th>Rak</th>
                    <th>Tgl Perolehan</th>
                    <th>Kondisi</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {bookCopies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        Belum ada eksemplar untuk buku ini.
                      </td>
                    </tr>
                  ) : (
                    bookCopies.map((row: Row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.barcode}</strong>
                        </td>
                        <td>{row.shelf_code || "—"}</td>
                        <td>{dateText(row.acquisition_date)}</td>
                        <td>
                          <CopyConditionBadge condition={row.condition} />
                        </td>
                        <td>
                          <CopyStatusBadge status={row.status} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary text-xs"
                            onClick={() => setView(row)}
                          >
                            Lihat
                          </button>
                          {write && (
                            <>
                              <button
                                type="button"
                                className="secondary text-xs"
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="secondary text-xs"
                                onClick={() => handleDelete(row.id)}
                                style={{ color: "var(--danger, #dc2626)" }}
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </SortableTable>
            </div>
          </section>
        </div>
      </aside>

      {editor && (
        <EksemplarDrawer
          editor={editor}
          books={data.books}
          shelves={data.shelves}
          busy={state.busy}
          onClose={() => setEditor(null)}
          onSave={handleSave}
        />
      )}

      {view && (
        <EksemplarViewDrawer copy={view} onClose={() => setView(null)} />
      )}
    </div>
  );
}

export function SecurityPage({ user }: { user: Actor }) {
  const [tab, setTab] = useState("audit");
  const [audit, setAudit] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [sessions, setSessions] = useState<Row[]>([]);
  const load = async () => {
    const [a, h, s] = await Promise.all([
      api("security/audit-logs?limit=100"),
      api("security/login-history"),
      api("security/sessions"),
    ]);
    setAudit(a.data);
    setHistory(h.data);
    setSessions(s.data);
  };
  const state = useOperation(load);
  return (
    <>
      <PageHeading
        eyebrow="AUDIT & SECURITY"
        title="Keamanan Platform"
        description="Tinjau aktivitas immutable, riwayat login, dan sesi perangkat aktif."
      />
      <Notices state={state} />
      <div className="tabs">
        <button
          className={tab === "audit" ? "primary" : ""}
          onClick={() => setTab("audit")}
        >
          Audit log
        </button>
        <button
          className={tab === "login" ? "primary" : ""}
          onClick={() => setTab("login")}
        >
          Riwayat login
        </button>
        <button
          className={tab === "session" ? "primary" : ""}
          onClick={() => setTab("session")}
        >
          Sesi saya
        </button>
      </div>
      {tab === "audit" && (
        <section className="card">
          <Table
            rows={audit}
            empty="Belum ada aktivitas."
            columns={[
              {
                key: "created_at",
                label: "Waktu",
                render: (r) => new Date(r.created_at).toLocaleString("id-ID"),
              },
              { key: "user_name", label: "Pengguna" },
              { key: "action", label: "Aksi" },
              { key: "path", label: "Endpoint" },
              {
                key: "entity_id",
                label: "Entitas",
                render: (r) => r.entity_id || "—",
              },
            ]}
          />
        </section>
      )}
      {tab === "login" && (
        <section className="card">
          <Table
            rows={history}
            empty="Belum ada login."
            columns={[
              {
                key: "created_at",
                label: "Waktu",
                render: (r) => new Date(r.created_at).toLocaleString("id-ID"),
              },
              { key: "email", label: "Akun" },
              { key: "provider", label: "Provider" },
              {
                key: "success",
                label: "Hasil",
                render: (r) => (
                  <span
                    className={`badge ${r.success ? "green" : "status-failed"}`}
                  >
                    {r.success ? "Berhasil" : "Gagal"}
                  </span>
                ),
              },
              { key: "ip_address", label: "IP" },
            ]}
          />
        </section>
      )}
      {tab === "session" && (
        <section className="card">
          <Table
            rows={sessions}
            empty="Belum ada sesi."
            columns={[
              {
                key: "created_at",
                label: "Dibuat",
                render: (r) => new Date(r.created_at).toLocaleString("id-ID"),
              },
              {
                key: "last_seen_at",
                label: "Terakhir aktif",
                render: (r) => new Date(r.last_seen_at).toLocaleString("id-ID"),
              },
              { key: "user_agent", label: "Perangkat" },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
            ]}
            actions={(row) =>
              row.status === "ACTIVE" ? (
                <button
                  disabled={state.busy}
                  onClick={() =>
                    void state.run(async () => {
                      await send(`security/sessions/${row.id}/revoke`, {});
                      await load();
                    }, "Sesi dicabut.")
                  }
                >
                  Cabut sesi
                </button>
              ) : null
            }
          />
        </section>
      )}
    </>
  );
}

// ============================================================
// LIBRARY PLACEHOLDER PAGES (Phase 1 - Foundation)
// ============================================================

function LibraryPlaceholderPage({
  user,
  catalog,
  title,
  description,
  section,
}: {
  user: Actor;
  catalog: Catalog;
  title: string;
  description: string;
  section: string;
}) {
  const write = can(user, "library.write");
  return (
    <>
      <PageHeading
        eyebrow={`PERPUSTAKAAN / ${section.toUpperCase()}`}
        title={title}
        description={description}
      />
      <section className="card">
        <div className="toolbar">
          <strong>{title}</strong>
        </div>
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📚</div>
          <h3 style={{ marginBottom: "0.5rem" }}>Halaman dalam pengembangan</h3>
          <p>Fitur {title.toLowerCase()} akan segera diimplementasikan.</p>
          {write && (
            <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
              Anda memiliki izin menulis (library.write) untuk modul ini.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

export function LibraryDashboardPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [data, setData] = useState<Row>({
    overview: null,
    statistics: null,
    activities: [],
  });
  const load = async () => {
    const [ov, st, ac] = await Promise.all([
      api("library/overview"),
      api("library/statistics"),
      api("library/activities"),
    ]);
    setData({
      overview: ov,
      statistics: st,
      activities: ac.data || [],
    });
  };
  const state = useOperation(load);
  const write = can(user, "library.write");

  const booksCount = (data.overview?.books || []).length;
  const copiesCount = (data.overview?.copies || []).length;
  const availableCount = (data.overview?.copies || []).filter(
    (c: Row) => c.status === "AVAILABLE",
  ).length;
  const borrowedCount = (data.overview?.copies || []).filter(
    (c: Row) => c.status === "BORROWED",
  ).length;
  const overdueCount = (data.overview?.borrowings || []).filter(
    (r: Row) => !r.returned_at && r.overdue,
  ).length;
  const unpaidPenalties = (data.overview?.penalties || []).filter(
    (p: Row) => p.status === "UNPAID",
  ).reduce((acc: number, p: Row) => acc + Number(p.amount), 0);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div className="toolbar" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">PERPUSTAKAAN</span>
          <h2>Dashboard Perpustakaan</h2>
          <p className="muted">
            Ringkasan statistik koleksi, sirkulasi, dan aktivitas terbaru.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {write && (
            <>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  location.hash = "library-sirkulasi-peminjaman";
                }}
              >
                + Peminjaman Baru
              </button>
            </>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => state.run(load)}
            disabled={state.busy}
          >
            {state.busy ? "Memuat…" : "Muat Ulang"}
          </button>
        </div>
      </div>

      <div
        className="metric-grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        <div className="metric">
          <span className="muted">Judul Buku</span>
          <strong>{booksCount}</strong>
        </div>
        <div className="metric">
          <span className="muted">Total Eksemplar</span>
          <strong>{copiesCount}</strong>
        </div>
        <div className="metric">
          <span className="muted">Tersedia</span>
          <strong style={{ color: "var(--success, #16a34a)" }}>
            {availableCount}
          </strong>
        </div>
        <div className="metric">
          <span className="muted">Dipinjam</span>
          <strong style={{ color: "var(--primary, #2563eb)" }}>
            {borrowedCount}
          </strong>
        </div>
        <div className="metric accent">
          <span className="muted">Terlambat (Overdue)</span>
          <strong style={{ color: "var(--danger, #dc2626)" }}>
            {overdueCount}
          </strong>
        </div>
        <div className="metric">
          <span className="muted">Denda Belum Lunas</span>
          <strong>{money(unpaidPenalties)}</strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: "1.5rem",
        }}
      >
        <section className="card">
          <div className="toolbar">
            <strong>Buku Paling Sering Dipinjam</strong>
          </div>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Judul Buku</th>
                  <th>Penulis</th>
                  <th>Total Pinjam</th>
                </tr>
              </thead>
              <tbody>
                {(!data.statistics?.most_borrowed_books ||
                  data.statistics.most_borrowed_books.length === 0) ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      Belum ada data peminjaman.
                    </td>
                  </tr>
                ) : (
                  data.statistics.most_borrowed_books.map(
                    (row: Row, idx: number) => (
                      <tr key={idx}>
                        <td>
                          <strong>{row.title}</strong>
                        </td>
                        <td>{row.author || "—"}</td>
                        <td>{row.borrowings_count}x</td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </SortableTable>
          </div>
        </section>

        <section className="card">
          <div className="toolbar">
            <strong>Distribusi Status Eksemplar</strong>
          </div>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {(!data.statistics?.book_status_distribution ||
                  data.statistics.book_status_distribution.length === 0) ? (
                  <tr>
                    <td colSpan={2} className="empty">
                      Belum ada data eksemplar.
                    </td>
                  </tr>
                ) : (
                  data.statistics.book_status_distribution.map(
                    (row: Row, idx: number) => (
                      <tr key={idx}>
                        <td>
                          <CopyStatusBadge status={row.status} />
                        </td>
                        <td>
                          <strong>{row.count}</strong>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </SortableTable>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="toolbar">
          <strong>Aktivitas Sirkulasi Terbaru</strong>
        </div>
        <div className="table-wrap">
          <SortableTable>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Siswa</th>
                <th>Buku</th>
                <th>Barcode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Belum ada aktivitas sirkulasi.
                  </td>
                </tr>
              ) : (
                data.activities.map((row: Row) => (
                  <tr key={row.id}>
                    <td>{dateText(row.timestamp)}</td>
                    <td>
                      <strong>{row.student_name}</strong>
                    </td>
                    <td>{row.book_title}</td>
                    <td>{row.barcode}</td>
                    <td>
                      {row.status === "RETURNED" ? (
                        <span className="badge green">Dikembalikan</span>
                      ) : row.status === "OVERDUE" ? (
                        <span className="badge red">Terlambat</span>
                      ) : (
                        <span className="badge blue">Dipinjam</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </SortableTable>
        </div>
      </section>
    </div>
  );
}

export function LibraryKoleksiBukuPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  return <LibraryPage user={user} catalog={catalog} />;
}

export function LibraryKoleksiKategoriPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [categories, setCategories] = useState<{ name: string; book_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const json = await api("library/categories");
      setCategories(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-page">
      <div className="table-header">
        <div>
          <h2>Kategori Buku</h2>
          <p className="text-muted">Daftar kategori / klasifikasi buku perpustakaan.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            🔄 Refresh
          </button>
        </div>
      </div>
      <div className="filter-toolbar">
        <input
          type="text"
          placeholder="Cari kategori..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-control"
        />
      </div>
      <div className="table-container">
        {loading ? (
          <div className="p-4 text-center">Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted">Belum ada data kategori.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Kategori</th>
                <th>Jumlah Judul Buku</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cat, idx) => (
                <tr key={idx}>
                  <td><strong>{cat.name}</strong></td>
                  <td><span className="badge badge-info">{cat.book_count} buku</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LibraryKoleksiPenulisPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [authors, setAuthors] = useState<{ name: string; book_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const json = await api("library/authors");
      setAuthors(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = authors.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-page">
      <div className="table-header">
        <div>
          <h2>Penulis Buku</h2>
          <p className="text-muted">Daftar penulis / pengarang buku perpustakaan.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            🔄 Refresh
          </button>
        </div>
      </div>
      <div className="filter-toolbar">
        <input
          type="text"
          placeholder="Cari penulis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-control"
        />
      </div>
      <div className="table-container">
        {loading ? (
          <div className="p-4 text-center">Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted">Belum ada data penulis.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Penulis</th>
                <th>Jumlah Judul Buku</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((aut, idx) => (
                <tr key={idx}>
                  <td><strong>{aut.name}</strong></td>
                  <td><span className="badge badge-info">{aut.book_count} buku</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LibraryKoleksiPenerbitPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [publishers, setPublishers] = useState<{ name: string; book_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const json = await api("library/publishers");
      setPublishers(json.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = publishers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-page">
      <div className="table-header">
        <div>
          <h2>Penerbit Buku</h2>
          <p className="text-muted">Daftar penerbit buku perpustakaan.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            🔄 Refresh
          </button>
        </div>
      </div>
      <div className="filter-toolbar">
        <input
          type="text"
          placeholder="Cari penerbit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-control"
        />
      </div>
      <div className="table-container">
        {loading ? (
          <div className="p-4 text-center">Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted">Belum ada data penerbit.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Penerbit</th>
                <th>Jumlah Judul Buku</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pub, idx) => (
                <tr key={idx}>
                  <td><strong>{pub.name}</strong></td>
                  <td><span className="badge badge-info">{pub.book_count} buku</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LibraryKoleksiRakPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [shelves, setShelves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const json = await api("library/shelves");
      setShelves(json.data || json || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await send("library/shelves", form);
      setSuccess("Rak berhasil ditambahkan!");
      setShowModal(false);
      setForm({ code: "", name: "", description: "" });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus rak ini?")) return;
    setError("");
    try {
      await api(`library/shelves/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = shelves.filter(
    (s) =>
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-page">
      <div className="table-header">
        <div>
          <h2>Rak Buku</h2>
          <p className="text-muted">Kelola lokasi rak / penyimpanan fisik buku.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={loadData}>
            🔄 Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Tambah Rak
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger mb-3">{error}</div>}
      {success && <div className="alert alert-success mb-3">{success}</div>}

      <div className="filter-toolbar">
        <input
          type="text"
          placeholder="Cari kode atau nama rak..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-control"
        />
      </div>

      <div className="table-container">
        {loading ? (
          <div className="p-4 text-center">Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted">Belum ada data rak.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Kode Rak</th>
                <th>Nama Rak</th>
                <th>Deskripsi</th>
                <th>Jumlah Eksemplar</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shelf) => (
                <tr key={shelf.id}>
                  <td><code>{shelf.code}</code></td>
                  <td><strong>{shelf.name}</strong></td>
                  <td>{shelf.description || "-"}</td>
                  <td><span className="badge badge-info">{shelf.copy_count || 0} eksemplar</span></td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(shelf.id)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Tambah Rak Buku</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group mb-3">
                <label>Kode Rak *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: RAK-A2"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group mb-3">
                <label>Nama Rak *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rak Referensi"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group mb-3">
                <label>Deskripsi</label>
                <textarea
                  placeholder="Keterangan lokasi atau jenis buku..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Rak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function LibrarySirkulasiPeminjamanPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [borrowings, setBorrowings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [students, setStudents] = useState<Row[]>([]);
  const [copies, setCopies] = useState<Row[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: Row[] }>("library/borrowings");
      setBorrowings(res.data);
      const studs = await api<{ data: Row[] }>("students");
      setStudents(studs.data || []);
      const cps = await api<{ data: Row[] }>("library/copies");
      setCopies(cps.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("library/borrowings", {
        student_id: studentId,
        copy_id: copyId,
        due_date: dueDate,
      });
      setDrawerOpen(false);
      setStudentId("");
      setCopyId("");
      setDueDate("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredBorrowings = borrowings.filter((b) =>
    [b.student_name, b.student_nis, b.book_title, b.barcode, b.status]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query)
  );

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SIRKULASI</span>
          <h1>Peminjaman Buku</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari peminjaman"
              placeholder="Cari peminjaman…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can(user, "library.write") && (
            <button className="primary" onClick={() => setDrawerOpen(true)}>
              + Peminjaman Baru
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-container">
        {loading ? (
          <p style={{ padding: "1rem" }}>Memuat data peminjaman...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Peminjam</th>
                <th>Buku & Barcode</th>
                <th>Tanggal Pinjam</th>
                <th>Jatuh Tempo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBorrowings.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center" }}>Tidak ada data peminjaman.</td>
                </tr>
              ) : (
                filteredBorrowings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.student_name}</strong>
                      <br />
                      <small>{b.student_nis}</small>
                    </td>
                    <td>
                      <strong>{b.book_title}</strong>
                      <br />
                      <small>Barcode: {b.barcode}</small>
                    </td>
                    <td>{new Date(b.borrowed_at).toLocaleDateString()}</td>
                    <td>{b.due_date}</td>
                    <td>
                      <span className={`badge ${b.returned_at ? "success" : new Date(b.due_date) < new Date() ? "danger" : "warning"}`}>
                        {b.returned_at ? "RETURNED" : new Date(b.due_date) < new Date() ? "OVERDUE" : "BORROWED"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup form peminjaman"
            disabled={busy}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="peminjaman-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">SIRKULASI</span>
                <h2 id="peminjaman-drawer-title">Peminjaman Baru</h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={() => setDrawerOpen(false)}>
                {"\u00d7"}
              </button>
            </div>
            <form onSubmit={handleSave} className="form-stack" style={{ padding: "1.5rem" }}>
              <div className="form-group">
                <label>Siswa (Peminjam)</label>
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required disabled={busy}>
                  <option value="">-- Pilih Siswa --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nis || "Tanpa NIS"})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Eksemplar Buku (Barcode)</label>
                <select value={copyId} onChange={(e) => setCopyId(e.target.value)} required disabled={busy}>
                  <option value="">-- Pilih Eksemplar Tersedia --</option>
                  {copies.filter((c) => c.status === "AVAILABLE").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.barcode} - {c.book_title || "Buku"} ({c.condition})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Tanggal Jatuh Tempo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required disabled={busy} />
              </div>
              <div className="form-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <button type="submit" className="primary" disabled={busy}>Simpan Peminjaman</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setDrawerOpen(false)}>Batal</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export function LibrarySirkulasiPengembalianPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [borrowings, setBorrowings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedBorrowingId, setSelectedBorrowingId] = useState("");
  const [condition, setCondition] = useState("GOOD");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: Row[] }>("library/borrowings?status=BORROWED");
      setBorrowings(res.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBorrowingId) return;
    setBusy(true);
    setError("");
    try {
      await send(`library/borrowings/${selectedBorrowingId}/return`, {
        condition,
      });
      setDrawerOpen(false);
      setSelectedBorrowingId("");
      setCondition("GOOD");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredBorrowings = borrowings.filter((b) =>
    [b.student_name, b.student_nis, b.book_title, b.barcode]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query)
  );

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SIRKULASI</span>
          <h1>Pengembalian Buku</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari pengembalian"
              placeholder="Cari pengembalian…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can(user, "library.write") && (
            <button className="primary" onClick={() => setDrawerOpen(true)}>
              + Proses Pengembalian
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-container">
        {loading ? (
          <p style={{ padding: "1rem" }}>Memuat daftar peminjaman aktif...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Peminjam</th>
                <th>Buku & Barcode</th>
                <th>Tanggal Pinjam</th>
                <th>Jatuh Tempo</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredBorrowings.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center" }}>Tidak ada peminjaman aktif yang perlu dikembalikan.</td>
                </tr>
              ) : (
                filteredBorrowings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.student_name}</strong>
                      <br />
                      <small>{b.student_nis}</small>
                    </td>
                    <td>
                      <strong>{b.book_title}</strong>
                      <br />
                      <small>Barcode: {b.barcode}</small>
                    </td>
                    <td>{new Date(b.borrowed_at).toLocaleDateString()}</td>
                    <td>{b.due_date}</td>
                    <td>
                      <span className={`badge ${new Date(b.due_date) < new Date() ? "danger" : "warning"}`}>
                        {new Date(b.due_date) < new Date() ? "OVERDUE" : "BORROWED"}
                      </span>
                    </td>
                    <td>
                      {can(user, "library.write") && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setSelectedBorrowingId(b.id);
                            setDrawerOpen(true);
                          }}
                        >
                          Proses Kembali
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup form pengembalian"
            disabled={busy}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pengembalian-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">SIRKULASI</span>
                <h2 id="pengembalian-drawer-title">Proses Pengembalian Buku</h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={() => setDrawerOpen(false)}>
                {"\u00d7"}
              </button>
            </div>
            <form onSubmit={handleReturn} className="form-stack" style={{ padding: "1.5rem" }}>
              <div className="form-group">
                <label>Pilih Transaksi Peminjaman Aktif</label>
                <select
                  value={selectedBorrowingId}
                  onChange={(e) => setSelectedBorrowingId(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">-- Pilih Buku / Peminjam --</option>
                  {borrowings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.student_name} - {b.book_title} ({b.barcode}) [Due: {b.due_date}]
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Kondisi Buku Saat Dikembalikan</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="GOOD">Baik (Good)</option>
                  <option value="DAMAGED">Rusak (Damaged)</option>
                  <option value="LOST">Hilang (Lost)</option>
                </select>
              </div>
              <div className="form-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <button type="submit" className="primary" disabled={busy}>Konfirmasi Pengembalian</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setDrawerOpen(false)}>Batal</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export function LibrarySirkulasiPerpanjanganPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [borrowings, setBorrowings] = useState<Row[]>([]);
  const [renewals, setRenewals] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedBorrowingId, setSelectedBorrowingId] = useState("");
  const [days, setDays] = useState(7);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: Row[] }>("library/borrowings?status=BORROWED");
      setBorrowings(res.data || []);
      const renRes = await api<{ data: Row[] }>("library/renewals");
      setRenewals(renRes.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBorrowingId) return;
    setBusy(true);
    setError("");
    try {
      await send(`library/borrowings/${selectedBorrowingId}/renew`, {
        days: Number(days),
      });
      setDrawerOpen(false);
      setSelectedBorrowingId("");
      setDays(7);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedBorrowing = borrowings.find((b) => b.id === selectedBorrowingId);
  const calculatedNewDueDate = selectedBorrowing
    ? (() => {
        const d = new Date(selectedBorrowing.due_date);
        d.setDate(d.getDate() + Number(days));
        return d.toISOString().slice(0, 10);
      })()
    : "—";

  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredBorrowings = borrowings.filter((b) =>
    [b.student_name, b.student_nis, b.book_title, b.barcode]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query)
  );

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SIRKULASI</span>
          <h1>Perpanjangan Peminjaman</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari peminjaman"
              placeholder="Cari peminjaman…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can(user, "library.write") && (
            <button className="primary" onClick={() => setDrawerOpen(true)}>
              + Perpanjang Masa Pinjam
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-container">
        {loading ? (
          <p style={{ padding: "1rem" }}>Memuat daftar peminjaman aktif...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Peminjam</th>
                <th>Buku & Barcode</th>
                <th>Tanggal Pinjam</th>
                <th>Jatuh Tempo Saat Ini</th>
                <th>Perpanjangan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredBorrowings.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center" }}>
                    Tidak ada peminjaman aktif yang tersedia untuk diperpanjang.
                  </td>
                </tr>
              ) : (
                filteredBorrowings.map((b) => {
                  const bRenewals = renewals.filter((r) => r.borrowing_id === b.id);
                  const count = bRenewals.length;
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.student_name}</strong>
                        <br />
                        <small>{b.student_nis}</small>
                      </td>
                      <td>
                        <strong>{b.book_title}</strong>
                        <br />
                        <small>Barcode: {b.barcode}</small>
                      </td>
                      <td>{new Date(b.borrowed_at).toLocaleDateString()}</td>
                      <td>{b.due_date}</td>
                      <td>
                        <span className={`badge ${count >= 2 ? "danger" : "default"}`}>
                          {count} / 2 kali
                        </span>
                      </td>
                      <td>
                        {can(user, "library.write") && (
                          <button
                            className="secondary"
                            disabled={count >= 2}
                            onClick={() => {
                              setSelectedBorrowingId(b.id);
                              setDrawerOpen(true);
                            }}
                          >
                            {count >= 2 ? "Batas Tercapai" : "Perpanjang"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup form perpanjangan"
            disabled={busy}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="perpanjangan-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">SIRKULASI</span>
                <h2 id="perpanjangan-drawer-title">Perpanjang Masa Pinjam</h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={() => setDrawerOpen(false)}>
                {"\u00d7"}
              </button>
            </div>
            <form onSubmit={handleRenew} className="form-stack" style={{ padding: "1.5rem" }}>
              <div className="form-group">
                <label>Pilih Transaksi Peminjaman</label>
                <select
                  value={selectedBorrowingId}
                  onChange={(e) => setSelectedBorrowingId(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">-- Pilih Buku / Siswa --</option>
                  {borrowings.map((b) => {
                    const count = renewals.filter((r) => r.borrowing_id === b.id).length;
                    return (
                      <option key={b.id} value={b.id} disabled={count >= 2}>
                        {b.student_name} - {b.book_title} ({b.barcode}) [Due: {b.due_date}] {count >= 2 ? "(Max)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedBorrowing && (
                <div style={{ background: "var(--bg-muted, #f3f4f6)", padding: "1rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem" }}>
                    <strong>Jatuh tempo saat ini:</strong> {selectedBorrowing.due_date}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--primary-color, #2563eb)" }}>
                    <strong>Estimasi jatuh tempo baru:</strong> {calculatedNewDueDate}
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>Jumlah Hari Tambahan</label>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  required
                  disabled={busy}
                >
                  <option value={3}>3 Hari</option>
                  <option value={7}>7 Hari (1 Minggu)</option>
                  <option value={14}>14 Hari (2 Minggu)</option>
                </select>
              </div>

              <div className="form-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <button type="submit" className="primary" disabled={busy}>Konfirmasi Perpanjangan</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setDrawerOpen(false)}>Batal</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export function LibrarySirkulasiReservasiPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [reservations, setReservations] = useState<Row[]>([]);
  const [books, setBooks] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [bookId, setBookId] = useState("");
  const [studentId, setStudentId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: Row[] }>("library/reservations");
      setReservations(res.data || []);
      const bks = await api<{ data: Row[] }>("library/books");
      setBooks(bks.data || []);
      const studs = await api<{ data: Row[] }>("students");
      setStudents(studs.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId || !studentId) return;
    setBusy(true);
    setError("");
    try {
      await send("library/reservations", {
        book_id: bookId,
        student_id: studentId,
      });
      setDrawerOpen(false);
      setBookId("");
      setStudentId("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Batalkan reservasi ini?")) return;
    setBusy(true);
    setError("");
    try {
      await send(`library/reservations/${id}/cancel`, {});
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredReservations = reservations.filter((r) =>
    [r.student_name, r.student_nis, r.book_title, r.book_author, r.status]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query)
  );

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SIRKULASI</span>
          <h1>Reservasi Buku</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari reservasi"
              placeholder="Cari reservasi…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can(user, "library.write") && (
            <button className="primary" onClick={() => setDrawerOpen(true)}>
              + Reservasi Baru
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-container">
        {loading ? (
          <p style={{ padding: "1rem" }}>Memuat daftar reservasi...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Antrean</th>
                <th>Pemesan</th>
                <th>Judul Buku</th>
                <th>Status</th>
                <th>Eksemplar / Batas Ambil</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center" }}>
                    Belum ada data reservasi.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge default">#{r.queue_position}</span>
                    </td>
                    <td>
                      <strong>{r.student_name}</strong>
                      <br />
                      <small>{r.student_nis}</small>
                    </td>
                    <td>
                      <strong>{r.book_title}</strong>
                      <br />
                      <small>{r.book_author}</small>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === "READY"
                            ? "success"
                            : r.status === "WAITING"
                            ? "warning"
                            : r.status === "CANCELLED"
                            ? "danger"
                            : "default"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.assigned_barcode ? (
                        <>
                          <strong>Barcode: {r.assigned_barcode}</strong>
                          <br />
                          <small>Batas: {r.expiry_date || "—"}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {can(user, "library.write") && (r.status === "WAITING" || r.status === "READY") && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void handleCancel(r.id)}
                        >
                          Batalkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup form reservasi"
            disabled={busy}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservasi-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">SIRKULASI</span>
                <h2 id="reservasi-drawer-title">Buat Reservasi Baru</h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={() => setDrawerOpen(false)}>
                {"\u00d7"}
              </button>
            </div>
            <form onSubmit={handleCreate} className="form-stack" style={{ padding: "1.5rem" }}>
              <div className="form-group">
                <label>Pilih Siswa</label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">-- Pilih Siswa --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nis || "Tanpa NIS"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Pilih Judul Buku</label>
                <select
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">-- Pilih Buku --</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.author})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-actions" style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <button type="submit" className="primary" disabled={busy}>Simpan Reservasi</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setDrawerOpen(false)}>Batal</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

export function LibraryInventarisStokPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/inventory/stock");
      setStocks(res.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = stocks.filter(
    (s) =>
      s.title?.toLowerCase().includes(search.toLowerCase()) ||
      s.author?.toLowerCase().includes(search.toLowerCase()) ||
      s.isbn?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Inventaris Perpustakaan
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Stok Buku</h1>
          <p className="text-sm text-slate-600 mt-1">
            Pantau ketersediaan total dan status eksemplar per judul buku.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          <button
            onClick={() => void load()}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      <div className="filter-toolbar bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <input
          type="text"
          placeholder="Cari judul, penulis, atau ISBN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="text-sm text-slate-500">Total Judul: {filtered.length}</div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">ISBN / Judul</th>
                <th className="px-6 py-3">Penulis / Penerbit</th>
                <th className="px-6 py-3 text-center">Total</th>
                <th className="px-6 py-3 text-center">Tersedia</th>
                <th className="px-6 py-3 text-center">Dipinjam</th>
                <th className="px-6 py-3 text-center">Reservasi</th>
                <th className="px-6 py-3 text-center">Hilang/Rusak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Memuat data stok...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Tidak ada data stok buku ditemukan.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{s.title}</div>
                      <div className="text-xs text-slate-500">{s.isbn || "-"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900">{s.author}</div>
                      <div className="text-xs text-slate-500">{s.publisher || "-"}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-slate-900">
                      {s.total_copies}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {s.available_copies}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {s.borrowed_copies}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {s.reserved_copies}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                        {(s.lost_copies || 0) + (s.damaged_copies || 0)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LibraryInventarisOpnamePage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [opnames, setOpnames] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/inventory/opnames");
      setOpnames(res.data || []);
      const sh = await api<{ data: any[] }>("library/shelves");
      setShelves(sh.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("library/inventory/opnames", {
        title,
        shelf_id: shelfId || undefined,
        notes: notes || undefined,
      });
      setTitle("");
      setShelfId("");
      setNotes("");
      setDrawerOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Inventaris Perpustakaan
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Stock Opname</h1>
          <p className="text-sm text-slate-600 mt-1">
            Lakukan audit dan pencatatan inventaris fisik berkala.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          {can(user, "library.write") && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              + Mulai Stock Opname Baru
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Sesi / Judul</th>
                <th className="px-6 py-3">Rak Target</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-center">Total Item</th>
                <th className="px-6 py-3 text-center">Selisih</th>
                <th className="px-6 py-3">Dibuat Oleh</th>
                <th className="px-6 py-3">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Memuat data stock opname...
                  </td>
                </tr>
              ) : opnames.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Belum ada sesi stock opname tercatat.
                  </td>
                </tr>
              ) : (
                opnames.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div>{op.title}</div>
                      {op.notes && <div className="text-xs text-slate-500">{op.notes}</div>}
                    </td>
                    <td className="px-6 py-4">{op.shelf_name || "Semua Rak"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          op.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : op.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {op.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-slate-900">
                      {op.total_items}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          op.discrepancy_count > 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {op.discrepancy_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-900">{op.created_by_name || "-"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(op.created_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/30 flex justify-end">
          <div className="school-drawer-layer w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Mulai Stock Opname Baru</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 pt-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Judul / Nama Sesi Audit *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Audit Semester Ganjil"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Rak Tertentu</label>
                <select
                  value={shelfId}
                  onChange={(e) => setShelfId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Semua Rak (Seluruh Koleksi) --</option>
                  {shelves.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.code} - {sh.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Menyimpan..." : "Simpan & Mulai"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryInventarisHilangRusakPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [copies, setCopies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyId, setCopyId] = useState("");
  const [type, setType] = useState<"LOST" | "DAMAGED">("LOST");
  const [description, setDescription] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/inventory/incidents");
      setIncidents(res.data || []);
      const cps = await api<{ data: any[] }>("library/copies");
      setCopies(cps.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("library/inventory/incidents", {
        copy_id: copyId,
        type,
        description,
        resolution: resolution || undefined,
      });
      setCopyId("");
      setDescription("");
      setResolution("");
      setDrawerOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Inventaris Perpustakaan
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Buku Hilang & Rusak</h1>
          <p className="text-sm text-slate-600 mt-1">
            Pencatatan dan pelaporan eksemplar buku yang hilang atau rusak.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          {can(user, "library.write") && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              + Catat Insiden Baru
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Buku & Barcode</th>
                <th className="px-6 py-3">Jenis Insiden</th>
                <th className="px-6 py-3">Keterangan</th>
                <th className="px-6 py-3">Resolusi</th>
                <th className="px-6 py-3">Dilapor Oleh</th>
                <th className="px-6 py-3">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Memuat data insiden...
                  </td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Tidak ada insiden hilang/rusak tercatat.
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{inc.book_title}</div>
                      <div className="text-xs font-mono text-slate-500">{inc.barcode}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          inc.type === "LOST"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inc.type === "LOST" ? "Hilang" : "Rusak"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-900">{inc.description}</td>
                    <td className="px-6 py-4 text-slate-600">{inc.resolution || "-"}</td>
                    <td className="px-6 py-4 text-slate-900">{inc.reported_by_name || "-"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(inc.reported_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/30 flex justify-end">
          <div className="school-drawer-layer w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Catat Insiden Buku Hilang/Rusak</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 pt-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilih Eksemplar Buku (Barcode) *
                </label>
                <select
                  required
                  value={copyId}
                  onChange={(e) => setCopyId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih Eksemplar --</option>
                  {copies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.barcode} ({c.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jenis Insiden *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "LOST" | "DAMAGED")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="LOST">Hilang (Lost)</option>
                  <option value="DAMAGED">Rusak (Damaged)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan / Kronologi *
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan kondisi atau kronologi kejadian..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Resolusi / Tindakan Lanjut
                </label>
                <input
                  type="text"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Contoh: Diganti dengan buku baru / Dikenakan denda"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Menyimpan..." : "Simpan Insiden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryInventarisMutasiPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [mutations, setMutations] = useState<any[]>([]);
  const [copies, setCopies] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyId, setCopyId] = useState("");
  const [toShelfId, setToShelfId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/inventory/mutations");
      setMutations(res.data || []);
      const cps = await api<{ data: any[] }>("library/copies");
      setCopies(cps.data || []);
      const sh = await api<{ data: any[] }>("library/shelves");
      setShelves(sh.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send("library/inventory/mutations", {
        copy_id: copyId,
        to_shelf_id: toShelfId,
        reason,
      });
      setCopyId("");
      setToShelfId("");
      setReason("");
      setDrawerOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Inventaris Perpustakaan
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Mutasi Buku</h1>
          <p className="text-sm text-slate-600 mt-1">
            Kelola perpindahan lokasi / rak eksemplar buku secara sistematis.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          {can(user, "library.write") && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              + Mutasi Buku Baru
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Buku & Barcode</th>
                <th className="px-6 py-3">Rak Asal</th>
                <th className="px-6 py-3">Rak Tujuan</th>
                <th className="px-6 py-3">Alasan Perpindahan</th>
                <th className="px-6 py-3">Petugas</th>
                <th className="px-6 py-3">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Memuat riwayat mutasi...
                  </td>
                </tr>
              ) : mutations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Belum ada riwayat mutasi buku tercatat.
                  </td>
                </tr>
              ) : (
                mutations.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{m.book_title}</div>
                      <div className="text-xs font-mono text-slate-500">{m.barcode}</div>
                    </td>
                    <td className="px-6 py-4">{m.from_shelf_name || "Tanpa Rak"}</td>
                    <td className="px-6 py-4 font-medium text-indigo-600">
                      {m.to_shelf_name || "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-900">{m.reason}</td>
                    <td className="px-6 py-4 text-slate-900">{m.performed_by_name || "-"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(m.performed_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/30 flex justify-end">
          <div className="school-drawer-layer w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Mutasi Rak Eksemplar Buku</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 pt-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilih Eksemplar Buku (Barcode) *
                </label>
                <select
                  required
                  value={copyId}
                  onChange={(e) => setCopyId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih Eksemplar --</option>
                  {copies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.barcode} ({c.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rak Tujuan *
                </label>
                <select
                  required
                  value={toShelfId}
                  onChange={(e) => setToShelfId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih Rak Tujuan --</option>
                  {shelves.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.code} - {sh.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alasan Perpindahan *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Reorganisasi rak perpustakaan pusat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Menyimpan..." : "Simpan Mutasi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


export function LibraryDendaAktifPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [penalties, setPenalties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/penalties?status=UNPAID");
      setPenalties(res.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleResolve = async (id: string, method: "WALLET" | "WAIVE") => {
    if (!confirm(method === "WALLET" ? "Proses pembayaran denda dari saldo siswa?" : "Bebaskan (waive) denda ini?")) {
      return;
    }
    setBusyId(id);
    setError("");
    try {
      await send(`library/penalties/${id}/resolve`, { method });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Manajemen Denda
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Denda Aktif (Belum Lunas)</h1>
          <p className="text-sm text-slate-600 mt-1">
            Pantau dan selesaikan denda keterlambatan, kerusakan, atau kehilangan buku.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          <button
            onClick={() => void load()}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Siswa (Peminjam)</th>
                <th className="px-6 py-3">Buku & Barcode</th>
                <th className="px-6 py-3">Tipe Denda</th>
                <th className="px-6 py-3 text-center">Keterlambatan</th>
                <th className="px-6 py-3 text-right">Jumlah Denda</th>
                <th className="px-6 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Memuat denda aktif...
                  </td>
                </tr>
              ) : penalties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Tidak ada denda aktif saat ini.
                  </td>
                </tr>
              ) : (
                penalties.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{p.student_name}</div>
                      <div className="text-xs font-mono text-slate-500">NIS: {p.nis || "-"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{p.book_title}</div>
                      <div className="text-xs font-mono text-slate-500">{p.barcode}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {p.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-slate-900">
                      {p.late_days > 0 ? `${p.late_days} hari` : "-"}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      Rp {Number(p.amount).toLocaleString("id-ID")}
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      {can(user, "library.write") && (
                        <>
                          <button
                            onClick={() => void handleResolve(p.id, "WALLET")}
                            disabled={busyId === p.id}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Bayar (Saldo)
                          </button>
                          <button
                            onClick={() => void handleResolve(p.id, "WAIVE")}
                            disabled={busyId === p.id}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                          >
                            Bebaskan
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LibraryDendaRiwayatPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [penalties, setPenalties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: any[] }>("library/penalties");
      setPenalties((res.data || []).filter((p: any) => p.status !== "UNPAID"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Manajemen Denda
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Riwayat Pembayaran Denda</h1>
          <p className="text-sm text-slate-600 mt-1">
            Lacak riwayat pelunasan dan pembebasan denda perpustakaan.
          </p>
        </div>
        <div className="page-actions flex items-center gap-3">
          <button
            onClick={() => void load()}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Siswa</th>
                <th className="px-6 py-3">Buku</th>
                <th className="px-6 py-3">Tipe</th>
                <th className="px-6 py-3 text-right">Jumlah</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Tanggal Selesai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Memuat riwayat denda...
                  </td>
                </tr>
              ) : penalties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Belum ada riwayat pembayaran atau pembebasan denda.
                  </td>
                </tr>
              ) : (
                penalties.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900">{p.student_name}</td>
                    <td className="px-6 py-4">{p.book_title}</td>
                    <td className="px-6 py-4">{p.type}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      Rp {Number(p.amount).toLocaleString("id-ID")}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          p.status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {p.resolved_at ? new Date(p.resolved_at).toLocaleString("id-ID") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export function LibraryLaporanPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [activeTab, setActiveTab] = useState<"peminjaman" | "pengembalian" | "keterlambatan" | "terpopuler" | "inventaris" | "denda">("peminjaman");
  const [reportData, setReportData] = useState<any[] | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReport = async (tab: typeof activeTab) => {
    setLoading(true);
    setError("");
    setReportData(null);
    setSummaryData(null);
    try {
      if (tab === "inventaris") {
        const res = await api<any>(`library/reports/inventaris`);
        setSummaryData(res);
      } else if (tab === "denda") {
        const res = await api<any>(`library/reports/denda`);
        setSummaryData(res);
      } else {
        const endpointMap = {
          peminjaman: "library/reports/peminjaman",
          pengembalian: "library/reports/pengembalian",
          keterlambatan: "library/reports/keterlambatan",
          terpopuler: "library/reports/buku-terpopuler",
        };
        const res = await api<{ data: any[] }>(endpointMap[tab]);
        setReportData(res.data || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport(activeTab);
  }, [activeTab]);

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Laporan Perpustakaan
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Pusat Laporan & Statistik</h1>
          <p className="text-sm text-slate-600 mt-1">
            Unduh dan tinjau laporan peminjaman, pengembalian, keterlambatan, buku terpopuler, inventaris, dan denda.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { key: "peminjaman", label: "Peminjaman" },
          { key: "pengembalian", label: "Pengembalian" },
          { key: "keterlambatan", label: "Keterlambatan" },
          { key: "terpopuler", label: "Buku Terpopuler" },
          { key: "inventaris", label: "Inventaris" },
          { key: "denda", label: "Denda & Keuangan" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === tab.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          Memuat laporan...
        </div>
      ) : activeTab === "inventaris" && summaryData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Eksemplar", val: summaryData.total_copies, color: "bg-blue-50 text-blue-800 border-blue-200" },
            { label: "Tersedia", val: summaryData.available, color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
            { label: "Dipinjam", val: summaryData.borrowed, color: "bg-amber-50 text-amber-800 border-amber-200" },
            { label: "Reservasi", val: summaryData.reserved, color: "bg-purple-50 text-purple-800 border-purple-200" },
            { label: "Hilang", val: summaryData.lost, color: "bg-red-50 text-red-800 border-red-200" },
            { label: "Rusak", val: summaryData.damaged, color: "bg-rose-50 text-rose-800 border-rose-200" },
            { label: "Pemeliharaan", val: summaryData.maintenance, color: "bg-slate-50 text-slate-800 border-slate-200" },
          ].map((item, idx) => (
            <div key={idx} className={`p-5 rounded-xl border ${item.color} shadow-sm`}>
              <div className="text-sm font-medium opacity-80">{item.label}</div>
              <div className="text-3xl font-bold mt-2">{item.val ?? 0}</div>
            </div>
          ))}
        </div>
      ) : activeTab === "denda" && summaryData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Denda", val: `Rp ${Number(summaryData.total_fine || 0).toLocaleString("id-ID")}`, color: "bg-blue-50 text-blue-800 border-blue-200" },
            { label: "Sudah Dibayar", val: `Rp ${Number(summaryData.paid || 0).toLocaleString("id-ID")}`, color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
            { label: "Belum Lunas", val: `Rp ${Number(summaryData.outstanding || 0).toLocaleString("id-ID")}`, color: "bg-amber-50 text-amber-800 border-amber-200" },
            { label: "Dibebaskan", val: `Rp ${Number(summaryData.waived || 0).toLocaleString("id-ID")}`, color: "bg-slate-50 text-slate-800 border-slate-200" },
          ].map((item, idx) => (
            <div key={idx} className={`p-5 rounded-xl border ${item.color} shadow-sm`}>
              <div className="text-sm font-medium opacity-80">{item.label}</div>
              <div className="text-2xl font-bold mt-2">{item.val}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase text-slate-700 font-semibold border-b border-slate-200">
                {activeTab === "peminjaman" && (
                  <tr>
                    <th className="px-6 py-3">Siswa</th>
                    <th className="px-6 py-3">Buku & Barcode</th>
                    <th className="px-6 py-3">Tanggal Pinjam</th>
                    <th className="px-6 py-3">Jatuh Tempo</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                )}
                {activeTab === "pengembalian" && (
                  <tr>
                    <th className="px-6 py-3">Siswa</th>
                    <th className="px-6 py-3">Buku & Barcode</th>
                    <th className="px-6 py-3">Tanggal Kembali</th>
                    <th className="px-6 py-3">Kondisi</th>
                  </tr>
                )}
                {activeTab === "keterlambatan" && (
                  <tr>
                    <th className="px-6 py-3">Siswa</th>
                    <th className="px-6 py-3">Buku</th>
                    <th className="px-6 py-3 text-center">Jatuh Tempo</th>
                    <th className="px-6 py-3 text-center">Terlambat</th>
                    <th className="px-6 py-3 text-right">Denda</th>
                  </tr>
                )}
                {activeTab === "terpopuler" && (
                  <tr>
                    <th className="px-6 py-3">Judul Buku</th>
                    <th className="px-6 py-3">Penulis</th>
                    <th className="px-6 py-3">ISBN</th>
                    <th className="px-6 py-3 text-center">Total Peminjaman</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-200">
                {!reportData || reportData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data laporan untuk kategori ini.
                    </td>
                  </tr>
                ) : (
                  reportData.map((row, i) => (
                    <tr key={row.id || i} className="hover:bg-slate-50 transition">
                      {activeTab === "peminjaman" && (
                        <>
                          <td className="px-6 py-4 font-medium text-slate-900">{row.student_name}</td>
                          <td className="px-6 py-4">
                            <div>{row.book_title}</div>
                            <div className="text-xs font-mono text-slate-500">{row.barcode}</div>
                          </td>
                          <td className="px-6 py-4 text-xs">{new Date(row.borrowed_at).toLocaleDateString("id-ID")}</td>
                          <td className="px-6 py-4 text-xs">{new Date(row.due_date).toLocaleDateString("id-ID")}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              {row.status}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === "pengembalian" && (
                        <>
                          <td className="px-6 py-4 font-medium text-slate-900">{row.student_name}</td>
                          <td className="px-6 py-4">
                            <div>{row.book_title}</div>
                            <div className="text-xs font-mono text-slate-500">{row.barcode}</div>
                          </td>
                          <td className="px-6 py-4 text-xs">{new Date(row.returned_at).toLocaleString("id-ID")}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              {row.condition || "GOOD"}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === "keterlambatan" && (
                        <>
                          <td className="px-6 py-4 font-medium text-slate-900">{row.student_name}</td>
                          <td className="px-6 py-4">{row.book_title}</td>
                          <td className="px-6 py-4 text-center text-xs">{new Date(row.due_date).toLocaleDateString("id-ID")}</td>
                          <td className="px-6 py-4 text-center font-bold text-red-600">{row.late_days} hari</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900">
                            Rp {Number(row.amount).toLocaleString("id-ID")}
                          </td>
                        </>
                      )}
                      {activeTab === "terpopuler" && (
                        <>
                          <td className="px-6 py-4 font-medium text-slate-900">{row.title}</td>
                          <td className="px-6 py-4">{row.author || "-"}</td>
                          <td className="px-6 py-4 text-xs font-mono">{row.isbn || "-"}</td>
                          <td className="px-6 py-4 text-center font-bold text-emerald-600">{row.borrowing_count}x</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryPengaturanPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<any>("library/settings");
      setSettings(res || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleChange = (field: string, val: any) => {
    setSettings((prev: any) => ({ ...prev, [field]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await send("library/settings", settings, "PUT");
      setSettings(res);
      setSuccess("Pengaturan perpustakaan berhasil disimpan!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="table-page space-y-6">
      <div className="table-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Konfigurasi Sistem
          </p>
          <h1 className="page-title text-2xl font-bold text-slate-900">Pengaturan Perpustakaan</h1>
          <p className="text-sm text-slate-600 mt-1">
            Atur aturan peminjaman, masa berlaku, denda, dan informasi identitas perpustakaan.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          Memuat pengaturan...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maksimal Buku Dipinjam</label>
              <input
                type="number"
                value={settings.max_books ?? 3}
                onChange={(e) => handleChange("max_books", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Durasi Peminjaman (Hari)</label>
              <input
                type="number"
                value={settings.loan_duration_days ?? 7}
                onChange={(e) => handleChange("loan_duration_days", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maksimal Perpanjangan</label>
              <input
                type="number"
                value={settings.max_renewals ?? 2}
                onChange={(e) => handleChange("max_renewals", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Durasi Perpanjangan (Hari)</label>
              <input
                type="number"
                value={settings.renewal_duration_days ?? 7}
                onChange={(e) => handleChange("renewal_duration_days", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maksimal Reservasi</label>
              <input
                type="number"
                value={settings.max_reservations ?? 2}
                onChange={(e) => handleChange("max_reservations", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Masa Berlaku Reservasi (Hari)</label>
              <input
                type="number"
                value={settings.reservation_expiry_days ?? 3}
                onChange={(e) => handleChange("reservation_expiry_days", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarif Denda Per Hari (Rp)</label>
              <input
                type="number"
                value={settings.fine_rate_per_day ?? 1000}
                onChange={(e) => handleChange("fine_rate_per_day", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maksimal Denda (Rp)</label>
              <input
                type="number"
                value={settings.max_fine ?? 50000}
                onChange={(e) => handleChange("max_fine", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Denda Buku Hilang (Rp)</label>
              <input
                type="number"
                value={settings.lost_book_fine ?? 100000}
                onChange={(e) => handleChange("lost_book_fine", Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Informasi Perpustakaan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Perpustakaan</label>
                <input
                  type="text"
                  value={settings.library_name ?? ""}
                  onChange={(e) => handleChange("library_name", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kode Perpustakaan</label>
                <input
                  type="text"
                  value={settings.library_code ?? ""}
                  onChange={(e) => handleChange("library_code", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Alamat</label>
                <textarea
                  value={settings.address ?? ""}
                  onChange={(e) => handleChange("address", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kontak / Telepon</label>
                <input
                  type="text"
                  value={settings.contact ?? ""}
                  onChange={(e) => handleChange("contact", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jam Operasional</label>
                <input
                  type="text"
                  value={settings.operating_hours ?? ""}
                  onChange={(e) => handleChange("operating_hours", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {can(user, "library.write") && (
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-emerald-600 text-white font-medium text-sm rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
              >
                {saving ? "Menyimpan..." : "Simpan Pengaturan"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

