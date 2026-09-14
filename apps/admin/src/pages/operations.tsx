import { SortableTable } from "../sortable-table";
import React, { useContext, useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
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
}: {
  title: string;
  fields: Field[];
  submit: (value: Row) => Promise<boolean | void>;
  busy: boolean;
  button?: string;
  drawer?: boolean;
  onSaved?: () => void;
}) {
  const defaults = () =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.nullable ? "" : field.type === "number" ? "0" : "",
      ]),
    );
  const [form, setForm] = useState<Row>(defaults);
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
  });
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
            />
          </section>
        </>
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
