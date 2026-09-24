import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { ErrorBox } from "../components";
import { ThemeToggle } from "../theme";

type Row = Record<string, any>;
type FormField = {
  id: string;
  label: string;
  field_key: string;
  field_type: string;
  options: { value: string; label: string }[];
  placeholder: string;
  help_text: string;
  is_required: boolean;
  is_special_key: boolean;
  validation: Record<string, any>;
  conditional_logic: Record<string, any>;
  order_index: number;
};
type FormSection = {
  id: string;
  name: string;
  description: string;
  order_index: number;
  is_required: boolean;
  fields: FormField[];
};
type FormData = {
  period: Row;
  sections: FormSection[];
};

const SPECIAL_KEYS = new Set([
  "nisn",
  "nik",
  "kk",
  "kip",
  "kks",
  "pkt",
  "FULL_NAME",
  "EMAIL",
  "PHONE",
  "BIRTH_DATE",
  "GENDER",
  "ADDRESS",
  "KK_NUMBER",
  "KTP_NUMBER",
]);

function renderField(
  field: FormField,
  values: Record<string, any>,
  onChange: (key: string, value: any) => void,
  errors: Record<string, string>,
  disabled: boolean,
) {
  const value = values[field.field_key] ?? "";
  const error = errors[field.field_key];
  const baseProps = {
    id: field.field_key,
    disabled,
    "aria-invalid": !!error,
    "aria-describedby": error
      ? `${field.field_key}-error`
      : field.help_text
        ? `${field.field_key}-help`
        : undefined,
  };
  const inputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    ...baseProps,
    onChange: (e) => onChange(field.field_key, e.target.value),
    onBlur: () => onChange(field.field_key, value),
  };
  const textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement> = {
    ...baseProps,
    onChange: (e) => onChange(field.field_key, e.target.value),
    onBlur: () => onChange(field.field_key, value),
  };
  const selectProps: React.SelectHTMLAttributes<HTMLSelectElement> = {
    ...baseProps,
    onChange: (e) => onChange(field.field_key, e.target.value),
    onBlur: () => onChange(field.field_key, value),
  };

  switch (field.field_type) {
    case "TEXTAREA":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <textarea
            {...textareaProps}
            value={value}
            placeholder={field.placeholder}
            rows={3}
          />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "EMAIL":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input
            {...inputProps}
            type="email"
            value={value}
            placeholder={field.placeholder}
          />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "PHONE":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input
            {...inputProps}
            type="tel"
            value={value}
            placeholder={field.placeholder}
          />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "DATE":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input {...inputProps} type="date" value={value} />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "SELECT":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <select {...selectProps} value={value}>
            <option value="">Pilih...</option>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "RADIO":
      return (
        <fieldset key={field.id} className="field-wrapper radio-group">
          <legend className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </legend>
          {field.options.map((opt) => (
            <label key={opt.value} className="radio-option">
              <input
                type="radio"
                name={field.field_key}
                value={opt.value}
                checked={value === opt.value}
                onChange={(e) => onChange(field.field_key, e.target.value)}
                disabled={disabled}
              />
              <span>{opt.label}</span>
            </label>
          ))}
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </fieldset>
      );
    case "CHECKBOX":
      return (
        <fieldset key={field.id} className="field-wrapper checkbox-group">
          <legend className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </legend>
          {field.options.map((opt) => (
            <label key={opt.value} className="checkbox-option">
              <input
                type="checkbox"
                name={field.field_key}
                value={opt.value}
                checked={Array.isArray(value) && value.includes(opt.value)}
                onChange={(e) => {
                  const arr = Array.isArray(value) ? [...value] : [];
                  if (e.target.checked) arr.push(opt.value);
                  else arr.splice(arr.indexOf(opt.value), 1);
                  onChange(field.field_key, arr);
                }}
                disabled={disabled}
              />
              <span>{opt.label}</span>
            </label>
          ))}
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </fieldset>
      );
    case "FILE_UPLOAD":
      return (
        <label key={field.id} className="field-wrapper file-upload">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input
            type="file"
            id={field.field_key}
            disabled={disabled}
            onChange={(e) =>
              onChange(field.field_key, e.target.files?.[0] || null)
            }
            accept="image/png,image/jpeg,application/pdf"
          />
          {value instanceof File && (
            <span className="file-name">{value.name}</span>
          )}
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    case "NUMBER":
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input
            {...inputProps}
            type="number"
            value={value}
            placeholder={field.placeholder}
          />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
    default:
      return (
        <label key={field.id} className="field-wrapper">
          <span className="field-label">
            {field.label}{" "}
            {field.is_required && <span className="required">*</span>}
          </span>
          <input
            {...inputProps}
            type="text"
            value={value}
            placeholder={field.placeholder}
          />
          {field.help_text && (
            <span id={`${field.field_key}-help`} className="help-text">
              {field.help_text}
            </span>
          )}
          {error && (
            <span id={`${field.field_key}-error`} className="error-text">
              {error}
            </span>
          )}
        </label>
      );
  }
}

function validateField(field: FormField, value: any): string | null {
  if (
    field.is_required &&
    (!value || (Array.isArray(value) && value.length === 0))
  ) {
    return `${field.label} wajib diisi`;
  }
  if (!value) return null;
  const val = String(value);
  if (field.field_type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return "Format email tidak valid";
  }
  if (field.field_type === "PHONE" && !/^[\d\s\-\+\(\)]{10,}$/.test(val)) {
    return "Format telepon tidak valid";
  }
  if (
    field.validation?.min_length &&
    val.length < field.validation.min_length
  ) {
    return `Minimal ${field.validation.min_length} karakter`;
  }
  if (
    field.validation?.max_length &&
    val.length > field.validation.max_length
  ) {
    return `Maksimal ${field.validation.max_length} karakter`;
  }
  if (field.validation?.pattern) {
    try {
      if (!new RegExp(field.validation.pattern).test(val)) {
        return field.validation.message || "Format tidak valid";
      }
    } catch {}
  }
  return null;
}

export function PublicAdmissions() {
  const [slug, setSlug] = useState("demo");
  const [periods, setPeriods] = useState<Row[]>([]);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [applicationResult, setApplicationResult] = useState<Row | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState("AKTA_LAHIR");
  const [document, setDocument] = useState<File | null>(null);
  const [tracking, setTracking] = useState({ registration: "", token: "" });
  const [tracked, setTracked] = useState<Row | null>(null);

  const loadPeriods = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await api(`public/admissions/${slug.trim()}/periods`);
      setPeriods(data.data);
      if (!data.data.length)
        setError("Belum ada periode PPDB yang dibuka oleh sekolah ini.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [slug]);

  const loadForm = useCallback(
    async (periodId: string) => {
      setBusy(true);
      setError("");
      try {
        const data = await api(
          `public/admissions/${slug.trim()}/form/${periodId}`,
        );
        setFormData(data);
        setActiveSectionIndex(0);
        setValues({});
        setErrors({});
        setSubmitted({});
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    if (formData && formData.sections.length > activeSectionIndex) {
      const section = formData.sections[activeSectionIndex];
      const sectionErrors: Record<string, string> = {};
      for (const field of section.fields) {
        const err = validateField(field, values[field.field_key]);
        if (err) sectionErrors[field.field_key] = err;
      }
      setErrors(sectionErrors);
    }
  }, [values, formData, activeSectionIndex]);

  const handleChange = (key: string, value: any) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    const field = formData?.sections
      .flatMap((s) => s.fields)
      .find((f) => f.field_key === key);
    if (field) {
      const err = validateField(field, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (err) next[key] = err;
        else delete next[key];
        return next;
      });
    }
  };

  const validateSection = (section: FormSection): boolean => {
    let valid = true;
    const sectionErrors: Record<string, string> = {};
    for (const field of section.fields) {
      const err = validateField(field, values[field.field_key]);
      if (err) {
        valid = false;
        sectionErrors[field.field_key] = err;
      }
    }
    setErrors(sectionErrors);
    return valid;
  };

  const handleNext = async () => {
    if (!formData) return;
    const section = formData.sections[activeSectionIndex];
    if (!validateSection(section)) return;
    setSubmitted((prev) => ({ ...prev, [section.id]: true }));
    if (activeSectionIndex < formData.sections.length - 1) {
      setActiveSectionIndex((i) => i + 1);
    } else {
      await handleSubmit();
    }
  };

  const handlePrev = () => {
    if (activeSectionIndex > 0) setActiveSectionIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
    if (!formData) return;
    for (const section of formData.sections) {
      if (!validateSection(section)) return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api(`public/admissions/${slug.trim()}/applications`, {
        method: "POST",
        body: JSON.stringify({
          period_id: formData.period.id,
          track_id: values.track_id || null,
          target_grade_level_id: values.target_grade_level_id || null,
          name: values.name || values.FULL_NAME || values.nama_lengkap || "",
          email: values.email || values.EMAIL || "",
          phone: values.phone || values.PHONE || "",
          address: values.address || values.ADDRESS || "",
          birth_date: values.birth_date || values.BIRTH_DATE || "",
          gender: values.gender || values.GENDER || "",
          guardian_name: values.guardian_name || "",
          guardian_phone: values.guardian_phone || "",
        }),
      });
      setApplicationResult(res);
      setApplicationId(res.id);
      setAccessToken(res.access_token);
      setMessage(
        "Pendaftaran berhasil dikirim. Simpan nomor dan kode akses di bawah.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document) {
      setError("Pilih dokumen terlebih dahulu.");
      return;
    }
    if (document.size > 5 * 1024 * 1024) {
      setError("Ukuran dokumen maksimal 5 MB.");
      return;
    }
    if (!applicationId || !accessToken) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      setError("");
      try {
        await api(
          `public/admissions/${slug.trim()}/applications/${applicationId}/documents`,
          {
            method: "POST",
            body: JSON.stringify({
              access_token: accessToken,
              document_type: documentType,
              file_name: document.name,
              mime_type: document.type,
              data_base64: String(reader.result).split(",")[1],
            }),
          },
        );
        setDocument(null);
        setMessage("Dokumen berhasil diunggah dan menunggu verifikasi.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(document);
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setTracked(null);
    try {
      const data = await api(
        `public/admissions/${slug.trim()}/applications/${encodeURIComponent(tracking.registration.trim())}/status`,
        {
          method: "POST",
          body: JSON.stringify({ access_token: tracking.token.trim() }),
        },
      );
      setTracked(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setFormData(null);
    setApplicationResult(null);
    setApplicationId(null);
    setAccessToken(null);
    setValues({});
    setErrors({});
    setSubmitted({});
    setActiveSectionIndex(0);
    setMessage("");
  };

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
          <form className="sub-form" onSubmit={handleTrack}>
            <div className="form-grid">
              <label>
                Nomor pendaftaran
                <input
                  required
                  placeholder="PPDB-2026-…"
                  value={tracking.registration}
                  onChange={(e) =>
                    setTracking({ ...tracking, registration: e.target.value })
                  }
                />
              </label>
              <label>
                Kode akses
                <input
                  required
                  minLength={32}
                  value={tracking.token}
                  onChange={(e) =>
                    setTracking({ ...tracking, token: e.target.value })
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
              <span>{tracked.documents?.length ?? 0} dokumen tercatat</span>
            </div>
          )}
        </details>
        {!formData && !applicationResult ? (
          <>
            <section className="card padded stack-form">
              <h2>Temukan sekolah</h2>
              <div className="actions public-school-search">
                <label>
                  Kode sekolah
                  <input
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setPeriods([]);
                      setFormData(null);
                    }}
                  />
                </label>
                <button disabled={busy || !slug.trim()} onClick={loadPeriods}>
                  {busy ? "Mencari…" : "Lihat periode"}
                </button>
              </div>
            </section>
            {!!periods.length && (
              <form
                className="card padded stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <h2>Pilih periode</h2>
                <div className="form-grid">
                  <label>
                    Periode PPDB
                    <select
                      required
                      value={""}
                      onChange={(e) => {
                        const period = periods.find(
                          (p) => p.id === e.target.value,
                        );
                        if (period) loadForm(period.id);
                      }}
                    >
                      <option value="">Pilih periode</option>
                      {periods.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} · {row.academic_year}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </form>
            )}
          </>
        ) : formData && !applicationResult ? (
          <form
            className="card padded stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleNext();
            }}
          >
            <div className="form-progress">
              {formData.sections.map((s, i) => (
                <div
                  key={s.id}
                  className={`step ${submitted[s.id] ? "done" : i === activeSectionIndex ? "active" : ""}`}
                >
                  <span className="step-number">{i + 1}</span>
                  <span className="step-label">{s.name}</span>
                </div>
              ))}
            </div>
            <h2>{formData.sections[activeSectionIndex]?.name || "Formulir"}</h2>
            {formData.sections[activeSectionIndex]?.description && (
              <p className="muted">
                {formData.sections[activeSectionIndex].description}
              </p>
            )}
            <div className="form-grid">
              {formData.sections[activeSectionIndex].fields.map((field) =>
                renderField(field, values, handleChange, errors, busy),
              )}
            </div>
            <div className="form-actions">
              {activeSectionIndex > 0 && (
                <button type="button" onClick={handlePrev}>
                  Kembali
                </button>
              )}
              <button type="submit" className="primary" disabled={busy}>
                {activeSectionIndex === formData.sections.length - 1
                  ? "Kirim pendaftaran"
                  : "Lanjut"}
                {busy && "…"}
              </button>
            </div>
          </form>
        ) : applicationResult ? (
          <section className="card padded stack-form">
            <span className="eyebrow">PENDAFTARAN TERKIRIM</span>
            <h2>{applicationResult.registration_number}</h2>
            <p>
              Simpan kode akses berikut untuk memeriksa status atau mengunggah
              dokumen:
            </p>
            <code className="access-code">
              {applicationResult.access_token}
            </code>
            <form className="sub-form" onSubmit={handleDocumentUpload}>
              <h3>Unggah dokumen</h3>
              <div className="form-grid">
                <label>
                  Jenis dokumen
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
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
                    onChange={(e) => setDocument(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <button disabled={busy}>Unggah dokumen</button>
            </form>
            <button onClick={resetForm}>Buat pendaftaran lain</button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
