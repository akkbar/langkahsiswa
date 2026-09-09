import React, { useState } from "react";
import { api } from "../api";
import { ErrorBox } from "../components";
import { ThemeToggle } from "../theme";

type Row = Record<string, any>;
const empty = {
  period_id: "",
  track_id: "",
  target_grade_level_id: "",
  name: "",
  email: "",
  phone: "",
  address: "",
  birth_date: "",
  gender: "",
  guardian_name: "",
  guardian_phone: "",
};
export function PublicAdmissions() {
  const [slug, setSlug] = useState("demo");
  const [periods, setPeriods] = useState<Row[]>([]);
  const [form, setForm] = useState(empty);
  const [result, setResult] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState("AKTA_LAHIR");
  const [document, setDocument] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [tracking, setTracking] = useState({ registration: "", token: "" });
  const [tracked, setTracked] = useState<Row | null>(null);
  async function loadPeriods() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`public/admissions/${slug.trim()}/periods`);
      setPeriods(data.data);
      if (!data.data.length)
        setError("Belum ada periode PPDB yang dibuka oleh sekolah ini.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedPeriod = periods.find((row) => row.id === form.period_id);
  return (
    <main className="public-page">
      <header className="public-header">
        <a className="brand" href="#">
          <span className="brandmark">L</span>LangkahSiswa
        </a>
        <div className="actions">
          <ThemeToggle />
          <a className="button-link" href="#">
            Masuk akun sekolah
          </a>
        </div>
      </header>
      <section className="public-content">
        <div className="page-title">
          <div>
            <span className="eyebrow">PENERIMAAN SISWA BARU</span>
            <h1>Formulir PPDB</h1>
            <p className="muted">
              Pilih sekolah dan periode, lalu isi data calon siswa dengan
              lengkap.
            </p>
          </div>
        </div>
        <ErrorBox error={error} />
        {message && <div className="notice success">{message}</div>}
        <details className="card padded tracking-card">
          <summary>Sudah mendaftar? Periksa status</summary>
          <form
            className="sub-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setTracked(null);
              void api(
                `public/admissions/${slug.trim()}/applications/${encodeURIComponent(tracking.registration.trim())}/status`,
                {
                  method: "POST",
                  body: JSON.stringify({ access_token: tracking.token.trim() }),
                },
              )
                .then(setTracked)
                .catch((error) => setError(error.message))
                .finally(() => setBusy(false));
            }}
          >
            <div className="form-grid">
              <label>
                Nomor pendaftaran
                <input
                  required
                  placeholder="PPDB-2026-…"
                  value={tracking.registration}
                  onChange={(event) =>
                    setTracking({
                      ...tracking,
                      registration: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Kode akses
                <input
                  required
                  minLength={32}
                  value={tracking.token}
                  onChange={(event) =>
                    setTracking({ ...tracking, token: event.target.value })
                  }
                />
              </label>
            </div>
            <button disabled={busy || !slug.trim()}>Periksa status</button>
          </form>
          {tracked && (
            <div className="tracking-result">
              <strong>{tracked.registration_number}</strong>
              <span>Status: {tracked.status}</span>
              <span>{tracked.documents.length} dokumen tercatat</span>
            </div>
          )}
        </details>
        {!result ? (
          <>
            <section className="card padded stack-form">
              <h2>Temukan sekolah</h2>
              <div className="actions public-school-search">
                <label>
                  Kode sekolah
                  <input
                    required
                    value={slug}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setPeriods([]);
                      setForm(empty);
                    }}
                  />
                </label>
                <button
                  disabled={busy || !slug.trim()}
                  onClick={() => void loadPeriods()}
                >
                  {busy ? "Mencari…" : "Lihat periode"}
                </button>
              </div>
            </section>
            {!!periods.length && (
              <form
                className="card padded stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError("");
                  void api(`public/admissions/${slug.trim()}/applications`, {
                    method: "POST",
                    body: JSON.stringify({
                      ...form,
                      track_id: form.track_id || null,
                      email: form.email || null,
                      phone: form.phone || null,
                      address: form.address || null,
                      birth_date: form.birth_date || null,
                      gender: form.gender || null,
                    }),
                  })
                    .then((data) => {
                      setResult(data);
                      setMessage(
                        "Pendaftaran berhasil dikirim. Simpan nomor dan kode akses di bawah.",
                      );
                    })
                    .catch((error) => setError(error.message))
                    .finally(() => setBusy(false));
                }}
              >
                <h2>Data pendaftaran</h2>
                <div className="form-grid">
                  <label>
                    Periode
                    <select
                      required
                      value={form.period_id}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          period_id: event.target.value,
                          track_id: "",
                          target_grade_level_id: "",
                        })
                      }
                    >
                      <option value="">Pilih periode</option>
                      {periods.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} · {row.academic_year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Jalur PPDB
                    <select
                      required={!!selectedPeriod?.tracks?.length}
                      value={form.track_id}
                      onChange={(event) =>
                        setForm({ ...form, track_id: event.target.value })
                      }
                    >
                      <option value="">Pilih jalur</option>
                      {(selectedPeriod?.tracks || []).map((row: Row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} · Rp
                          {Number(row.cost).toLocaleString("id-ID")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tingkat tujuan
                    <select
                      required
                      value={form.target_grade_level_id}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          target_grade_level_id: event.target.value,
                        })
                      }
                    >
                      <option value="">Pilih tingkat</option>
                      {(selectedPeriod?.grade_levels || []).map((row: Row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nama calon siswa
                    <input
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tanggal lahir
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={(event) =>
                        setForm({ ...form, birth_date: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Jenis kelamin
                    <select
                      value={form.gender}
                      onChange={(event) =>
                        setForm({ ...form, gender: event.target.value })
                      }
                    >
                      <option value="">Pilih</option>
                      <option value="MALE">Laki-laki</option>
                      <option value="FEMALE">Perempuan</option>
                    </select>
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Telepon
                    <input
                      value={form.phone}
                      onChange={(event) =>
                        setForm({ ...form, phone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Nama wali
                    <input
                      required
                      value={form.guardian_name}
                      onChange={(event) =>
                        setForm({ ...form, guardian_name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Telepon wali
                    <input
                      required
                      value={form.guardian_phone}
                      onChange={(event) =>
                        setForm({ ...form, guardian_phone: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Alamat
                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {busy ? "Mengirim…" : "Kirim pendaftaran"}
                </button>
              </form>
            )}
          </>
        ) : (
          <section className="card padded stack-form">
            <span className="eyebrow">PENDAFTARAN TERKIRIM</span>
            <h2>{result.registration_number}</h2>
            <p>
              Simpan kode akses berikut untuk memeriksa status atau mengunggah
              dokumen:
            </p>
            <code className="access-code">{result.access_token}</code>
            <form
              className="sub-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!document) {
                  setError("Pilih dokumen terlebih dahulu.");
                  return;
                }
                if (document.size > 5 * 1024 * 1024) {
                  setError("Ukuran dokumen maksimal 5 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setBusy(true);
                  setError("");
                  void api(
                    `public/admissions/${slug.trim()}/applications/${result.id}/documents`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        access_token: result.access_token,
                        document_type: documentType,
                        file_name: document.name,
                        mime_type: document.type,
                        data_base64: String(reader.result).split(",")[1],
                      }),
                    },
                  )
                    .then(() => {
                      setDocument(null);
                      setMessage(
                        "Dokumen berhasil diunggah dan menunggu verifikasi.",
                      );
                    })
                    .catch((error) => setError(error.message))
                    .finally(() => setBusy(false));
                };
                reader.readAsDataURL(document);
              }}
            >
              <h3>Unggah dokumen</h3>
              <div className="form-grid">
                <label>
                  Jenis dokumen
                  <select
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                  >
                    <option value="AKTA_LAHIR">Akta lahir</option>
                    <option value="KARTU_KELUARGA">Kartu keluarga</option>
                    <option value="FOTO">Foto</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                </label>
                <label>
                  Berkas
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={(event) =>
                      setDocument(event.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>
              <button disabled={busy}>Unggah dokumen</button>
            </form>
            <button
              onClick={() => {
                setResult(null);
                setForm(empty);
                setMessage("");
              }}
            >
              Buat pendaftaran lain
            </button>
          </section>
        )}
      </section>
    </main>
  );
}
