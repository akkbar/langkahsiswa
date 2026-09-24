import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox } from "../components";

type Dashboard = {
  total_applications: number; draft: number; submitted: number; under_review: number;
  verified_documents: number; rejected: number; accepted: number; waiting_list: number; registered: number;
  quota: { total_capacity: number; filled_capacity: number; remaining_capacity: number };
  series: { by_period: Array<{ period: string; count: number }>; by_track: Array<{ track: string; count: number }>; by_status: Array<{ status: string; count: number }> };
};
type Report = { total: number; page: number; limit: number; totalPages: number; data: Array<Record<string, unknown>> };
const types = ["APPLICANTS", "VERIFICATION", "SELECTION", "ACCEPTED", "REREGISTRATION", "PAYMENTS"];
const labels: Record<string, string> = { APPLICANTS: "Pendaftar", VERIFICATION: "Verifikasi", SELECTION: "Seleksi", ACCEPTED: "Diterima", REREGISTRATION: "Daftar Ulang", PAYMENTS: "Pembayaran" };
export function csvCell(value: unknown) {
  const text = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function Series({ title, rows, label }: { title: string; rows: Array<Record<string, unknown>>; label: string }) {
  return <section className="card padded"><h2>{title}</h2>{rows.length ? <table><thead><tr><th>{label}</th><th>Jumlah</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{String(row[label.toLowerCase()] ?? "—")}</td><td>{String(row.count ?? 0)}</td></tr>)}</tbody></table> : <Empty text="Belum ada data." />}</section>;
}

export function PpdbDashboardPage() {
  const [data, setData] = useState<Dashboard>(); const [error, setError] = useState("");
  useEffect(() => { api<Dashboard>("admissions/reports/dashboard").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Empty text="Memuat dashboard PPDB…" />;
  const kpis = [["Total pendaftar", data.total_applications], ["Draf", data.draft], ["Masuk", data.submitted], ["Dalam proses", data.under_review], ["Dokumen terverifikasi", data.verified_documents], ["Diterima", data.accepted], ["Menunggu", data.waiting_list], ["Terdaftar", data.registered], ["Ditolak", data.rejected]];
  return <><div className="page-title"><div><span className="eyebrow">PPDB</span><h1>Dashboard PPDB</h1></div></div><section className="card padded"><h2>Kuota penerimaan</h2><div className="stats"><div><span>Kapasitas</span><strong>{data.quota.total_capacity}</strong></div><div><span>Terisi</span><strong>{data.quota.filled_capacity}</strong></div><div><span>Tersisa</span><strong>{data.quota.remaining_capacity}</strong></div></div></section><section className="stats">{kpis.map(([label, value]) => <div className="card padded" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section><div className="two-column"><Series title="Pendaftar per gelombang" rows={data.series.by_period} label="Period" /><Series title="Pendaftar per jalur" rows={data.series.by_track} label="Track" /><Series title="Status pendaftaran" rows={data.series.by_status} label="Status" /></div></>;
}

export function PpdbReportsPage() {
  const [type, setType] = useState("APPLICANTS"), [status, setStatus] = useState(""), [academicYearId, setAcademicYearId] = useState(""), [periodId, setPeriodId] = useState(""), [trackId, setTrackId] = useState(""), [dateFrom, setDateFrom] = useState(""), [dateTo, setDateTo] = useState("");
  const [academicYears, setAcademicYears] = useState<Array<{ id: string; name: string }>>([]);
  const [result, setResult] = useState<Report>(), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => { api<{ data: Array<{ id: string; name: string }> }>("academic-years?limit=100").then(({ data }) => setAcademicYears(data)).catch((e) => setError(e.message)); }, []);
  const load = async (page = 1) => { setLoading(true); setError(""); try { const q = new URLSearchParams({ type, page: String(page), limit: "30" }); if (status) q.set("status", status); if (academicYearId) q.set("academic_year_id", academicYearId); if (periodId) q.set("period_id", periodId); if (trackId) q.set("track_id", trackId); if (dateFrom) q.set("date_from", dateFrom); if (dateTo) q.set("date_to", dateTo); setResult(await api<Report>(`admissions/reports/export?${q}`)); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [type]);
  const csv = () => { if (!result?.data.length) return; const fields = Array.from(new Set(result.data.flatMap(Object.keys))); const blob = new Blob([[fields.join(","), ...result.data.map(row => fields.map(field => csvCell(row[field])).join(","))].join("\n")], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `ppdb-${type.toLowerCase()}-halaman-${result.page}.csv`; link.click(); URL.revokeObjectURL(link.href); };
  const rows = result?.data ?? []; const columns = Array.from(new Set(rows.flatMap(Object.keys))).slice(0, 10);
  return <><div className="page-title"><div><span className="eyebrow">PPDB</span><h1>Laporan PPDB</h1></div><button onClick={csv} disabled={!rows.length}>Unduh CSV halaman ini</button></div><section className="card padded"><form className="form-grid" onSubmit={(e) => { e.preventDefault(); void load(); }}><label>Jenis laporan<select value={type} onChange={e => setType(e.target.value)}>{types.map(item => <option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua status</option>{["DRAFT", "SUBMITTED", "DOCUMENT_REVIEW", "TEST", "INTERVIEW", "ACCEPTED", "REJECTED", "ENROLLED", "WITHDRAWN"].map(item => <option key={item}>{item}</option>)}</select></label><label>Tahun ajaran<select value={academicYearId} onChange={e => setAcademicYearId(e.target.value)}><option value="">Semua tahun ajaran</option>{academicYears.map(year => <option key={String(year.id)} value={String(year.id)}>{String(year.name)}</option>)}</select></label><label>ID gelombang<input value={periodId} onChange={e => setPeriodId(e.target.value)} placeholder="UUID gelombang" /></label><label>ID jalur<input value={trackId} onChange={e => setTrackId(e.target.value)} placeholder="UUID jalur" /></label><label>Dari tanggal<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label><label>Sampai tanggal<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label><button type="submit" disabled={loading}>{loading ? "Memuat…" : "Terapkan filter"}</button></form></section><ErrorBox error={error} />{!result && !error ? <Empty text="Memuat laporan…" /> : result && <section className="card padded"><p>{result.total} data · halaman {result.page} dari {Math.max(result.totalPages, 1)}</p>{rows.length ? <div className="table-wrap"><table><thead><tr>{columns.map(column => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(column => <td key={column}>{typeof row[column] === "object" ? JSON.stringify(row[column]) : String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <Empty text="Tidak ada data untuk filter ini." />}<div className="pagination"><button disabled={result.page <= 1 || loading} onClick={() => void load(result.page - 1)}>Sebelumnya</button><button disabled={result.page >= result.totalPages || loading} onClick={() => void load(result.page + 1)}>Berikutnya</button></div></section>}</>;
}
