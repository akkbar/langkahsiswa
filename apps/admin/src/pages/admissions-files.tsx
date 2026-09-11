import React, { useEffect, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, downloadFile, send } from "../api";
import { can, type Catalog, Empty, ErrorBox, label } from "../components";
import { dateText, PageHeading, Status } from "./finance";

type Row = Record<string, any>;
const today = new Date().toISOString().slice(0, 10);
const categories: Record<string, string> = {
  STUDENT_PHOTO: "Foto siswa",
  FAMILY_CARD: "Kartu keluarga",
  BIRTH_CERTIFICATE: "Akta lahir",
  PPDB_DOCUMENT: "Dokumen PPDB",
  PAYMENT_PROOF: "Bukti pembayaran",
  WEBSITE_IMAGE: "Gambar website",
  REPORT_CARD: "Raport",
  OTHER: "Lainnya",
};
const statuses: Record<string, string> = {
  SUBMITTED: "Dikirim",
  DOCUMENT_REVIEW: "Review dokumen",
  TEST: "Tes",
  INTERVIEW: "Wawancara",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
  ENROLLED: "Menjadi siswa",
  WITHDRAWN: "Mengundurkan diri",
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
async function encode(file: File | null) {
  if (!file) throw new Error("Pilih berkas terlebih dahulu.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Ukuran berkas maksimal 5 MB.");
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
    throw new Error("Gunakan berkas PNG, JPEG, atau PDF.");
  const value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Berkas tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
  return {
    file_name: file.name,
    mime_type: file.type,
    data_base64: value.split(",")[1],
  };
}

export function AdmissionsPage({
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
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [showPeriod, setShowPeriod] = useState(false);
  const [showApplicant, setShowApplicant] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [period, setPeriod] = useState({
    school_id: "",
    academic_year_id: "",
    name: "PPDB Gelombang 1",
    starts_on: today,
    ends_on: today,
    capacity: "",
  });
  const [applicant, setApplicant] = useState({
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
  });
  const [track, setTrack] = useState({
    period_id: "",
    name: "Internal 1",
    code: "INTERNAL-1",
    cost: "0",
    capacity: "",
  });
  const [review, setReview] = useState({
    stage: "DOCUMENT",
    decision: "PASSED",
    score: "",
    notes: "",
  });
  const [enrollment, setEnrollment] = useState({ nis: "", class_id: "" });
  const [admissionDocument, setAdmissionDocument] = useState<File | null>(null);
  const [admissionDocumentType, setAdmissionDocumentType] =
    useState("AKTA_LAHIR");
  async function load() {
    const [periodResult, trackResult, applicationResult] = await Promise.all([
      api("admission-periods"),
      api("admission-tracks"),
      api(
        `admissions/applications?limit=100${filter ? `&status=${filter}` : ""}`,
      ),
    ]);
    setPeriods(periodResult.data);
    setTracks(trackResult.data);
    setApplications(applicationResult.data);
  }
  useEffect(() => {
    void state.run(load);
  }, [filter]);
  const current = applications.find((row) => row.id === selected);
  const periodYears = (catalog["academic-years"] || []).filter(
    (year) => !period.school_id || year.school_id === period.school_id,
  );
  const periodGrades = (catalog["grade-levels"] || []).filter((grade) => {
    const chosen = periods.find((item) => item.id === applicant.period_id);
    return !chosen || grade.school_id === chosen.school_id;
  });
  const enrollmentClasses = (catalog.classes || []).filter(
    (row) =>
      current &&
      row.academic_year_id ===
        periods.find((p) => p.id === current.period_id)?.academic_year_id &&
      row.grade_level_id === current.target_grade_level_id,
  );
  return (
    <>
      <PageHeading
        eyebrow="PENERIMAAN SISWA"
        title="PPDB"
        description="Kelola periode, pemeriksaan berkas, tes, wawancara, dan konversi pendaftar menjadi siswa."
      />
      <Notices state={state} />
      <div className="actions" style={{ marginBottom: 20 }}>
        <label>
          Status aplikasi
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Semua status</option>
            {Object.entries(statuses).map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        {write && (
          <button onClick={() => setShowTrack(!showTrack)}>Jalur baru</button>
        )}
        {write && (
          <button onClick={() => setShowPeriod(!showPeriod)}>
            Periode baru
          </button>
        )}
        {write && (
          <button
            className="primary"
            onClick={() => setShowApplicant(!showApplicant)}
          >
            Pendaftar baru
          </button>
        )}
      </div>
      {showPeriod && (
        <form
          className="card padded stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void state.run(async () => {
              await send("admission-periods", {
                ...period,
                capacity: period.capacity ? Number(period.capacity) : null,
              });
              setShowPeriod(false);
              await load();
            }, "Periode PPDB dibuat sebagai draft.");
          }}
        >
          <h2>Periode PPDB baru</h2>
          <div className="form-grid">
            <label>
              Sekolah
              <select
                required
                value={period.school_id}
                onChange={(e) =>
                  setPeriod({
                    ...period,
                    school_id: e.target.value,
                    academic_year_id: "",
                  })
                }
              >
                <option value="">Pilih sekolah</option>
                {(catalog.schools || []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tahun ajaran
              <select
                required
                value={period.academic_year_id}
                onChange={(e) =>
                  setPeriod({ ...period, academic_year_id: e.target.value })
                }
              >
                <option value="">Pilih tahun ajaran</option>
                {periodYears.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nama periode
              <input
                required
                value={period.name}
                onChange={(e) => setPeriod({ ...period, name: e.target.value })}
              />
            </label>
            <label>
              Mulai
              <input
                type="date"
                required
                value={period.starts_on}
                onChange={(e) =>
                  setPeriod({ ...period, starts_on: e.target.value })
                }
              />
            </label>
            <label>
              Selesai
              <input
                type="date"
                required
                min={period.starts_on}
                value={period.ends_on}
                onChange={(e) =>
                  setPeriod({ ...period, ends_on: e.target.value })
                }
              />
            </label>
            <label>
              Kuota (opsional)
              <input
                type="number"
                min="1"
                value={period.capacity}
                onChange={(e) =>
                  setPeriod({ ...period, capacity: e.target.value })
                }
              />
            </label>
          </div>
          <button className="primary" disabled={state.busy}>
            Simpan periode
          </button>
        </form>
      )}
      {showTrack && (
        <form
          className="card padded stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void state.run(async () => {
              await send("admission-tracks", {
                ...track,
                cost: Number(track.cost),
                capacity: track.capacity ? Number(track.capacity) : null,
              });
              setShowTrack(false);
              await load();
            }, "Jalur dan biaya PPDB berhasil dibuat.");
          }}
        >
          <h2>Jalur PPDB baru</h2>
          <div className="form-grid">
            <label>
              Periode
              <select
                required
                value={track.period_id}
                onChange={(event) =>
                  setTrack({ ...track, period_id: event.target.value })
                }
              >
                <option value="">Pilih periode</option>
                {periods.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nama jalur
              <input
                required
                value={track.name}
                onChange={(event) =>
                  setTrack({ ...track, name: event.target.value })
                }
              />
            </label>
            <label>
              Kode
              <input
                required
                value={track.code}
                onChange={(event) =>
                  setTrack({ ...track, code: event.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              Biaya
              <input
                type="number"
                min="0"
                required
                value={track.cost}
                onChange={(event) =>
                  setTrack({ ...track, cost: event.target.value })
                }
              />
            </label>
            <label>
              Kuota jalur
              <input
                type="number"
                min="1"
                value={track.capacity}
                onChange={(event) =>
                  setTrack({ ...track, capacity: event.target.value })
                }
              />
            </label>
          </div>
          <button className="primary" disabled={state.busy}>
            Simpan jalur
          </button>
        </form>
      )}
      {showApplicant && (
        <form
          className="card padded stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void state.run(async () => {
              await send("admissions/applications", {
                ...applicant,
                track_id: applicant.track_id || null,
                email: applicant.email || null,
                phone: applicant.phone || null,
                address: applicant.address || null,
                birth_date: applicant.birth_date || null,
                gender: applicant.gender || null,
              });
              setShowApplicant(false);
              await load();
            }, "Pendaftar berhasil dicatat.");
          }}
        >
          <h2>Data calon siswa</h2>
          <div className="form-grid">
            <label>
              Periode
              <select
                required
                value={applicant.period_id}
                onChange={(e) =>
                  setApplicant({
                    ...applicant,
                    period_id: e.target.value,
                    track_id: "",
                    target_grade_level_id: "",
                  })
                }
              >
                <option value="">Pilih periode</option>
                {periods.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jalur PPDB
              <select
                value={applicant.track_id}
                required={tracks.some(
                  (row) => row.period_id === applicant.period_id,
                )}
                onChange={(event) =>
                  setApplicant({ ...applicant, track_id: event.target.value })
                }
              >
                <option value="">Pilih jalur</option>
                {tracks
                  .filter((row) => row.period_id === applicant.period_id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · Rp{Number(row.cost).toLocaleString("id-ID")}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tingkat tujuan
              <select
                required
                value={applicant.target_grade_level_id}
                onChange={(e) =>
                  setApplicant({
                    ...applicant,
                    target_grade_level_id: e.target.value,
                  })
                }
              >
                <option value="">Pilih tingkat</option>
                {periodGrades.map((row) => (
                  <option key={row.id} value={row.id}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nama calon siswa
              <input
                required
                value={applicant.name}
                onChange={(e) =>
                  setApplicant({ ...applicant, name: e.target.value })
                }
              />
            </label>
            <label>
              Tanggal lahir
              <input
                type="date"
                value={applicant.birth_date}
                onChange={(e) =>
                  setApplicant({ ...applicant, birth_date: e.target.value })
                }
              />
            </label>
            <label>
              Jenis kelamin
              <select
                value={applicant.gender}
                onChange={(e) =>
                  setApplicant({ ...applicant, gender: e.target.value })
                }
              >
                <option value="">Belum diisi</option>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </select>
            </label>
            <label>
              Email
              <input
                type="email"
                value={applicant.email}
                onChange={(e) =>
                  setApplicant({ ...applicant, email: e.target.value })
                }
              />
            </label>
            <label>
              Telepon
              <input
                value={applicant.phone}
                onChange={(e) =>
                  setApplicant({ ...applicant, phone: e.target.value })
                }
              />
            </label>
            <label>
              Nama wali
              <input
                required
                value={applicant.guardian_name}
                onChange={(e) =>
                  setApplicant({ ...applicant, guardian_name: e.target.value })
                }
              />
            </label>
            <label>
              Telepon wali
              <input
                required
                value={applicant.guardian_phone}
                onChange={(e) =>
                  setApplicant({ ...applicant, guardian_phone: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Alamat
            <textarea
              rows={2}
              value={applicant.address}
              onChange={(e) =>
                setApplicant({ ...applicant, address: e.target.value })
              }
            />
          </label>
          <button className="primary" disabled={state.busy}>
            Simpan pendaftar
          </button>
        </form>
      )}
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Periode</th>
              <th>Tahun ajaran</th>
              <th>Tanggal</th>
              <th>Kuota</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <br />
                  <span className="small muted">{row.school_name}</span>
                </td>
                <td>{row.academic_year}</td>
                <td>
                  {dateText(row.starts_on)} – {dateText(row.ends_on)}
                </td>
                <td>
                  {row.accepted}/{row.capacity ?? "∞"}
                  <br />
                  <span className="small muted">
                    {row.applications} pendaftar
                  </span>
                </td>
                <td>
                  <Status value={row.status} />
                </td>
                <td>
                  {write && (
                    <div className="actions">
                      {row.status !== "OPEN" && (
                        <button
                          onClick={() =>
                            void state.run(async () => {
                              await send(
                                `admission-periods/${row.id}/status`,
                                { status: "OPEN" },
                                "PATCH",
                              );
                              await load();
                            }, "Periode dibuka.")
                          }
                        >
                          Buka
                        </button>
                      )}
                      {row.status !== "CLOSED" && (
                        <button
                          onClick={() =>
                            void state.run(async () => {
                              await send(
                                `admission-periods/${row.id}/status`,
                                { status: "CLOSED" },
                                "PATCH",
                              );
                              await load();
                            }, "Periode ditutup.")
                          }
                        >
                          Tutup
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="split-layout">
        <section className="card padded">
          <h2>Antrean pendaftar</h2>
          {!applications.length ? (
            <Empty text="Belum ada pendaftar pada filter ini." />
          ) : (
            <div className="stack-list">
              {applications.map((row) => (
                <button
                  className={`list-choice ${selected === row.id ? "active" : ""}`}
                  key={row.id}
                  onClick={() => setSelected(row.id)}
                >
                  <strong>{row.name}</strong>
                  <span>
                    {row.registration_number} · {row.grade_name}
                  </span>
                  <Status value={row.status} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="card padded">
          {!current ? (
            <Empty text="Pilih pendaftar untuk melihat detail." />
          ) : (
            <>
              <div className="detail-heading">
                <div>
                  <span className="eyebrow">{current.registration_number}</span>
                  <h2>{current.name}</h2>
                </div>
                <Status value={current.status} />
              </div>
              <p className="muted">
                {current.period_name} · {current.grade_name} · wali{" "}
                {current.guardian_name} ({current.guardian_phone})
              </p>
              <h3>Dokumen</h3>
              {!current.documents.length ? (
                <p className="muted">Belum ada dokumen.</p>
              ) : (
                current.documents.map((doc: Row) => (
                  <div className="line-item" key={doc.id}>
                    <div>
                      <strong>{doc.document_type}</strong>
                      <span className="muted small">
                        {doc.status}
                        {doc.notes ? ` · ${doc.notes}` : ""}
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        onClick={() =>
                          void state.run(() =>
                            downloadFile(
                              `files/${doc.file_id}/download`,
                              doc.document_type,
                            ),
                          )
                        }
                      >
                        Unduh
                      </button>
                      {write && doc.status === "PENDING" && (
                        <>
                          <button
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `admissions/documents/${doc.id}`,
                                  { status: "VERIFIED", notes: "" },
                                  "PATCH",
                                );
                                await load();
                              }, "Dokumen diverifikasi.")
                            }
                          >
                            Verifikasi
                          </button>
                          <button
                            className="danger"
                            onClick={() =>
                              void state.run(async () => {
                                await send(
                                  `admissions/documents/${doc.id}`,
                                  {
                                    status: "REJECTED",
                                    notes: "Perlu diperbaiki",
                                  },
                                  "PATCH",
                                );
                                await load();
                              }, "Dokumen ditolak.")
                            }
                          >
                            Tolak
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              {write && !["ENROLLED", "WITHDRAWN"].includes(current.status) && (
                <form
                  className="sub-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void state.run(async () => {
                      await send(
                        `admissions/applications/${current.id}/documents`,
                        {
                          ...(await encode(admissionDocument)),
                          document_type: admissionDocumentType,
                        },
                      );
                      setAdmissionDocument(null);
                      await load();
                    }, "Dokumen PPDB berhasil diunggah.");
                  }}
                >
                  <h3>Tambahkan dokumen</h3>
                  <div className="form-grid">
                    <label>
                      Jenis dokumen
                      <select
                        value={admissionDocumentType}
                        onChange={(event) =>
                          setAdmissionDocumentType(event.target.value)
                        }
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
                        required
                        accept="image/png,image/jpeg,application/pdf"
                        onChange={(event) =>
                          setAdmissionDocument(event.target.files?.[0] || null)
                        }
                      />
                    </label>
                  </div>
                  <button disabled={state.busy}>Unggah dokumen</button>
                </form>
              )}
              {write && !["ENROLLED", "WITHDRAWN"].includes(current.status) && (
                <form
                  className="sub-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void state.run(async () => {
                      await send(
                        `admissions/applications/${current.id}/reviews`,
                        {
                          ...review,
                          score: review.score ? Number(review.score) : null,
                        },
                      );
                      await load();
                    }, "Hasil review tersimpan.");
                  }}
                >
                  <h3>Catat review</h3>
                  <div className="form-grid">
                    <label>
                      Tahap
                      <select
                        value={review.stage}
                        onChange={(e) =>
                          setReview({ ...review, stage: e.target.value })
                        }
                      >
                        <option value="DOCUMENT">Dokumen</option>
                        <option value="TEST">Tes</option>
                        <option value="INTERVIEW">Wawancara</option>
                        <option value="FINAL">Final</option>
                      </select>
                    </label>
                    <label>
                      Keputusan
                      <select
                        value={review.decision}
                        onChange={(e) =>
                          setReview({ ...review, decision: e.target.value })
                        }
                      >
                        <option value="PASSED">Lulus</option>
                        <option value="NEEDS_REVISION">Perlu perbaikan</option>
                        <option value="FAILED">Tidak lulus</option>
                      </select>
                    </label>
                    <label>
                      Nilai
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={review.score}
                        onChange={(e) =>
                          setReview({ ...review, score: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Catatan
                    <textarea
                      value={review.notes}
                      onChange={(e) =>
                        setReview({ ...review, notes: e.target.value })
                      }
                    />
                  </label>
                  <button disabled={state.busy}>Simpan review</button>
                </form>
              )}
              {write && current.status === "ACCEPTED" && (
                <form
                  className="sub-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void state.run(async () => {
                      await send(
                        `admissions/applications/${current.id}/enroll`,
                        {
                          nis: enrollment.nis,
                          class_id: enrollment.class_id || null,
                        },
                      );
                      await load();
                    }, "Pendaftar resmi menjadi siswa.");
                  }}
                >
                  <h3>Daftarkan sebagai siswa</h3>
                  <div className="form-grid">
                    <label>
                      NIS
                      <input
                        required
                        value={enrollment.nis}
                        onChange={(e) =>
                          setEnrollment({ ...enrollment, nis: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Kelas (opsional)
                      <select
                        value={enrollment.class_id}
                        onChange={(e) =>
                          setEnrollment({
                            ...enrollment,
                            class_id: e.target.value,
                          })
                        }
                      >
                        <option value="">Tanpa kelas</option>
                        {enrollmentClasses.map((row) => (
                          <option key={row.id} value={row.id}>
                            {label(row, "classes", catalog)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button className="primary" disabled={state.busy}>
                    Buat data siswa
                  </button>
                </form>
              )}
              {!!current.reviews.length && (
                <>
                  <h3>Riwayat review</h3>
                  {current.reviews.map((item: Row, index: number) => (
                    <p className="small" key={index}>
                      <strong>
                        {item.stage} · {item.decision}
                      </strong>
                      {item.score !== null ? ` · nilai ${item.score}` : ""}
                      <br />
                      <span className="muted">
                        {item.notes || dateText(item.reviewed_at)}
                      </span>
                    </p>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

export function FilesPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const creatable = can(user, "file.create");
  const updatable = can(user, "file.update");
  const deletable = can(user, "file.delete");
  const state = useAction();
  const [files, setFiles] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    category: "OTHER",
    description: "",
    entity_type: "",
    entity_id: "",
  });
  async function load() {
    const result = await api(
      `files?limit=100${category ? `&category=${category}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}${archived ? "&deleted=true" : ""}`,
    );
    setFiles(result.data);
  }
  useEffect(() => {
    void state.run(load);
  }, [category, archived]);
  const resourceMap: Record<string, string> = {
    STUDENT: "students",
    SCHOOL: "schools",
    REPORT_CARD: "report-cards",
  };
  const entityRows = catalog[resourceMap[form.entity_type]] || [];
  return (
    <>
      <PageHeading
        eyebrow="DOKUMEN SEKOLAH"
        title="Manajemen berkas"
        description="Pustaka privat untuk dokumen siswa, PPDB, pembayaran, raport, dan aset sekolah."
      />
      <Notices state={state} />
      <div className="toolbar">
        <input
          aria-label="Cari berkas"
          placeholder="Cari nama atau deskripsi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void state.run(load);
          }}
        />
        <select
          aria-label="Kategori berkas"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Semua kategori</option>
          {Object.entries(categories).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <button onClick={() => void state.run(load)}>Cari</button>
        <button onClick={() => setArchived(!archived)}>
          {archived ? "Berkas aktif" : "Arsip"}
        </button>
        {creatable && (
          <button
            className="primary"
            onClick={() => setShowUpload(!showUpload)}
          >
            Unggah berkas
          </button>
        )}
      </div>
      {showUpload && creatable && (
        <form
          className="card padded stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void state.run(async () => {
              await send("files", {
                ...(await encode(selectedFile)),
                category: form.category,
                description: form.description,
                ...(form.entity_type && form.entity_id
                  ? { entity_type: form.entity_type, entity_id: form.entity_id }
                  : {}),
              });
              setSelectedFile(null);
              setShowUpload(false);
              await load();
            }, "Berkas tersimpan di pustaka privat.");
          }}
        >
          <h2>Berkas baru</h2>
          <div className="form-grid">
            <label>
              Berkas
              <input
                required
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
            <label>
              Kategori
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {Object.entries(categories).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tautkan ke
              <select
                value={form.entity_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    entity_type: e.target.value,
                    entity_id: "",
                  })
                }
              >
                <option value="">Tanpa tautan</option>
                <option value="STUDENT">Siswa</option>
                <option value="SCHOOL">Sekolah</option>
                <option value="REPORT_CARD">Raport</option>
              </select>
            </label>
            {form.entity_type && (
              <label>
                Data terkait
                <select
                  required
                  value={form.entity_id}
                  onChange={(e) =>
                    setForm({ ...form, entity_id: e.target.value })
                  }
                >
                  <option value="">Pilih data</option>
                  {entityRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {label(row, resourceMap[form.entity_type], catalog)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label>
            Deskripsi
            <textarea
              maxLength={1000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <button className="primary" disabled={state.busy}>
            Unggah maksimal 5 MB
          </button>
        </form>
      )}
      {!files.length ? (
        <Empty text="Belum ada berkas pada filter ini." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Berkas</th>
                <th>Kategori</th>
                <th>Ukuran</th>
                <th>Tautan</th>
                <th>Diunggah</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <strong>{file.file_name}</strong>
                    <br />
                    <span className="small muted">
                      {file.description || file.mime_type}
                    </span>
                  </td>
                  <td>{categories[file.category] || file.category}</td>
                  <td>{Math.max(1, Math.round(file.size_bytes / 1024))} KB</td>
                  <td>
                    {file.links
                      .map(
                        (link: Row) =>
                          `${link.entity_type} · ${String(link.entity_id).slice(0, 8)}`,
                      )
                      .join(", ") || "—"}
                  </td>
                  <td>{dateText(file.created_at)}</td>
                  <td>
                    <div className="actions">
                      {!archived && (
                        <button
                          onClick={() =>
                            void state.run(() =>
                              downloadFile(
                                `files/${file.id}/download`,
                                file.file_name,
                              ),
                            )
                          }
                        >
                          Unduh
                        </button>
                      )}
                      {updatable && archived && (
                        <button
                          onClick={() =>
                            void state.run(async () => {
                              await send(`files/${file.id}/restore`, {});
                              await load();
                            }, "Berkas dipulihkan.")
                          }
                        >
                          Pulihkan
                        </button>
                      )}
                      {deletable &&
                        !archived &&
                        file.category !== "PAYMENT_PROOF" && (
                          <button
                            className="danger"
                            onClick={() =>
                              void state.run(async () => {
                                await api(`files/${file.id}`, {
                                  method: "DELETE",
                                });
                                await load();
                              }, "Berkas dipindahkan ke arsip.")
                            }
                          >
                            Arsipkan
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
    </>
  );
}
