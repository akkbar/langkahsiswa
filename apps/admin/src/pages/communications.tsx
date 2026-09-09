import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send, downloadReport } from "../api";
import {
  Catalog,
  can,
  Empty,
  ErrorBox,
  label,
  statusLabels,
} from "../components";
import { PageHeading, dateText, Status } from "./finance";
type Row = Record<string, any>;
const types: Record<string, string> = {
  EXAM: "Ujian",
  HOLIDAY: "Libur",
  SCHOOL_EVENT: "Kegiatan sekolah",
  PARENT_MEETING: "Pertemuan orang tua",
  PAYMENT_DEADLINE: "Jatuh tempo pembayaran",
  REPORT_PUBLICATION: "Penerbitan raport",
  ANNOUNCEMENT: "Pengumuman",
};
const targets: Record<string, string> = {
  ALL: "Seluruh sekolah",
  SCHOOL: "Unit sekolah",
  GRADE: "Tingkat",
  CLASS: "Kelas",
  STUDENT: "Siswa tertentu",
  TEACHER: "Guru tertentu",
  PARENT: "Orang tua tertentu",
};
const targetResources: Record<string, string> = {
  SCHOOL: "schools",
  GRADE: "grade-levels",
  CLASS: "classes",
  STUDENT: "students",
  TEACHER: "teachers",
  PARENT: "parents",
};
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
    } catch (e) {
      setError((e as Error).message);
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
      {state.success && (
        <div className="notice success" role="status">
          {state.success}
        </div>
      )}
    </>
  );
}
export function EventsPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const write = can(user, "event.write");
  const state = useAction();
  const [events, setEvents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);
  const initial = {
    title: "",
    description: "",
    type: "SCHOOL_EVENT",
    starts_at: "",
    ends_at: "",
    target_type: "ALL",
    target_id: "",
  };
  const [form, setForm] = useState(initial);
  async function load() {
    setEvents((await api("events")).data);
  }
  useEffect(() => {
    void state.run(load).finally(() => setLoading(false));
  }, []);
  const resource = targetResources[form.target_type];
  const options = catalog[resource] || [];
  return (
    <>
      <PageHeading
        title="Agenda sekolah"
        description="Kegiatan, pengumuman, dan tanggal penting untuk keluarga sekolah."
        eyebrow="KOMUNIKASI"
      />
      <Notices state={state} />
      <div
        className="actions"
        style={{ justifyContent: "space-between", marginBottom: 24 }}
      >
        <span className="muted small">{events.length} agenda tersedia</span>
        <div className="actions">
          <button disabled={state.busy} onClick={() => void state.run(load)}>
            Muat ulang agenda
          </button>
          {write && (
            <button className="primary" onClick={() => setCreate(!create)}>
              {create ? "Tutup formulir" : "Buat agenda"}
            </button>
          )}
        </div>
      </div>
      {create && write && (
        <form
          className="card padded stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void state.run(async () => {
              await send("events", {
                title: form.title,
                description: form.description,
                type: form.type,
                starts_at: new Date(form.starts_at).toISOString(),
                ...(form.ends_at
                  ? { ends_at: new Date(form.ends_at).toISOString() }
                  : {}),
                targets: [
                  {
                    type: form.target_type,
                    ...(form.target_id ? { target_id: form.target_id } : {}),
                  },
                ],
              });
              setForm(initial);
              setCreate(false);
              await load();
            }, "Agenda tersimpan sebagai draft. Publikasikan untuk memberi tahu penerima.");
          }}
        >
          <h2>Agenda baru</h2>
          <div className="form-grid">
            <label>
              Judul agenda
              <input
                required
                maxLength={150}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Jenis agenda
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {Object.entries(types).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mulai
              <input
                type="datetime-local"
                required
                value={form.starts_at}
                onChange={(e) =>
                  setForm({ ...form, starts_at: e.target.value })
                }
              />
            </label>
            <label>
              Selesai (opsional)
              <input
                type="datetime-local"
                min={form.starts_at}
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </label>
            <label>
              Penerima agenda
              <select
                value={form.target_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    target_type: e.target.value,
                    target_id: "",
                  })
                }
              >
                {Object.entries(targets).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {form.target_type !== "ALL" && (
              <label>
                Tujuan agenda
                <select
                  required
                  value={form.target_id}
                  onChange={(e) =>
                    setForm({ ...form, target_id: e.target.value })
                  }
                >
                  <option value="">
                    Pilih {targets[form.target_type].toLowerCase()}
                  </option>
                  {options.map((row) => (
                    <option key={row.id} value={row.id}>
                      {label(row, resource, catalog)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label>
            Deskripsi
            <textarea
              rows={4}
              maxLength={5000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="form-footer">
            <span className="muted">
              Penerima akan mendapatkan notifikasi setelah agenda
              dipublikasikan.
            </span>
            <button className="primary" disabled={state.busy}>
              Simpan draft agenda
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <Empty text="Memuat agenda…" />
      ) : !events.length ? (
        <div className="card">
          <Empty text="Belum ada agenda untuk Anda." />
        </div>
      ) : (
        <div className="event-list">
          {events.map((event) => (
            <article className="event-item" key={event.id}>
              <time className="event-date" dateTime={event.starts_at}>
                {new Date(event.starts_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })}
              </time>
              <div className="event-body">
                <div className="actions" style={{ marginBottom: 10 }}>
                  <span className="badge">
                    {types[event.type] || event.type}
                  </span>
                  <Status value={event.status} />
                </div>
                <h3>{event.title}</h3>
                <p className="muted small">
                  {dateText(event.starts_at)} ·{" "}
                  {new Date(event.starts_at).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {event.ends_at
                    ? ` hingga ${dateText(event.ends_at)} ${new Date(event.ends_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                </p>
                {event.description && <p>{event.description}</p>}
                {write && (
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Penerima:{" "}
                    {(event.targets || [])
                      .map((t: Row) =>
                        t.type === "ALL"
                          ? targets.ALL
                          : `${targets[t.type]} · ${label(
                              catalog[targetResources[t.type]]?.find(
                                (r) => r.id === t.target_id,
                              ),
                              targetResources[t.type],
                              catalog,
                            )}`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
              {write && event.status === "DRAFT" && (
                <button
                  disabled={state.busy}
                  className="primary"
                  onClick={() =>
                    void state.run(async () => {
                      await send(`events/${event.id}/publish`, {});
                      await load();
                    }, "Agenda dipublikasikan. Notifikasi tersedia untuk penerima.")
                  }
                >
                  Publikasikan agenda
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function NotificationsPage({ user }: { user: Actor }) {
  const manage = can(user, "event.write");
  const state = useAction();
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [deliveries, setDeliveries] = useState<Row[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDelivery, setShowDelivery] = useState(false);
  async function load() {
    const [n, d] = await Promise.all([
      api("notifications?limit=200"),
      manage
        ? api("notifications/deliveries")
        : Promise.resolve({ data: [], push_configured: false }),
    ]);
    setNotifications(n.data);
    setUnread(n.unread);
    setDeliveries(d.data);
    setConfigured(d.push_configured);
  }
  useEffect(() => {
    void state.run(load).finally(() => setLoading(false));
  }, []);
  function target(n: Row) {
    const data = n.data || {};
    return data.invoice_id
      ? "billing"
      : data.type?.includes("WALLET") ||
          data.type?.includes("TOPUP") ||
          data.type?.includes("PURCHASE")
        ? "wallet"
        : data.report_card_id
          ? "report-cards"
          : n.event_id || data.event_id
            ? "events"
            : "";
  }
  return (
    <>
      <PageHeading
        title="Notifikasi"
        description="Kabar sekolah dan pembaruan aktivitas siswa untuk akun Anda."
        eyebrow="KOMUNIKASI"
      />
      <Notices state={state} />
      <div
        className="actions"
        style={{ justifyContent: "space-between", marginBottom: 24 }}
      >
        <span className="badge">{unread} belum dibaca</span>
        <div className="actions">
          <button disabled={state.busy} onClick={() => void state.run(load)}>
            Muat ulang notifikasi
          </button>
          {manage && (
            <button onClick={() => setShowDelivery(!showDelivery)}>
              {showDelivery ? "Tutup pengiriman" : "Status pengiriman push"}
            </button>
          )}
        </div>
      </div>
      <section className="card">
        {loading ? (
          <Empty text="Memuat notifikasi…" />
        ) : !notifications.length ? (
          <Empty text="Belum ada notifikasi. Kabar terbaru akan muncul di sini." />
        ) : (
          notifications.map((n) => (
            <article
              className={`notification-item ${!n.read_at ? "notification-unread" : ""}`}
              key={n.id}
            >
              <div
                className="actions"
                style={{ justifyContent: "space-between", marginBottom: 8 }}
              >
                <h3>{n.title}</h3>
                <span className="small muted">{dateText(n.created_at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
              <div className="actions">
                {!n.read_at ? (
                  <button
                    disabled={state.busy}
                    onClick={() =>
                      void state.run(async () => {
                        await send(`notifications/${n.id}/read`, {}, "PATCH");
                        await load();
                      })
                    }
                  >
                    Tandai sudah dibaca
                  </button>
                ) : (
                  <span className="small muted">Sudah dibaca</span>
                )}
                {target(n) && (
                  <a className="text-link" href={`#${target(n)}`}>
                    Buka rincian →
                  </a>
                )}
              </div>
            </article>
          ))
        )}
      </section>
      {manage && showDelivery && (
        <section className="card">
          <div className="toolbar">
            <div>
              <strong>Pengiriman ke perangkat</strong>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                {configured
                  ? "Layanan push aktif. Antrean diproses secara berkala."
                  : "Layanan push belum aktif. Notifikasi tetap tersedia di aplikasi."}
              </p>
            </div>
            <button
              className="primary"
              disabled={state.busy || !configured}
              onClick={() =>
                void state.run(async () => {
                  const r = await send("notifications/dispatch", {});
                  if (!r.push_configured)
                    throw new Error("Layanan push belum dikonfigurasi.");
                  await load();
                }, "Antrean pengiriman telah diproses.")
              }
            >
              Proses antrean
            </button>
          </div>
          {!deliveries.length ? (
            <Empty text="Belum ada pengiriman ke perangkat terdaftar." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Notifikasi</th>
                    <th>Status</th>
                    <th>Percobaan</th>
                    <th>Keterangan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.title}
                        <div className="small muted">
                          {dateText(d.created_at)}
                        </div>
                      </td>
                      <td>
                        <Status value={d.status} />
                      </td>
                      <td>{d.attempts}</td>
                      <td>{d.last_error || "—"}</td>
                      <td>
                        {d.status === "FAILED" && (
                          <button
                            disabled={state.busy}
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `notifications/deliveries/${d.id}/retry`,
                                  {},
                                );
                                await load();
                              }, "Pengiriman dimasukkan kembali ke antrean.")
                            }
                          >
                            Coba ulang
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function PortalPage() {
  const state = useAction();
  const [students, setStudents] = useState<Row[]>([]);
  const [student, setStudent] = useState("");
  const [overview, setOverview] = useState<Row | null>(null);
  const [section, setSection] = useState("schedule");
  useEffect(() => {
    void state.run(async () => {
      const r = await api("portal/students");
      setStudents(r.data);
      if (r.data[0]) setStudent(r.data[0].id);
    });
  }, []);
  useEffect(() => {
    setOverview(null);
    if (student)
      void state.run(async () =>
        setOverview(await api(`portal/overview?student_id=${student}`)),
      );
  }, [student]);
  const days: Record<string, string> = {
    1: "Senin",
    2: "Selasa",
    3: "Rabu",
    4: "Kamis",
    5: "Jumat",
    6: "Sabtu",
    7: "Minggu",
  };
  return (
    <>
      <PageHeading
        title="Ringkasan siswa"
        description="Ikuti jadwal, kehadiran, nilai, dan raport siswa yang terhubung."
        eyebrow="AKADEMIK"
      />
      <Notices state={state} />
      <div className="inline-filter">
        <label>
          Siswa
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Pilih siswa</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.nis}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!student ? (
        <Empty text="Belum ada siswa yang terhubung dengan akun ini." />
      ) : !overview ? (
        <Empty text="Memuat ringkasan siswa…" />
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric accent">
              <span className="muted">Siswa</span>
              <strong>{overview.student.name}</strong>
            </div>
            <div className="metric">
              <span className="muted">Kehadiran tercatat</span>
              <strong>{overview.attendance.length}</strong>
            </div>
            <div className="metric">
              <span className="muted">Raport terbit</span>
              <strong>{overview.reports.length}</strong>
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="Ringkasan akademik">
            {Object.entries({
              schedule: "Jadwal",
              attendance: "Kehadiran",
              grades: "Nilai",
              reports: "Raport",
            }).map(([key, title]) => (
              <button
                role="tab"
                aria-selected={section === key}
                aria-controls="portal-content"
                key={key}
                onClick={() => setSection(key)}
                className={section === key ? "primary" : ""}
              >
                {title}
              </button>
            ))}
          </div>
          <section className="card" id="portal-content" role="tabpanel">
            {!overview[section]?.length ? (
              <Empty text="Belum ada data untuk bagian ini." />
            ) : (
              <div className="table-wrap">
                <table>
                  {section === "schedule" ? (
                    <>
                      <thead>
                        <tr>
                          <th>Hari</th>
                          <th>Waktu</th>
                          <th>Pelajaran</th>
                          <th>Guru / Ruangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.schedule.map((s: Row) => (
                          <tr key={s.id}>
                            <td>{days[s.day_of_week] || s.day_of_week}</td>
                            <td>
                              {s.start_time.slice(0, 5)} –{" "}
                              {s.end_time.slice(0, 5)}
                            </td>
                            <td>
                              {s.subject_name}
                              <div className="small muted">{s.class_name}</div>
                            </td>
                            <td>
                              {s.teacher_name}
                              <div className="small muted">{s.room || "—"}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : section === "attendance" ? (
                    <>
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Kelas</th>
                          <th>Status</th>
                          <th>Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.attendance.map((s: Row) => (
                          <tr key={s.id}>
                            <td>{dateText(s.date)}</td>
                            <td>{s.class_name}</td>
                            <td>{statusLabels[s.status] || s.status}</td>
                            <td>{s.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : section === "grades" ? (
                    <>
                      <thead>
                        <tr>
                          <th>Pelajaran</th>
                          <th>Penilaian</th>
                          <th>Nilai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.grades.map((s: Row) => (
                          <tr key={s.id}>
                            <td>{s.subject_name}</td>
                            <td>
                              {s.assessment_name}
                              <div className="small muted">
                                {s.category_name}
                              </div>
                            </td>
                            <td>
                              {s.score} / {s.max_score}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead>
                        <tr>
                          <th>Kelas / Semester</th>
                          <th>Terbit</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.reports.map((s: Row) => (
                          <tr key={s.id}>
                            <td>
                              {s.class_name} · {s.semester_name}
                            </td>
                            <td>{dateText(s.published_at)}</td>
                            <td>
                              <button
                                disabled={state.busy}
                                onClick={() =>
                                  void state.run(() => downloadReport(s.id))
                                }
                              >
                                Unduh PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
