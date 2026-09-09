import React, { useEffect, useState } from "react";
import { api, send } from "../api";
import { Empty, ErrorBox } from "../components";

type Row = Record<string, any>;
const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);

async function encodedFile(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Berkas tidak dapat dibaca"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  return {
    file_name: file.name,
    mime_type: file.type,
    data_base64: data.split(",")[1],
  };
}

export function FamilyPage() {
  const [overview, setOverview] = useState<Row | null>(null);
  const [form, setForm] = useState({
    period_id: "",
    track_id: "",
    target_grade_level_id: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    birth_date: "",
    gender: "",
  });
  const [credentials, setCredentials] = useState<
    Record<string, { email: string; password: string }>
  >({});
  const [documents, setDocuments] = useState<
    Record<string, { document_type: string; file?: File }>
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setOverview(await api("family/overview"));
  }
  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, []);
  const period = overview?.periods?.find(
    (row: Row) => row.id === form.period_id,
  );
  if (!overview && !error) return <Empty text="Menyiapkan ruang keluarga…" />;
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">AKUN KELUARGA</span>
          <h1>
            {overview?.needs_ppdb ? "Pendaftaran siswa baru" : "Keluarga saya"}
          </h1>
          <p className="muted">
            Pendaftaran, status penerimaan, dan akun siswa dikelola oleh orang
            tua.
          </p>
        </div>
      </div>
      <ErrorBox error={error} />
      {message && <p className="notice success">{message}</p>}
      {!!overview?.applications?.length && (
        <section className="card padded">
          <div className="section-title">
            <span className="eyebrow">STATUS PPDB</span>
            <h2>Pendaftaran Anda</h2>
          </div>
          <div className="family-applications">
            {overview.applications.map((application: Row) => (
              <div className="family-application" key={application.id}>
                <div className="line-item">
                  <div>
                    <strong>{application.name}</strong>
                    <span className="muted small">
                      {application.registration_number} ·{" "}
                      {application.period_name}
                      {application.track_name
                        ? ` · ${application.track_name}`
                        : ""}
                    </span>
                  </div>
                  <span
                    className={`status status-${String(application.status).toLowerCase()}`}
                  >
                    {application.status}
                  </span>
                </div>
                {!!application.documents?.length && (
                  <div className="document-statuses muted small">
                    {application.documents.map((document: Row) => (
                      <span key={document.document_type}>
                        {document.document_type}: {document.status}
                      </span>
                    ))}
                  </div>
                )}
                {!["REJECTED", "ENROLLED", "WITHDRAWN"].includes(
                  application.status,
                ) && (
                  <form
                    className="inline-document-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const value = documents[application.id];
                      if (!value?.file) return;
                      setBusy(true);
                      setError("");
                      try {
                        await send(
                          `family/applications/${application.id}/documents`,
                          {
                            ...(await encodedFile(value.file)),
                            document_type: value.document_type,
                          },
                        );
                        setMessage(
                          "Dokumen PPDB berhasil dikirim untuk verifikasi.",
                        );
                        setDocuments({
                          ...documents,
                          [application.id]: { document_type: "" },
                        });
                        await load();
                      } catch (reason) {
                        setError((reason as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <input
                      required
                      placeholder="Jenis dokumen, mis. Kartu Keluarga"
                      value={documents[application.id]?.document_type || ""}
                      onChange={(event) =>
                        setDocuments({
                          ...documents,
                          [application.id]: {
                            ...documents[application.id],
                            document_type: event.target.value,
                          },
                        })
                      }
                    />
                    <input
                      required
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={(event) =>
                        setDocuments({
                          ...documents,
                          [application.id]: {
                            document_type:
                              documents[application.id]?.document_type || "",
                            file: event.target.files?.[0],
                          },
                        })
                      }
                    />
                    <button disabled={busy}>Unggah dokumen</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {!!overview?.students?.length && (
        <section className="card padded">
          <div className="section-title">
            <span className="eyebrow">SISWA</span>
            <h2>Anak yang terhubung</h2>
          </div>
          {overview.students.map((student: Row) => (
            <div className="student-account-row" key={student.id}>
              <div>
                <strong>{student.name}</strong>
                <span className="muted small">NIS {student.nis}</span>
              </div>
              {student.account_ready ? (
                <span className="site-status">Akun siswa aktif</span>
              ) : (
                <form
                  className="inline-credential-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const value = credentials[student.id] || {
                      email: "",
                      password: "",
                    };
                    setBusy(true);
                    setError("");
                    try {
                      await send(
                        `family/students/${student.id}/account`,
                        value,
                      );
                      setMessage(`Akun ${student.name} berhasil dibuat.`);
                      await load();
                    } catch (reason) {
                      setError((reason as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <input
                    aria-label={`Email ${student.name}`}
                    required
                    type="email"
                    placeholder="Email siswa"
                    value={credentials[student.id]?.email || ""}
                    onChange={(event) =>
                      setCredentials({
                        ...credentials,
                        [student.id]: {
                          email: event.target.value,
                          password: credentials[student.id]?.password || "",
                        },
                      })
                    }
                  />
                  <input
                    aria-label={`Kata sandi ${student.name}`}
                    required
                    type="password"
                    minLength={12}
                    placeholder="Kata sandi minimal 12 karakter"
                    value={credentials[student.id]?.password || ""}
                    onChange={(event) =>
                      setCredentials({
                        ...credentials,
                        [student.id]: {
                          email: credentials[student.id]?.email || "",
                          password: event.target.value,
                        },
                      })
                    }
                  />
                  <button disabled={busy}>Buat akun siswa</button>
                </form>
              )}
            </div>
          ))}
          <a className="button-link" href="#portal">
            Buka informasi siswa →
          </a>
        </section>
      )}
      {!!overview?.periods?.length ? (
        <form
          className="card padded stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const result = await send("family/applications", {
                ...form,
                track_id: form.track_id || null,
                email: form.email || null,
                phone: form.phone || null,
                address: form.address || null,
                birth_date: form.birth_date || null,
                gender: form.gender || null,
              });
              setMessage(
                `Pendaftaran ${result.registration_number} berhasil dikirim.`,
              );
              setForm({
                period_id: "",
                track_id: "",
                target_grade_level_id: "",
                name: "",
                email: "",
                phone: "",
                address: "",
                birth_date: "",
                gender: "",
              });
              await load();
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-title">
            <span className="eyebrow">PPDB DIBUKA</span>
            <h2>Daftarkan calon siswa</h2>
          </div>
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
                {overview.periods.map((row: Row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.academic_year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jalur pendaftaran
              <select
                required={!!period?.tracks?.length}
                value={form.track_id}
                onChange={(event) =>
                  setForm({ ...form, track_id: event.target.value })
                }
              >
                <option value="">Pilih jalur</option>
                {(period?.tracks || []).map((row: Row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {money(row.cost)}
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
                {(period?.grade_levels || []).map((row: Row) => (
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
              Email calon siswa
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
      ) : overview?.needs_ppdb ? (
        <div className="empty">
          <span className="empty-icon">◇</span>
          <p>
            PPDB belum dibuka oleh sekolah. Anda dapat kembali setelah akses
            dibuka.
          </p>
        </div>
      ) : null}
    </>
  );
}
