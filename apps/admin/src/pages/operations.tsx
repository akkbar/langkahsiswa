import React, { useEffect, useState } from "react";
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(load);
  }, []);
  return { busy, error, success, run };
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
}: {
  title: string;
  fields: Field[];
  submit: (value: Row) => Promise<void>;
  busy: boolean;
  button?: string;
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
      className="card padded stack-form"
      onSubmit={(event) => {
        event.preventDefault();
        const value = Object.fromEntries(
          fields.map((field) => {
            const raw = form[field.key];
            if (field.nullable && field.nullValue && raw === "")
              return [field.key, null];
            if (field.type === "number") return [field.key, Number(raw)];
            if (field.type === "datetime-local")
              return [field.key, new Date(raw).toISOString()];
            return [field.key, raw];
          }),
        );
        void submit(value).then(() => setForm(defaults()));
      }}
    >
      <h2>{title}</h2>
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
      <button disabled={busy}>{button}</button>
    </form>
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
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            {actions && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>
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
      </table>
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
              CNAME diarahkan ke <strong>domains.schoolapp.id</strong>.
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
                    TXT: schoolapp-verification={row.verification_token}
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
}: {
  user: Actor;
  catalog: Catalog;
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
  });
  const [tab, setTab] = useState("hunian");
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
  const studentField: Field = {
    key: "student_id",
    label: "Siswa",
    rows: students,
    rowLabel: (row) => `${row.name} · ${row.nis}`,
  };
  return (
    <>
      <PageHeading
        eyebrow="OPERASIONAL PONDOK"
        title="Boarding School"
        description="Kelola hunian, izin, kunjungan, pembinaan, tahfidz, aktivitas, dan laundry."
      />
      <Notices state={state} />
      <div className="tabs">
        {[
          ["hunian", "Hunian"],
          ["perizinan", "Izin & Kunjungan"],
          ["pembinaan", "Pembinaan & Tahfidz"],
          ["kegiatan", "Kegiatan & Laundry"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "primary" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "hunian" && (
        <>
          {write && (
            <div className="ops-form-grid">
              <SimpleForm
                title="Tambah asrama"
                busy={state.busy}
                submit={mutate("boarding/dormitories", "Asrama ditambahkan.")}
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
                  { key: "description", label: "Keterangan", nullable: true },
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
                ]}
              />
              <SimpleForm
                title="Tambah tempat tidur"
                busy={state.busy}
                submit={mutate("boarding/beds", "Tempat tidur ditambahkan.")}
                fields={[
                  {
                    key: "room_id",
                    label: "Kamar",
                    rows: data.rooms,
                    rowLabel: (row) => `${row.dormitory_name} · ${row.name}`,
                  },
                  { key: "code", label: "Kode tempat tidur" },
                ]}
              />
              <SimpleForm
                title="Tempatkan siswa"
                busy={state.busy}
                submit={mutate("boarding/assignments", "Siswa ditempatkan.")}
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
            </div>
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
                            void state.run(async () => {
                              await send(`boarding/assignments/${row.id}/end`, {
                                end_date: new Date().toISOString().slice(0, 10),
                              });
                              await load();
                            }, "Penempatan diakhiri.")
                          }
                        >
                          Akhiri
                        </button>
                      )
                  : undefined
              }
            />
          </section>
        </>
      )}
      {tab === "perizinan" && (
        <>
          {write && (
            <div className="ops-form-grid">
              <SimpleForm
                title="Izin keluar"
                busy={state.busy}
                submit={mutate("boarding/leaves", "Permohonan izin dibuat.")}
                fields={[
                  studentField,
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
            </div>
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
                                void state.run(async () => {
                                  await send(
                                    `boarding/leaves/${row.id}/review`,
                                    {
                                      decision: "APPROVED",
                                      notes: "",
                                    },
                                  );
                                  await load();
                                }, "Izin disetujui.")
                              }
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() =>
                                void state.run(async () => {
                                  await send(
                                    `boarding/leaves/${row.id}/review`,
                                    {
                                      decision: "REJECTED",
                                      notes: "",
                                    },
                                  );
                                  await load();
                                }, "Izin ditolak.")
                              }
                            >
                              Tolak
                            </button>
                          </>
                        )}
                        {row.status === "APPROVED" && (
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(`boarding/leaves/${row.id}/status`, {
                                  status: "RETURNED",
                                });
                                await load();
                              }, "Kepulangan siswa dicatat.")
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
                            void state.run(async () => {
                              await send(`boarding/visits/${row.id}/status`, {
                                status: "COMPLETED",
                              });
                              await load();
                            }, "Kunjungan diselesaikan.")
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
      {tab === "pembinaan" && (
        <>
          {write && (
            <div className="ops-form-grid">
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
                  { key: "follow_up", label: "Tindak lanjut", nullable: true },
                ]}
              />
              <SimpleForm
                title="Setoran tahfidz"
                busy={state.busy}
                submit={mutate("boarding/tahfidz", "Setoran tahfidz disimpan.")}
                fields={[
                  studentField,
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
                  { key: "notes", label: "Catatan", nullable: true },
                ]}
              />
            </div>
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
                ]}
              />
            </section>
          </div>
        </>
      )}
      {tab === "kegiatan" && (
        <>
          {write && (
            <div className="ops-form-grid">
              <SimpleForm
                title="Aktivitas harian"
                busy={state.busy}
                submit={mutate("boarding/activities", "Aktivitas disimpan.")}
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
                  { key: "description", label: "Keterangan", nullable: true },
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
            </div>
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
                                void state.run(async () => {
                                  await send(
                                    `boarding/laundry/${row.id}/charge`,
                                    {},
                                  );
                                  await load();
                                }, "Biaya dipotong dari wallet.")
                              }
                            >
                              Bayar wallet
                            </button>
                          )}
                        {row.status === "WASHING" && (
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `boarding/laundry/${row.id}/status`,
                                  { status: "READY" },
                                );
                                await load();
                              }, "Laundry siap diambil.")
                            }
                          >
                            Siap
                          </button>
                        )}
                        {row.status === "READY" && (
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `boarding/laundry/${row.id}/status`,
                                  { status: "COLLECTED" },
                                );
                                await load();
                              }, "Laundry diambil.")
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
