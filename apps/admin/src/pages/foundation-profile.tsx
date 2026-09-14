import { SortableTable } from "../sortable-table";
import React, { useEffect, useMemo, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Empty, ErrorBox } from "../components";

type Row = Record<string, any> & { id: string };
type FoundationProfile = Row & {
  slug: string;
  name: string;
  school_count: number;
  officials: Row[];
  licenses: Row[];
  documents: Row[];
  tax_profile: Row | null;
};
type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "email"
    | "url"
    | "number"
    | "textarea"
    | "checkbox"
    | "select";
  required?: boolean;
  options?: Array<[string, string]>;
};
type Editor = {
  target: "profile" | "tax" | "officials" | "licenses" | "documents";
  title: string;
  row?: Row;
};

const profileFields: Field[] = [
  { key: "code", label: "Kode yayasan", required: true },
  { key: "name", label: "Nama yayasan", required: true },
  { key: "short_name", label: "Nama singkat" },
  { key: "legal_name", label: "Nama legal" },
  {
    key: "legal_status",
    label: "Status badan hukum",
    type: "select",
    options: [
      ["ACTIVE", "Aktif"],
      ["INACTIVE", "Tidak aktif"],
      ["DISSOLVED", "Dibubarkan"],
    ],
  },
  {
    key: "foundation_type",
    label: "Jenis yayasan",
    type: "select",
    options: [
      ["EDUCATION", "Pendidikan"],
      ["SOCIAL", "Sosial"],
      ["RELIGIOUS", "Keagamaan"],
      ["HUMANITARIAN", "Kemanusiaan"],
      ["OTHER", "Lainnya"],
    ],
  },
  { key: "established_date", label: "Tanggal berdiri", type: "date" },
  { key: "legal_entity_number", label: "Nomor badan hukum" },
  { key: "legal_entity_date", label: "Tanggal badan hukum", type: "date" },
  { key: "ahu_registration_number", label: "Nomor pendaftaran AHU" },
  { key: "deed_number", label: "Nomor akta" },
  { key: "deed_date", label: "Tanggal akta", type: "date" },
  { key: "notary_name", label: "Nama notaris" },
  { key: "npwp", label: "NPWP" },
  { key: "nib", label: "NIB" },
  { key: "npyp", label: "NPYP" },
  { key: "address", label: "Alamat", type: "textarea" },
  { key: "province_id", label: "Kode provinsi" },
  { key: "city_id", label: "Kode kota/kabupaten" },
  { key: "district_id", label: "Kode kecamatan" },
  { key: "village_id", label: "Kode kelurahan/desa" },
  { key: "postal_code", label: "Kode pos" },
  { key: "phone", label: "Telepon" },
  { key: "email", label: "Email", type: "email" },
  { key: "website", label: "Website", type: "url" },
];
const taxFields: Field[] = [
  { key: "npwp", label: "NPWP" },
  {
    key: "tax_status",
    label: "Status pajak",
    type: "select",
    required: true,
    options: [
      ["UNREGISTERED", "Belum terdaftar"],
      ["REGISTERED", "Terdaftar"],
      ["INACTIVE", "Tidak aktif"],
    ],
  },
  {
    key: "pkp_status",
    label: "Status PKP",
    type: "select",
    required: true,
    options: [
      ["NON_PKP", "Non-PKP"],
      ["PKP", "PKP"],
    ],
  },
  { key: "tax_office_name", label: "Nama KPP" },
  { key: "tax_office_code", label: "Kode KPP" },
  {
    key: "bookkeeping_start_month",
    label: "Bulan awal pembukuan",
    type: "number",
    required: true,
  },
  { key: "fiscal_year_start", label: "Awal tahun fiskal", type: "date" },
  { key: "tax_email", label: "Email pajak", type: "email" },
  { key: "tax_phone", label: "Telepon pajak" },
];
const officialFields: Field[] = [
  { key: "person_name", label: "Nama pengurus", required: true },
  {
    key: "organ_type",
    label: "Organ yayasan",
    type: "select",
    required: true,
    options: [
      ["PEMBINA", "Pembina"],
      ["PENGURUS", "Pengurus"],
      ["PENGAWAS", "Pengawas"],
    ],
  },
  { key: "position", label: "Jabatan", required: true },
  { key: "start_date", label: "Mulai menjabat", type: "date", required: true },
  { key: "end_date", label: "Akhir menjabat", type: "date" },
  {
    key: "appointment_document_id",
    label: "Dokumen pengangkatan",
    type: "select",
  },
  { key: "is_active", label: "Masih aktif", type: "checkbox" },
];
const licenseFields: Field[] = [
  {
    key: "license_type",
    label: "Jenis perizinan",
    type: "select",
    required: true,
    options: [
      ["AHU_APPROVAL", "Pengesahan AHU"],
      ["NIB", "NIB"],
      ["TAX_REGISTRATION", "Registrasi pajak"],
      ["DOMICILE", "Domisili"],
      ["FOUNDATION_OPERATIONAL", "Operasional yayasan"],
      ["OTHER", "Lainnya"],
    ],
  },
  { key: "license_number", label: "Nomor perizinan", required: true },
  { key: "issued_by", label: "Diterbitkan oleh" },
  { key: "issue_date", label: "Tanggal terbit", type: "date" },
  { key: "valid_from", label: "Berlaku mulai", type: "date" },
  { key: "valid_until", label: "Berlaku sampai", type: "date" },
  { key: "document_id", label: "Dokumen terkait", type: "select" },
  {
    key: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      ["DRAFT", "Draft"],
      ["ACTIVE", "Aktif"],
      ["EXPIRED", "Kedaluwarsa"],
      ["REVOKED", "Dicabut"],
    ],
  },
  { key: "notes", label: "Catatan", type: "textarea" },
];
const documentFields: Field[] = [
  { key: "document_type", label: "Jenis dokumen", required: true },
  { key: "document_number", label: "Nomor dokumen" },
  { key: "document_date", label: "Tanggal dokumen", type: "date" },
  { key: "file_url", label: "Tautan berkas", type: "url" },
  { key: "valid_from", label: "Berlaku mulai", type: "date" },
  { key: "valid_until", label: "Berlaku sampai", type: "date" },
  { key: "is_active", label: "Dokumen aktif", type: "checkbox" },
  { key: "notes", label: "Catatan", type: "textarea" },
];

const dateValue = (input: unknown) =>
  input == null ? "" : String(input).slice(0, 10);
const shown = (input: unknown) =>
  input == null || input === "" ? "—" : String(input);
const statusLabel = (status: unknown) =>
  ({
    ACTIVE: "Aktif",
    INACTIVE: "Tidak aktif",
    DISSOLVED: "Dibubarkan",
    DRAFT: "Draft",
    EXPIRED: "Kedaluwarsa",
    REVOKED: "Dicabut",
  })[String(status)] || shown(status);

function EditorDrawer({
  editor,
  profile,
  busy,
  onClose,
  onSave,
}: {
  editor: Editor;
  profile: FoundationProfile;
  busy: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const fields =
    editor.target === "profile"
      ? profileFields
      : editor.target === "tax"
        ? taxFields
        : editor.target === "officials"
          ? officialFields
          : editor.target === "licenses"
            ? licenseFields
            : documentFields;
  const source: Record<string, any> =
    editor.target === "profile"
      ? { ...profile, code: profile.slug }
      : editor.target === "tax"
        ? profile.tax_profile || {
            tax_status: "REGISTERED",
            pkp_status: "NON_PKP",
            bookkeeping_start_month: 1,
          }
        : editor.row || { is_active: true, status: "ACTIVE" };
  const [form, setForm] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === "checkbox"
          ? source[field.key] !== false
          : field.type === "date"
            ? dateValue(source[field.key])
            : source[field.key] == null
              ? ""
              : String(source[field.key]),
      ]),
    ),
  );
  const documents = profile.documents.map(
    (document) =>
      [
        document.id,
        `${document.document_type}${document.document_number ? ` · ${document.document_number}` : ""}`,
      ] as [string, string],
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = Object.fromEntries(
      fields.map((field) => {
        const raw = form[field.key];
        if (field.type === "checkbox") return [field.key, Boolean(raw)];
        if (field.type === "number") return [field.key, Number(raw)];
        return [field.key, raw === "" && !field.required ? null : raw];
      }),
    );
    await onSave(data);
  };
  return (
    <div className="school-drawer-layer">
      <button
        className="school-drawer-backdrop"
        aria-label="Tutup formulir"
        onClick={onClose}
      />
      <aside
        className="school-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="foundation-drawer-title"
      >
        <div className="school-drawer-header">
          <div>
            <span className="eyebrow">YAYASAN</span>
            <h2 id="foundation-drawer-title">{editor.title}</h2>
          </div>
          <button aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="school-editor-form"
          onSubmit={(event) => void submit(event)}
        >
          {fields.map((field) => {
            const options =
              field.key === "document_id" ||
              field.key === "appointment_document_id"
                ? documents
                : field.options;
            if (field.type === "checkbox")
              return (
                <label className="check" key={field.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(form[field.key])}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.target.checked })
                    }
                  />{" "}
                  {field.label}
                </label>
              );
            return (
              <label key={field.key}>
                {field.label}
                {field.type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.target.value })
                    }
                  />
                ) : options ? (
                  <select
                    required={field.required}
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.target.value })
                    }
                  >
                    <option value="">Pilih {field.label.toLowerCase()}</option>
                    {options.map(([optionValue, label]) => (
                      <option key={optionValue} value={optionValue}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required={field.required}
                    type={field.type || "text"}
                    min={field.type === "number" ? 1 : undefined}
                    max={field.type === "number" ? 12 : undefined}
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm({ ...form, [field.key]: event.target.value })
                    }
                  />
                )}
              </label>
            );
          })}
          <div className="school-drawer-actions">
            <button type="button" onClick={onClose}>
              Batal
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function DataSection({
  title,
  rows,
  columns,
  search,
  setSearch,
  creatable,
  editable,
  deletable,
  onNew,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: Row[];
  columns: Array<[string, string]>;
  search: string;
  setSearch: (value: string) => void;
  creatable: boolean;
  editable: boolean;
  deletable: boolean;
  onNew: () => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(30);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        Object.values(row).some((cell) =>
          String(cell || "")
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
      ),
    [rows, search],
  );
  useEffect(() => setVisibleCount(30), [search, rows.length]);
  const visible = filtered.slice(0, visibleCount);
  return (
    <section className="card padded foundation-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              type="search"
              aria-label={`Cari ${title}`}
              placeholder={`Cari ${title.toLowerCase()}…`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {creatable && (
            <button className="primary" onClick={onNew}>
              + Tambah
            </button>
          )}
        </div>
      </div>
      {!filtered.length ? (
        <Empty text={`Belum ada data ${title.toLowerCase()}.`} />
      ) : (
        <div
          className="table-wrap"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              element.scrollTop + element.clientHeight >=
              element.scrollHeight - 80
            )
              setVisibleCount((count) => Math.min(count + 30, filtered.length));
          }}
        >
          <SortableTable
            rowLimit={visibleCount}
            onSortChange={() => setVisibleCount(30)}
          >
            <thead>
              <tr>
                {columns.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
                {(editable || deletable) && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {columns.map(([key]) => (
                    <td key={key}>
                      {key === "status"
                        ? statusLabel(row[key])
                        : key.includes("date") || key === "valid_until"
                          ? dateValue(row[key]) || "—"
                          : shown(row[key])}
                    </td>
                  ))}
                  {(editable || deletable) && (
                    <td>
                      <div className="school-table-actions">
                        {editable && (
                          <button onClick={() => onEdit(row)}>Edit</button>
                        )}
                        {deletable && (
                          <button onClick={() => onDelete(row)}>Hapus</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </SortableTable>
          {visible.length < filtered.length && (
            <div className="table-lazy-status" role="status">
              Scroll untuk memuat data berikutnya…
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function FoundationProfilePage({ user }: { user: Actor }) {
  const [profile, setProfile] = useState<FoundationProfile | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState({
    officials: "",
    licenses: "",
    documents: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = can(user, "foundation.update");
  const creatable = can(user, "foundation.create");
  const deletable = can(user, "foundation.delete");
  const load = async () => {
    try {
      setProfile(await api<FoundationProfile>("foundation-profile"));
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (data: Record<string, unknown>) => {
    if (!editor) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (editor.target === "profile")
        await send("foundation-profile", data, "PATCH");
      else if (editor.target === "tax")
        await send("foundation-profile/tax", data, "PATCH");
      else
        await send(
          `foundation-profile/${editor.target}${editor.row ? `/${editor.row.id}` : ""}`,
          data,
          editor.row ? "PATCH" : "POST",
        );
      await load();
      setEditor(null);
      setMessage("Data yayasan berhasil disimpan.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (target: Editor["target"], row: Row) => {
    if (!deletable || !confirm("Hapus data ini dari profil yayasan?")) return;
    setBusy(true);
    setError("");
    try {
      await api(`foundation-profile/${target}/${row.id}`, { method: "DELETE" });
      await load();
      setMessage("Data yayasan berhasil dihapus.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!profile)
    return (
      <>
        <div className="page-title">
          <div>
            <span className="eyebrow">YAYASAN</span>
            <h1>Profil Yayasan</h1>
          </div>
        </div>
        <ErrorBox error={error} />
        {!error && <p className="muted">Memuat profil yayasan…</p>}
      </>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YAYASAN</span>
          <h1>Profil Yayasan</h1>
        </div>
        {editable && (
          <button
            className="primary"
            onClick={() =>
              setEditor({ target: "profile", title: "Edit profil yayasan" })
            }
          >
            Edit profil
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {message && <p className="notice success">{message}</p>}
      <div className="metric-grid foundation-metrics">
        <div className="metric">
          <span className="muted">NAMA LEGAL</span>
          <strong>{profile.legal_name || profile.name}</strong>
        </div>
        <div className="metric">
          <span className="muted">NPYP</span>
          <strong>{profile.npyp || "Belum diisi"}</strong>
        </div>
        <div className="metric accent">
          <span className="muted">SEKOLAH TERHUBUNG</span>
          <strong>{profile.school_count}</strong>
        </div>
      </div>
      <div className="foundation-overview">
        <section className="card padded">
          <div className="section-heading">
            <h2>Identitas & badan hukum</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Nama yayasan</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt>Kode yayasan</dt>
              <dd>{profile.slug}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(profile.legal_status)}</dd>
            </div>
            <div>
              <dt>Nomor badan hukum</dt>
              <dd>{shown(profile.legal_entity_number)}</dd>
            </div>
            <div>
              <dt>Nomor AHU</dt>
              <dd>{shown(profile.ahu_registration_number)}</dd>
            </div>
            <div>
              <dt>Akta & notaris</dt>
              <dd>
                {shown(profile.deed_number)} · {shown(profile.notary_name)}
              </dd>
            </div>
            <div>
              <dt>NPWP / NIB</dt>
              <dd>
                {shown(profile.npwp)} / {shown(profile.nib)}
              </dd>
            </div>
            <div>
              <dt>Alamat</dt>
              <dd>{shown(profile.address)}</dd>
            </div>
            <div>
              <dt>Kontak</dt>
              <dd>
                {shown(profile.phone)} · {shown(profile.email)}
              </dd>
            </div>
          </dl>
        </section>
        <section className="card padded">
          <div className="section-heading">
            <h2>Profil perpajakan</h2>
            {editable && (
              <button
                onClick={() =>
                  setEditor({ target: "tax", title: "Edit profil perpajakan" })
                }
              >
                Edit
              </button>
            )}
          </div>
          <dl className="detail-list">
            <div>
              <dt>NPWP</dt>
              <dd>{shown(profile.tax_profile?.npwp || profile.npwp)}</dd>
            </div>
            <div>
              <dt>Status pajak</dt>
              <dd>{shown(profile.tax_profile?.tax_status)}</dd>
            </div>
            <div>
              <dt>Status PKP</dt>
              <dd>{shown(profile.tax_profile?.pkp_status)}</dd>
            </div>
            <div>
              <dt>KPP</dt>
              <dd>{shown(profile.tax_profile?.tax_office_name)}</dd>
            </div>
            <div>
              <dt>Awal pembukuan</dt>
              <dd>
                Bulan {shown(profile.tax_profile?.bookkeeping_start_month)}
              </dd>
            </div>
            <div>
              <dt>Kontak pajak</dt>
              <dd>
                {shown(profile.tax_profile?.tax_email)} ·{" "}
                {shown(profile.tax_profile?.tax_phone)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <DataSection
        title="Pengurus yayasan"
        rows={profile.officials}
        columns={[
          ["person_name", "Nama"],
          ["organ_type", "Organ"],
          ["position", "Jabatan"],
          ["start_date", "Mulai"],
          ["end_date", "Selesai"],
        ]}
        search={search.officials}
        setSearch={(officials) => setSearch({ ...search, officials })}
        creatable={creatable}
        editable={editable}
        deletable={deletable}
        onNew={() =>
          setEditor({ target: "officials", title: "Tambah pengurus" })
        }
        onEdit={(row) =>
          setEditor({ target: "officials", title: "Edit pengurus", row })
        }
        onDelete={(row) => void remove("officials", row)}
      />
      <DataSection
        title="Perizinan yayasan"
        rows={profile.licenses}
        columns={[
          ["license_type", "Jenis"],
          ["license_number", "Nomor"],
          ["issued_by", "Penerbit"],
          ["valid_until", "Berlaku sampai"],
          ["status", "Status"],
        ]}
        search={search.licenses}
        setSearch={(licenses) => setSearch({ ...search, licenses })}
        creatable={creatable}
        editable={editable}
        deletable={deletable}
        onNew={() =>
          setEditor({ target: "licenses", title: "Tambah perizinan" })
        }
        onEdit={(row) =>
          setEditor({ target: "licenses", title: "Edit perizinan", row })
        }
        onDelete={(row) => void remove("licenses", row)}
      />
      <DataSection
        title="Dokumen yayasan"
        rows={profile.documents}
        columns={[
          ["document_type", "Jenis"],
          ["document_number", "Nomor"],
          ["document_date", "Tanggal"],
          ["valid_until", "Berlaku sampai"],
        ]}
        search={search.documents}
        setSearch={(documents) => setSearch({ ...search, documents })}
        creatable={creatable}
        editable={editable}
        deletable={deletable}
        onNew={() =>
          setEditor({ target: "documents", title: "Tambah dokumen" })
        }
        onEdit={(row) =>
          setEditor({ target: "documents", title: "Edit dokumen", row })
        }
        onDelete={(row) => void remove("documents", row)}
      />
      {editor && (
        <EditorDrawer
          editor={editor}
          profile={profile}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
    </>
  );
}
