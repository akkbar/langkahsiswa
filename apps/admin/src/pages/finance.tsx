import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, all, send, downloadFile } from "../api";
import { Empty, ErrorBox } from "../components";

type Row = Record<string, any>;
export const financeAdmin = (user: Actor) =>
  user.roles.some((r) =>
    ["SUPER_ADMIN", "SCHOOL_ADMIN", "FINANCE"].includes(r),
  );
export const financeAccess = (user: Actor) =>
  financeAdmin(user) ||
  user.roles.some((r) => ["PARENT", "STUDENT"].includes(r));
export const money = (amount: unknown) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
export const dateText = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const labels: Record<string, string> = {
  UNPAID: "Belum dibayar",
  PARTIAL: "Dibayar sebagian",
  PAID: "Lunas",
  PENDING: "Menunggu verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  DRAFT: "Draft",
  PUBLISHED: "Terbit",
  SENT: "Terkirim",
  FAILED: "Gagal",
  QUEUED: "Antrean",
  TOPUP: "Isi saldo",
  PURCHASE: "Pembelian",
  REFUND: "Pengembalian",
  ADJUSTMENT: "Penyesuaian",
};
export function Status({ value }: { value: string }) {
  return (
    <span className={`badge status-${String(value).toLowerCase()}`}>
      {labels[value] || value}
    </span>
  );
}
export function PageHeading({
  title,
  description,
  eyebrow = "KEUANGAN SEKOLAH",
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
    </div>
  );
}
function StudentSelect({
  students,
  value,
  onChange,
  optional = false,
}: {
  students: Row[];
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  return (
    <label>
      Siswa
      <select
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{optional ? "Semua siswa" : "Pilih siswa"}</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.student_name} · {s.nis}
          </option>
        ))}
      </select>
    </label>
  );
}
function Amount({
  title = "Jumlah (Rp)",
  value,
  onChange,
  required = true,
  min = 1,
}: {
  title?: string;
  value: number | string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: number;
}) {
  return (
    <label>
      {title}
      <input
        type="number"
        min={min}
        step="1"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { error, success, busy, run, setError };
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
async function uploadProof(student_id: string, file: File | null) {
  if (!file) throw new Error("Pilih bukti transfer terlebih dahulu.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Ukuran bukti transfer maksimal 2 MB.");
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
    throw new Error("Gunakan berkas PNG, JPEG, atau PDF.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Berkas tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
  return send("payment-proofs", {
    student_id,
    file_name: file.name,
    mime_type: file.type,
    data_base64: data,
  });
}
function ProofInput({ onChange }: { onChange: (file: File | null) => void }) {
  return (
    <label>
      Bukti transfer
      <input
        required
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      <span className="helper">PNG, JPEG, atau PDF. Maksimal 2 MB.</span>
    </label>
  );
}

export function BillingPage({ user }: { user: Actor }) {
  const admin = financeAdmin(user);
  const state = useAction();
  const [students, setStudents] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [fees, setFees] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);
  const [invoice, setInvoice] = useState({
    student_id: "",
    title: "",
    due_date: "",
    fee_type_id: "",
    amount: "",
  });
  const [fee, setFee] = useState({ name: "", amount: "" });
  const [proof, setProof] = useState<File | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [reference, setReference] = useState("");
  const [review, setReview] = useState<Row | null>(null);
  const [notes, setNotes] = useState("");
  async function load() {
    const [s, i, f, p] = await Promise.all([
      all("finance/students"),
      api(`invoices?limit=100${filter ? `&student_id=${filter}` : ""}`),
      admin ? api("fee-types?limit=100") : Promise.resolve({ data: [] }),
      admin
        ? api("payments?status=PENDING&limit=100")
        : Promise.resolve({ data: [] }),
    ]);
    setStudents(s);
    setInvoices(i.data);
    setFees(f.data);
    setPayments(p.data);
  }
  useEffect(() => {
    setLoading(true);
    void state.run(load).finally(() => setLoading(false));
  }, [filter]);
  async function openInvoice(id: string) {
    const data = await api(`invoices/${id}`);
    const pending = (data.payments || [])
      .filter((p: Row) => p.status === "PENDING")
      .reduce((n: number, p: Row) => n + Number(p.amount), 0);
    setSelected(data);
    setPayAmount(
      String(
        Math.max(
          0,
          Number(data.total_amount || data.total) -
            Number(data.paid_amount || 0) -
            pending,
        ),
      ),
    );
    setProof(null);
    setReference("");
  }
  const total = invoices.reduce(
    (n, i) => n + Number(i.total_amount || i.total || 0),
    0,
  );
  const paid = invoices.reduce((n, i) => n + Number(i.paid_amount || 0), 0);
  return (
    <>
      <PageHeading
        title="Tagihan sekolah"
        description="Tagihan siswa, bukti transfer, dan verifikasi pembayaran dalam satu alur."
      />
      <Notices state={state} />
      <div className="metric-grid">
        <div className="metric accent">
          <span className="muted">Total tagihan ditampilkan</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="metric">
          <span className="muted">Sudah dibayar</span>
          <strong>{money(paid)}</strong>
        </div>
        <div className="metric">
          <span className="muted">Belum dilunasi</span>
          <strong>{money(total - paid)}</strong>
        </div>
      </div>
      <div
        className="actions"
        style={{ justifyContent: "space-between", marginBottom: 24 }}
      >
        <div className="inline-filter" style={{ margin: 0, minWidth: 230 }}>
          <StudentSelect
            students={students}
            value={filter}
            onChange={setFilter}
            optional
          />
        </div>
        {admin && (
          <button className="primary" onClick={() => setCreate(!create)}>
            {create ? "Tutup formulir" : "Buat tagihan"}
          </button>
        )}
      </div>
      {create && admin && (
        <div className="split-grid">
          <form
            aria-label="Tagihan baru"
            className="card padded stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void state.run(async () => {
                await send("invoices", {
                  student_id: invoice.student_id,
                  title: invoice.title,
                  due_date: invoice.due_date,
                  items: [
                    {
                      ...(invoice.fee_type_id
                        ? { fee_type_id: invoice.fee_type_id }
                        : {}),
                      description: invoice.title,
                      quantity: 1,
                      unit_amount: Number(invoice.amount),
                    },
                  ],
                });
                setCreate(false);
                setInvoice({
                  student_id: "",
                  title: "",
                  due_date: "",
                  fee_type_id: "",
                  amount: "",
                });
                await load();
              }, "Tagihan berhasil dibuat.");
            }}
          >
            <h2>Tagihan baru</h2>
            <StudentSelect
              students={students}
              value={invoice.student_id}
              onChange={(v) => setInvoice({ ...invoice, student_id: v })}
            />
            <label>
              Jenis biaya
              <select
                value={invoice.fee_type_id}
                onChange={(e) => {
                  const f = fees.find((r) => r.id === e.target.value);
                  setInvoice({
                    ...invoice,
                    fee_type_id: e.target.value,
                    ...(f ? { title: f.name, amount: String(f.amount) } : {}),
                  });
                }}
              >
                <option value="">Biaya khusus</option>
                {fees
                  .filter((f) => f.active !== false)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Nama tagihan
              <input
                required
                maxLength={160}
                value={invoice.title}
                onChange={(e) =>
                  setInvoice({ ...invoice, title: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <Amount
                value={invoice.amount}
                onChange={(v) => setInvoice({ ...invoice, amount: v })}
              />
              <label>
                Jatuh tempo
                <input
                  type="date"
                  required
                  value={invoice.due_date}
                  onChange={(e) =>
                    setInvoice({ ...invoice, due_date: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="primary" disabled={state.busy}>
              Simpan tagihan
            </button>
          </form>
          <form
            className="card padded stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void state.run(async () => {
                await send("fee-types", {
                  name: fee.name,
                  amount: Number(fee.amount),
                });
                setFee({ name: "", amount: "" });
                await load();
              }, "Jenis biaya berhasil disimpan.");
            }}
          >
            <h2>Jenis biaya</h2>
            <p className="muted small">
              Simpan biaya yang sering digunakan untuk tagihan berikutnya.
            </p>
            <label>
              Nama jenis biaya
              <input
                required
                maxLength={160}
                value={fee.name}
                onChange={(e) => setFee({ ...fee, name: e.target.value })}
              />
            </label>
            <Amount
              title="Nominal standar (Rp)"
              value={fee.amount}
              onChange={(v) => setFee({ ...fee, amount: v })}
            />
            <button disabled={state.busy}>Tambah jenis biaya</button>
          </form>
        </div>
      )}
      <section className="card">
        <div className="toolbar">
          <strong>{invoices.length} tagihan</strong>
          <button disabled={state.busy} onClick={() => void state.run(load)}>
            Muat ulang
          </button>
        </div>
        {loading ? (
          <Empty text="Memuat tagihan…" />
        ) : !invoices.length ? (
          <Empty text="Belum ada tagihan untuk siswa ini." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Siswa / Tagihan</th>
                  <th>Jatuh tempo</th>
                  <th>Jumlah</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.student_name ||
                        students.find((s) => s.id === i.student_id)?.name}
                      <div className="small muted">{i.title}</div>
                    </td>
                    <td>{dateText(i.due_date)}</td>
                    <td>{money(i.total_amount || i.total)}</td>
                    <td>
                      <Status value={i.status} />
                    </td>
                    <td>
                      <button
                        disabled={state.busy}
                        onClick={() => void state.run(() => openInvoice(i.id))}
                      >
                        Lihat tagihan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <section className="card padded detail-panel">
          <div className="page-title">
            <div>
              <h2>{selected.title}</h2>
              <p className="muted">
                {selected.student_name} · Jatuh tempo{" "}
                {dateText(selected.due_date)}
              </p>
            </div>
            <button onClick={() => setSelected(null)}>Tutup rincian</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rincian</th>
                  <th>Jumlah</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(selected.items || []).map((i: Row) => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>{i.quantity}</td>
                    <td>{money(Number(i.quantity) * Number(i.unit_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cart-total">
            <span>Sisa tagihan</span>
            <strong>
              {money(
                Number(selected.total_amount || selected.total) -
                  Number(selected.paid_amount || 0),
              )}
            </strong>
          </div>
          {(selected.payments || []).length > 0 && (
            <div className="event-list" style={{ marginBottom: 24 }}>
              {selected.payments.map((p: Row) => (
                <div className="cart-row" key={p.id}>
                  <div>
                    {money(p.amount)}{" "}
                    <span className="small muted">
                      {dateText(p.created_at)}
                    </span>
                    {p.notes && <p className="small muted">{p.notes}</p>}
                  </div>
                  <Status value={p.status} />
                </div>
              ))}
            </div>
          )}
          {selected.status !== "PAID" && (
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void state.run(async () => {
                  const uploaded = await uploadProof(
                    selected.student_id,
                    proof,
                  );
                  await send(`invoices/${selected.id}/payments`, {
                    amount: Number(payAmount),
                    proof_id: uploaded.id,
                    reference,
                  });
                  await openInvoice(selected.id);
                  await load();
                }, "Bukti pembayaran dikirim. Menunggu verifikasi keuangan.");
              }}
            >
              <h2>Kirim pembayaran</h2>
              <div className="form-grid">
                <Amount value={payAmount} onChange={setPayAmount} />
                <label>
                  Referensi transfer
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Opsional"
                  />
                </label>
                <ProofInput
                  key={selected.id + String(selected.payments?.length)}
                  onChange={setProof}
                />
              </div>
              <div className="form-footer">
                <span className="muted">
                  Pembayaran dicatat setelah diverifikasi oleh keuangan.
                </span>
                <button className="primary" disabled={state.busy}>
                  Kirim bukti pembayaran
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {admin && (
        <section className="card">
          <div className="toolbar">
            <strong>Verifikasi pembayaran</strong>
            <span className="badge">{payments.length} menunggu</span>
          </div>
          {!payments.length ? (
            <Empty text="Tidak ada pembayaran yang menunggu verifikasi." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Siswa / Tagihan</th>
                    <th>Jumlah</th>
                    <th>Tanggal</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.student_name}
                        <div className="small muted">
                          {p.invoice_title || p.title || p.reference}
                        </div>
                      </td>
                      <td>{money(p.amount)}</td>
                      <td>{dateText(p.created_at)}</td>
                      <td>
                        <div className="actions">
                          <button
                            disabled={state.busy}
                            onClick={() =>
                              void state.run(() =>
                                downloadFile(
                                  `payment-proofs/${p.proof_id}/file`,
                                  p.file_name || "bukti-transfer",
                                ),
                              )
                            }
                          >
                            Unduh bukti
                          </button>
                          <button
                            onClick={() => {
                              setReview(p);
                              setNotes("");
                            }}
                          >
                            Periksa pembayaran
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {review && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-payment-title"
          >
            <div className="modal-heading">
              <h2 id="review-payment-title">Verifikasi pembayaran</h2>
              <button
                onClick={() => setReview(null)}
                aria-label="Tutup verifikasi"
              >
                ×
              </button>
            </div>
            <p>
              {review.student_name} · <strong>{money(review.amount)}</strong>
            </p>
            <label>
              Catatan verifikasi
              <textarea
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="form-footer">
              <button
                disabled={state.busy}
                onClick={() =>
                  void state.run(async () => {
                    await send(`payments/${review.id}/verify`, {
                      decision: "REJECTED",
                      notes,
                    });
                    setReview(null);
                    await load();
                    if (selected) await openInvoice(selected.id);
                  }, "Pembayaran ditolak.")
                }
              >
                Tolak pembayaran
              </button>
              <button
                className="primary"
                disabled={state.busy}
                onClick={() =>
                  void state.run(async () => {
                    await send(`payments/${review.id}/verify`, {
                      decision: "APPROVED",
                      notes,
                    });
                    setReview(null);
                    await load();
                    if (selected) await openInvoice(selected.id);
                  }, "Pembayaran disetujui.")
                }
              >
                Setujui pembayaran
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function WalletPage({ user }: { user: Actor }) {
  const admin = financeAdmin(user);
  const manage = admin || user.roles.includes("PARENT");
  const state = useAction();
  const [students, setStudents] = useState<Row[]>([]);
  const [student, setStudent] = useState("");
  const [wallet, setWallet] = useState<Row | null>(null);
  const [merchants, setMerchants] = useState<Row[]>([]);
  const [topups, setTopups] = useState<Row[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [limits, setLimits] = useState({
    daily: "",
    monthly: "",
    category: "",
    category_amount: "",
    category_limits: {} as Record<string, number>,
    blocked: [] as string[],
  });
  const [review, setReview] = useState<Row | null>(null);
  const [notes, setNotes] = useState("");
  async function load() {
    const [s, m, t] = await Promise.all([
      all("finance/students"),
      api("wallet-merchants?limit=100"),
      api("wallet-topups?limit=100"),
    ]);
    const rows = s;
    setStudents(rows);
    setMerchants(m.data);
    setTopups(t.data);
    if (!student && rows[0]) setStudent(rows[0].id);
  }
  async function loadWallet() {
    if (!student) return;
    const w = await api(`wallets/${student}`);
    setWallet(w);
    setLimits({
      daily: w.limits?.daily_limit ?? "",
      monthly: w.limits?.monthly_limit ?? "",
      category: "",
      category_amount: "",
      category_limits: w.limits?.category_limits || {},
      blocked: w.limits?.blocked_merchant_ids || [],
    });
  }
  useEffect(() => {
    void state.run(load);
  }, []);
  useEffect(() => {
    setWallet(null);
    void state.run(loadWallet);
  }, [student]);
  const pending = topups.filter(
    (t) => t.status === "PENDING" && (admin || t.student_id === student),
  );
  return (
    <>
      <PageHeading
        title="Dompet siswa"
        description="Pantau saldo, pengeluaran, dan batas belanja siswa."
      />
      <Notices state={state} />
      <div className="inline-filter">
        <StudentSelect
          students={students}
          value={student}
          onChange={setStudent}
        />
      </div>
      {!student ? (
        <Empty text="Belum ada siswa yang terhubung dengan akun ini." />
      ) : !wallet ? (
        <Empty text="Memuat dompet siswa…" />
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric accent">
              <span className="muted">Saldo tersedia</span>
              <strong>{money(wallet.balance)}</strong>
            </div>
            <div className="metric">
              <span className="muted">Belanja hari ini</span>
              <strong>{money(wallet.today_spending)}</strong>
            </div>
            <div className="metric">
              <span className="muted">Belanja bulan ini</span>
              <strong>{money(wallet.month_spending)}</strong>
            </div>
          </div>
          <div className="split-grid">
            <form
              className="card padded stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void state.run(async () => {
                  const proof = await uploadProof(student, file);
                  await send("wallet-topups", {
                    student_id: student,
                    amount: Number(amount),
                    proof_id: proof.id,
                    reference,
                  });
                  setAmount("");
                  setReference("");
                  setFile(null);
                  setFileKey((k) => k + 1);
                  await load();
                }, "Permintaan isi saldo dikirim untuk diverifikasi.");
              }}
            >
              <h2>Isi saldo</h2>
              <p className="muted small">
                Transfer sesuai nominal, lalu unggah bukti. Saldo bertambah
                setelah persetujuan keuangan.
              </p>
              <Amount value={amount} onChange={setAmount} />
              <label>
                Referensi transfer
                <input
                  value={reference}
                  maxLength={160}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Opsional"
                />
              </label>
              <ProofInput key={fileKey} onChange={setFile} />
              <button className="primary" disabled={state.busy}>
                Kirim permintaan isi saldo
              </button>
            </form>
            {manage ? (
              <form
                className="card padded stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void state.run(async () => {
                    await send(
                      `wallets/${student}/limits`,
                      {
                        daily_limit:
                          limits.daily === "" ? null : Number(limits.daily),
                        monthly_limit:
                          limits.monthly === "" ? null : Number(limits.monthly),
                        category_limits: limits.category_limits,
                        blocked_merchant_ids: limits.blocked,
                      },
                      "PUT",
                    );
                    await loadWallet();
                  }, "Batas belanja disimpan.");
                }}
              >
                <h2>Atur batas belanja</h2>
                <div className="form-grid">
                  <Amount
                    title="Batas harian (Rp)"
                    min={0}
                    required={false}
                    value={limits.daily}
                    onChange={(v) => setLimits({ ...limits, daily: v })}
                  />
                  <Amount
                    title="Batas bulanan (Rp)"
                    min={0}
                    required={false}
                    value={limits.monthly}
                    onChange={(v) => setLimits({ ...limits, monthly: v })}
                  />
                </div>
                <p className="helper">
                  Kosongkan untuk tanpa batas. Nilai 0 menghentikan belanja.
                </p>
                <fieldset className="stack-form">
                  <legend>Batas per kategori</legend>
                  <div className="form-grid">
                    <label>
                      Kategori
                      <select
                        value={limits.category}
                        onChange={(e) =>
                          setLimits({ ...limits, category: e.target.value })
                        }
                      >
                        <option value="">Pilih kategori</option>
                        {[
                          ...new Set(merchants.map((m) => String(m.category))),
                        ].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <Amount
                      title="Batas kategori / bulan (Rp)"
                      min={0}
                      required={false}
                      value={limits.category_amount}
                      onChange={(v) =>
                        setLimits({ ...limits, category_amount: v })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!limits.category || limits.category_amount === ""}
                    onClick={() =>
                      setLimits({
                        ...limits,
                        category_limits: {
                          ...limits.category_limits,
                          [limits.category]: Number(limits.category_amount),
                        },
                        category: "",
                        category_amount: "",
                      })
                    }
                  >
                    Tambahkan batas kategori
                  </button>
                  {Object.entries(limits.category_limits).map(([c, v]) => (
                    <div className="cart-row" key={c}>
                      <span>
                        {c} · {money(v)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Hapus batas ${c}`}
                        onClick={() => {
                          const next = { ...limits.category_limits };
                          delete next[c];
                          setLimits({ ...limits, category_limits: next });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Blokir merchant</legend>
                  {merchants.length ? (
                    merchants.map((m) => (
                      <label className="check" key={m.id}>
                        <input
                          type="checkbox"
                          checked={limits.blocked.includes(m.id)}
                          onChange={(e) =>
                            setLimits({
                              ...limits,
                              blocked: e.target.checked
                                ? [...limits.blocked, m.id]
                                : limits.blocked.filter((id) => id !== m.id),
                            })
                          }
                        />
                        {m.name} <span className="helper">{m.category}</span>
                      </label>
                    ))
                  ) : (
                    <p className="helper">Belum ada merchant.</p>
                  )}
                </fieldset>
                <button disabled={state.busy}>Simpan batas belanja</button>
              </form>
            ) : (
              <div className="card padded">
                <h2>Batas belanja</h2>
                <p className="muted">
                  Harian:{" "}
                  {wallet.limits?.daily_limit == null
                    ? "Tanpa batas"
                    : money(wallet.limits.daily_limit)}
                </p>
                <p className="muted">
                  Bulanan:{" "}
                  {wallet.limits?.monthly_limit == null
                    ? "Tanpa batas"
                    : money(wallet.limits.monthly_limit)}
                </p>
              </div>
            )}
          </div>
          <section className="card">
            <div className="toolbar">
              <strong>Riwayat transaksi</strong>
              <button
                disabled={state.busy}
                onClick={() => void state.run(loadWallet)}
              >
                Muat ulang saldo
              </button>
            </div>
            {!wallet.transactions?.length ? (
              <Empty text="Belum ada transaksi dompet." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Transaksi</th>
                      <th>Tanggal</th>
                      <th>Jumlah</th>
                      <th>Saldo akhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.transactions.map((t: Row) => (
                      <tr key={t.id}>
                        <td>
                          {labels[t.type] || t.type}
                          <div className="muted small">
                            {t.merchant_name || t.description}
                          </div>
                        </td>
                        <td>{dateText(t.created_at)}</td>
                        <td
                          className={
                            Number(t.amount) < 0
                              ? "amount-negative"
                              : "amount-positive"
                          }
                        >
                          {money(t.amount)}
                        </td>
                        <td>{money(t.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <section className="card">
        <div className="toolbar">
          <strong>{admin ? "Verifikasi isi saldo" : "Status isi saldo"}</strong>
          <span className="badge">{pending.length} menunggu</span>
        </div>
        {!topups.filter((t) => admin || t.student_id === student).length ? (
          <Empty text="Belum ada permintaan isi saldo." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Jumlah</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {topups
                  .filter((t) => admin || t.student_id === student)
                  .map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.student_name ||
                          students.find((s) => s.id === t.student_id)?.name}
                        <div className="muted small">
                          {dateText(t.created_at)}
                        </div>
                      </td>
                      <td>{money(t.amount)}</td>
                      <td>
                        <Status value={t.status} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            disabled={state.busy}
                            onClick={() =>
                              void state.run(() =>
                                downloadFile(
                                  `payment-proofs/${t.proof_id}/file`,
                                  t.file_name || "bukti-isi-saldo",
                                ),
                              )
                            }
                          >
                            Unduh bukti
                          </button>
                          {admin && t.status === "PENDING" && (
                            <button
                              onClick={() => {
                                setReview(t);
                                setNotes("");
                              }}
                            >
                              Periksa isi saldo
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {review && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="topup-title"
          >
            <div className="modal-heading">
              <h2 id="topup-title">Verifikasi isi saldo</h2>
              <button
                aria-label="Tutup verifikasi"
                onClick={() => setReview(null)}
              >
                ×
              </button>
            </div>
            <p>
              {review.student_name} · <strong>{money(review.amount)}</strong>
            </p>
            <label>
              Catatan verifikasi
              <textarea
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="form-footer">
              {["REJECTED", "APPROVED"].map((decision) => (
                <button
                  key={decision}
                  className={decision === "APPROVED" ? "primary" : ""}
                  disabled={state.busy}
                  onClick={() =>
                    void state.run(
                      async () => {
                        await send(`wallet-topups/${review.id}/verify`, {
                          decision,
                          notes,
                        });
                        setReview(null);
                        await load();
                        await loadWallet();
                      },
                      decision === "APPROVED"
                        ? "Isi saldo disetujui dan saldo diperbarui."
                        : "Permintaan isi saldo ditolak.",
                    )
                  }
                >
                  {decision === "APPROVED"
                    ? "Setujui isi saldo"
                    : "Tolak isi saldo"}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function PosPage() {
  const state = useAction();
  const [merchants, setMerchants] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [merchant, setMerchant] = useState("");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Row[]>([]);
  const [student, setStudent] = useState<Row | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [manage, setManage] = useState(false);
  const [newMerchant, setNewMerchant] = useState({
    name: "",
    category: "Kantin",
  });
  const [product, setProduct] = useState({ name: "", price: "", stock: "" });
  const [checkoutKey, setCheckoutKey] = useState(() => crypto.randomUUID());
  async function load() {
    const [m, p] = await Promise.all([
      api("wallet-merchants?limit=100"),
      api("products?limit=100"),
    ]);
    setMerchants(m.data);
    setProducts(p.data);
    if (!merchant && m.data[0]) setMerchant(m.data[0].id);
  }
  useEffect(() => {
    void state.run(load);
  }, []);
  const items = products.filter((p) => cart[p.id] > 0);
  const total = items.reduce((n, p) => n + Number(p.price) * cart[p.id], 0);
  const changeCart = (id: string, quantity: number) => {
    setCart({ ...cart, [id]: Math.max(0, quantity) });
    setCheckoutKey(crypto.randomUUID());
    setReceipt(null);
  };
  return (
    <>
      <PageHeading
        title="Kasir kantin"
        description="Cari siswa, pilih barang, dan bayar menggunakan saldo dompet."
        eyebrow="POINT OF SALE"
      />
      <Notices state={state} />
      <div
        className="actions"
        style={{ justifyContent: "space-between", marginBottom: 24 }}
      >
        <div className="inline-filter" style={{ margin: 0, minWidth: 230 }}>
          <label>
            Merchant
            <select
              value={merchant}
              onChange={(e) => {
                setMerchant(e.target.value);
                setCart({});
                setCheckoutKey(crypto.randomUUID());
              }}
            >
              <option value="">Pilih merchant</option>
              {merchants
                .filter((m) => m.active !== false)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button onClick={() => setManage(!manage)}>
          {manage ? "Tutup katalog" : "Kelola katalog"}
        </button>
      </div>
      {manage && (
        <div className="split-grid">
          <form
            className="card padded stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void state.run(async () => {
                const m = await send("wallet-merchants", newMerchant);
                setMerchant(m.id);
                setNewMerchant({ name: "", category: "Kantin" });
                await load();
              }, "Merchant berhasil ditambahkan.");
            }}
          >
            <h2>Tambah merchant</h2>
            <label>
              Nama merchant
              <input
                required
                maxLength={160}
                value={newMerchant.name}
                onChange={(e) =>
                  setNewMerchant({ ...newMerchant, name: e.target.value })
                }
              />
            </label>
            <label>
              Kategori merchant
              <input
                required
                maxLength={80}
                value={newMerchant.category}
                onChange={(e) =>
                  setNewMerchant({ ...newMerchant, category: e.target.value })
                }
              />
            </label>
            <button disabled={state.busy}>Simpan merchant</button>
          </form>
          <form
            className="card padded stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void state.run(async () => {
                await send("products", {
                  merchant_id: merchant,
                  name: product.name,
                  price: Number(product.price),
                  stock: product.stock === "" ? null : Number(product.stock),
                });
                setProduct({ name: "", price: "", stock: "" });
                await load();
              }, "Produk berhasil ditambahkan.");
            }}
          >
            <h2>Tambah produk</h2>
            <p className="muted small">
              Merchant:{" "}
              {merchants.find((m) => m.id === merchant)?.name ||
                "Pilih merchant terlebih dahulu"}
            </p>
            <label>
              Nama produk
              <input
                required
                maxLength={160}
                value={product.name}
                onChange={(e) =>
                  setProduct({ ...product, name: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <Amount
                title="Harga produk (Rp)"
                value={product.price}
                onChange={(v) => setProduct({ ...product, price: v })}
              />
              <Amount
                title="Stok (kosong = tak terbatas)"
                required={false}
                min={0}
                value={product.stock}
                onChange={(v) => setProduct({ ...product, stock: v })}
              />
            </div>
            <button disabled={state.busy || !merchant}>Simpan produk</button>
          </form>
        </div>
      )}
      <div className="split-grid">
        <section className="card padded">
          <div className="section-title">
            <h2>Pilih barang</h2>
            <p className="muted small">
              {merchants.find((m) => m.id === merchant)?.name ||
                "Pilih merchant untuk melihat produk"}
            </p>
          </div>
          {products.filter(
            (p) => p.merchant_id === merchant && p.active !== false,
          ).length ? (
            <div className="product-grid">
              {products
                .filter((p) => p.merchant_id === merchant && p.active !== false)
                .map((p) => (
                  <button
                    className="product-button"
                    key={p.id}
                    disabled={
                      state.busy ||
                      (p.stock !== null && Number(p.stock) <= (cart[p.id] || 0))
                    }
                    onClick={() => changeCart(p.id, (cart[p.id] || 0) + 1)}
                  >
                    {p.name}
                    <strong>{money(p.price)}</strong>
                    <span>
                      {p.stock === null ? "Tersedia" : `Stok ${p.stock}`}
                      {cart[p.id] ? ` · ${cart[p.id]} di keranjang` : ""}
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <Empty text="Belum ada produk. Tambahkan lewat Kelola katalog." />
          )}
        </section>
        <section className="card padded">
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void state.run(async () => {
                const result = await api(
                  `pos/students?search=${encodeURIComponent(search)}`,
                );
                setStudents(result.data);
                if (!result.data.length)
                  throw new Error(
                    "Siswa tidak ditemukan. Periksa NIS atau nama.",
                  );
              });
            }}
          >
            <h2>Keranjang belanja</h2>
            <label>
              NIS atau nama siswa
              <input
                required
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Masukkan NIS / nama"
              />
            </label>
            <button disabled={state.busy}>Cari siswa</button>
          </form>
          {students.length > 0 && (
            <div className="stack-form" style={{ marginTop: 17 }}>
              <label>
                Pilih siswa pembayaran
                <select
                  value={student?.id || ""}
                  onChange={(e) => {
                    setStudent(
                      students.find((s) => s.id === e.target.value) || null,
                    );
                    setCheckoutKey(crypto.randomUUID());
                  }}
                >
                  <option value="">Pilih siswa</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.nis}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {student && (
            <div className="notice success">
              {student.name} · Saldo <strong>{money(student.balance)}</strong>
            </div>
          )}
          {!items.length ? (
            <Empty text="Pilih produk untuk mulai transaksi." />
          ) : (
            items.map((p) => (
              <div className="cart-row" key={p.id}>
                <div>
                  {p.name}
                  <div className="muted small">
                    {money(Number(p.price) * cart[p.id])}
                  </div>
                </div>
                <div className="actions">
                  <button
                    disabled={state.busy}
                    aria-label={`Kurangi ${p.name}`}
                    onClick={() => changeCart(p.id, cart[p.id] - 1)}
                  >
                    −
                  </button>
                  <span>{cart[p.id]}</span>
                  <button
                    disabled={
                      state.busy ||
                      (p.stock !== null && cart[p.id] >= Number(p.stock))
                    }
                    aria-label={`Tambah ${p.name}`}
                    onClick={() => changeCart(p.id, cart[p.id] + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            className="primary"
            style={{ width: "100%" }}
            disabled={
              state.busy ||
              !student ||
              !items.length ||
              Number(student?.balance) < total
            }
            onClick={() =>
              void state.run(async () => {
                const r = await send("pos/checkout", {
                  student_id: student!.id,
                  merchant_id: merchant,
                  items: items.map((p) => ({
                    product_id: p.id,
                    quantity: cart[p.id],
                  })),
                  idempotency_key: checkoutKey,
                });
                setReceipt(r);
                setStudent({ ...student, balance: r.balance_after });
                setCart({});
                setCheckoutKey(crypto.randomUUID());
                await load();
              }, "Pembayaran berhasil. Saldo siswa telah diperbarui.")
            }
          >
            {state.busy ? "Memproses pembayaran…" : "Bayar dengan dompet"}
          </button>
          {student && Number(student.balance) < total && (
            <p className="helper" style={{ marginTop: 12 }}>
              Saldo belum cukup untuk total belanja ini.
            </p>
          )}
          {receipt && (
            <div className="notice success">
              <strong>Transaksi berhasil</strong>
              <p className="small" style={{ margin: "8px 0" }}>
                Nomor: {receipt.id}
                <br />
                Sisa saldo: {money(receipt.balance_after)}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
