import { SortableTable } from "../sortable-table";
import React, { useEffect, useState } from "react";
import type {
  Actor,
  SitePhoto,
  SiteProfile,
  SiteSummary,
} from "../../../../packages/shared-types/src";
import type { Catalog } from "../components";
import { ErrorBox, can } from "../components";
import { api, authenticatedBlobUrl, send } from "../api";

export function DashboardPage({
  user,
  catalog,
  sites,
}: {
  user: Actor;
  catalog: Catalog;
  sites: SiteSummary[];
}) {
  const metrics: Array<[string, number]> = [
    ["Siswa aktif", catalog.students?.length || 0],
    ["Guru", catalog.teachers?.length || 0],
    ["Kelas", catalog.classes?.length || 0],
    ["Lokasi", sites.length || 1],
  ];
  const shortcuts = [
    ["Absensi", "attendance", can(user, "attendance.read")],
    ["Input nilai", "grades", can(user, "grade.read")],
    ["Tagihan", "billing", can(user, "finance.read")],
    ["Agenda", "events", can(user, "event.read")],
    ["Data siswa", "students", can(user, "student.read")],
    ["List sekolah", "sites", can(user, "site.read")],
  ].filter((item) => item[2]);
  return (
    <>
      <div className="page-title dashboard-heading">
        <div>
          <span className="eyebrow">DASHBOARD</span>
          <h1>Selamat datang, {user.name}</h1>
          <p className="muted">
            {user.organization_name} · {user.tenant_name}
          </p>
        </div>
        <span className="site-status">Lokasi aktif</span>
      </div>
      <section className="dashboard-metrics" aria-label="Ringkasan data">
        {metrics.map(([label, value], index) => (
          <article
            className={index === 0 ? "metric accent" : "metric"}
            key={label}
          >
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="card padded">
        <div className="section-title">
          <span className="eyebrow">AKSES CEPAT</span>
          <h2>Pekerjaan utama</h2>
        </div>
        <div className="shortcut-grid">
          {shortcuts.map(([title, route]) => (
            <a href={"#" + route} key={String(route)}>
              <span>{title}</span>
              <strong>→</strong>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

type SchoolForm = {
  name: string;
  slug: string;
  address: string;
  phone: string;
  principal_teacher_id: string;
  education_authority: "KEMENDIKBUD" | "KEMENAG";
  school_level: "PAUD" | "TK" | "SD" | "SMP" | "SMA";
  npsn: string;
  nss: string;
  dapodik_id: string;
  nsm: string;
  emis_id: string;
  education_form: string;
  ownership_status: "PUBLIC" | "PRIVATE";
  province_id: string;
  city_id: string;
  district_id: string;
  village_id: string;
  postal_code: string;
  establishment_decree_number: string;
  establishment_decree_date: string;
  operational_license_number: string;
  operational_license_start: string;
  operational_license_end: string;
  accreditation: string;
  accreditation_number: string;
  accreditation_valid_until: string;
};

const emptySchoolForm: SchoolForm = {
  name: "",
  slug: "",
  address: "",
  phone: "",
  principal_teacher_id: "",
  education_authority: "KEMENDIKBUD",
  school_level: "SMP",
  npsn: "",
  nss: "",
  dapodik_id: "",
  nsm: "",
  emis_id: "",
  education_form: "",
  ownership_status: "PRIVATE",
  province_id: "",
  city_id: "",
  district_id: "",
  village_id: "",
  postal_code: "",
  establishment_decree_number: "",
  establishment_decree_date: "",
  operational_license_number: "",
  operational_license_start: "",
  operational_license_end: "",
  accreditation: "",
  accreditation_number: "",
  accreditation_valid_until: "",
};

type SchoolView = "big-thumbnail" | "table";

function schoolLevelLabel(site: SiteSummary) {
  if (!site.school_level) return "—";
  if (site.education_authority !== "KEMENAG") return site.school_level;
  const aliases = {
    PAUD: "RA",
    TK: "RA",
    SD: "MI",
    SMP: "MTs",
    SMA: "MA",
  } as const;
  return `${site.school_level} (${aliases[site.school_level]})`;
}

function formFromProfile(profile: SiteProfile): SchoolForm {
  return {
    name: profile.school_name || profile.name,
    slug: profile.slug,
    address: profile.address || "",
    phone: profile.phone || "",
    principal_teacher_id: profile.principal_teacher_id || "",
    education_authority: profile.education_authority || "KEMENDIKBUD",
    school_level: profile.school_level || "SMP",
    npsn: profile.npsn || "",
    nss: profile.nss || "",
    dapodik_id: profile.dapodik_id || "",
    nsm: profile.nsm || "",
    emis_id: profile.emis_id || "",
    education_form: profile.education_form || "",
    ownership_status: profile.ownership_status || "PRIVATE",
    province_id: profile.province_id || "",
    city_id: profile.city_id || "",
    district_id: profile.district_id || "",
    village_id: profile.village_id || "",
    postal_code: profile.postal_code || "",
    establishment_decree_number: profile.establishment_decree_number || "",
    establishment_decree_date: profile.establishment_decree_date || "",
    operational_license_number: profile.operational_license_number || "",
    operational_license_start: profile.operational_license_start || "",
    operational_license_end: profile.operational_license_end || "",
    accreditation: profile.accreditation || "",
    accreditation_number: profile.accreditation_number || "",
    accreditation_valid_until: profile.accreditation_valid_until || "",
  };
}

async function encodePhoto(photo: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Foto tidak dapat dibaca"));
    reader.readAsDataURL(photo);
  });
  return {
    file_name: photo.name,
    mime_type: photo.type,
    data_base64: data,
  };
}

function SchoolPhoto({
  site,
  photo,
}: {
  site: SiteSummary;
  photo?: SitePhoto;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!photo) {
      setUrl("");
      return;
    }
    let active = true;
    let objectUrl = "";
    authenticatedBlobUrl("sites/" + site.id + "/photos/" + photo.id + "/file")
      .then((value) => {
        objectUrl = value;
        if (active) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [site.id, photo?.id]);
  return (
    <div className="site-card-photo">
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">LS</span>}
    </div>
  );
}

type SchoolEditorProps = {
  mode: "new" | "edit";
  form: SchoolForm;
  setForm: React.Dispatch<React.SetStateAction<SchoolForm>>;
  profile: SiteProfile | null;
  pendingPhotos: File[];
  setPendingPhotos: React.Dispatch<React.SetStateAction<File[]>>;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
};

function SchoolEditor({
  mode,
  form,
  setForm,
  profile,
  pendingPhotos,
  setPendingPhotos,
  busy,
  onSubmit,
  onDeletePhoto,
}: SchoolEditorProps) {
  const setField = <K extends keyof SchoolForm>(key: K, value: SchoolForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const kemendikbud = form.education_authority === "KEMENDIKBUD";
  return (
    <form className="school-editor-form" onSubmit={onSubmit}>
      <label>
        Nama sekolah *
        <input
          required
          value={form.name}
          onChange={(event) => setField("name", event.target.value)}
        />
      </label>
      {mode === "new" && (
        <label>
          Kode lokasi *
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) =>
              setField("slug", event.target.value.toLowerCase())
            }
            placeholder="kampus-bandung"
          />
        </label>
      )}
      <label>
        Alamat *
        <textarea
          required
          rows={3}
          value={form.address}
          onChange={(event) => setField("address", event.target.value)}
        />
      </label>
      <label>
        Telepon *
        <input
          required
          type="tel"
          value={form.phone}
          onChange={(event) => setField("phone", event.target.value)}
        />
      </label>
      <fieldset className="school-photo-field">
        <legend>Wilayah sekolah</legend>
        <label>
          Provinsi
          <input
            value={form.province_id}
            onChange={(event) => setField("province_id", event.target.value)}
          />
        </label>
        <label>
          Kabupaten/Kota
          <input
            value={form.city_id}
            onChange={(event) => setField("city_id", event.target.value)}
          />
        </label>
        <label>
          Kecamatan
          <input
            value={form.district_id}
            onChange={(event) => setField("district_id", event.target.value)}
          />
        </label>
        <label>
          Kelurahan/Desa
          <input
            value={form.village_id}
            onChange={(event) => setField("village_id", event.target.value)}
          />
        </label>
        <label>
          Kode pos
          <input
            value={form.postal_code}
            onChange={(event) => setField("postal_code", event.target.value)}
          />
        </label>
      </fieldset>
      <label>
        Kepala sekolah
        <select
          disabled={mode === "new" || !profile?.teachers.length}
          value={form.principal_teacher_id}
          onChange={(event) =>
            setField("principal_teacher_id", event.target.value)
          }
        >
          <option value="">Pilih guru</option>
          {profile?.teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name} · {teacher.nip}
            </option>
          ))}
        </select>
        {mode === "new" && (
          <span className="helper">
            Tambahkan guru pada lokasi ini dahulu, lalu pilih kepala sekolah
            melalui editor.
          </span>
        )}
      </label>
      <label>
        Naungan *
        <select
          required
          value={form.education_authority}
          onChange={(event) =>
            setField(
              "education_authority",
              event.target.value as SchoolForm["education_authority"],
            )
          }
        >
          <option value="KEMENDIKBUD">Kemendikbud</option>
          <option value="KEMENAG">Kemenag</option>
        </select>
      </label>
      <label>
        Jenjang sekolah *
        <select
          required
          value={form.school_level}
          onChange={(event) =>
            setField(
              "school_level",
              event.target.value as SchoolForm["school_level"],
            )
          }
        >
          <option value="PAUD">PAUD{kemendikbud ? "" : " (RA)"}</option>
          <option value="TK">TK{kemendikbud ? "" : " (RA)"}</option>
          <option value="SD">SD{kemendikbud ? "" : " (MI)"}</option>
          <option value="SMP">SMP{kemendikbud ? "" : " (MTs)"}</option>
          <option value="SMA">SMA{kemendikbud ? "" : " (MA)"}</option>
        </select>
      </label>
      <label>
        NPSN *
        <input
          required
          value={form.npsn}
          onChange={(event) => setField("npsn", event.target.value)}
        />
      </label>
      <label>
        Bentuk pendidikan
        <input
          value={form.education_form}
          onChange={(event) => setField("education_form", event.target.value)}
          placeholder="Contoh: Sekolah Menengah Pertama"
        />
      </label>
      <label>
        Status kepemilikan
        <select
          value={form.ownership_status}
          onChange={(event) =>
            setField(
              "ownership_status",
              event.target.value as SchoolForm["ownership_status"],
            )
          }
        >
          <option value="PRIVATE">Swasta</option>
          <option value="PUBLIC">Negeri</option>
        </select>
      </label>
      {kemendikbud ? (
        <>
          <label>
            NSS *
            <input
              required
              value={form.nss}
              onChange={(event) => setField("nss", event.target.value)}
            />
          </label>
          <label>
            ID Dapodik *
            <input
              required
              value={form.dapodik_id}
              onChange={(event) => setField("dapodik_id", event.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            NSM *
            <input
              required
              value={form.nsm}
              onChange={(event) => setField("nsm", event.target.value)}
            />
          </label>
          <label>
            ID EMIS *
            <input
              required
              value={form.emis_id}
              onChange={(event) => setField("emis_id", event.target.value)}
            />
          </label>
        </>
      )}
      <fieldset className="school-photo-field">
        <legend>SK pendirian sekolah</legend>
        <label>
          Nomor SK
          <input
            value={form.establishment_decree_number}
            onChange={(event) =>
              setField("establishment_decree_number", event.target.value)
            }
          />
        </label>
        <label>
          Tanggal SK
          <input
            type="date"
            value={form.establishment_decree_date}
            onChange={(event) =>
              setField("establishment_decree_date", event.target.value)
            }
          />
        </label>
      </fieldset>
      <fieldset className="school-photo-field">
        <legend>Izin operasional sekolah</legend>
        <label>
          Nomor izin
          <input
            value={form.operational_license_number}
            onChange={(event) =>
              setField("operational_license_number", event.target.value)
            }
          />
        </label>
        <label>
          Berlaku mulai
          <input
            type="date"
            value={form.operational_license_start}
            onChange={(event) =>
              setField("operational_license_start", event.target.value)
            }
          />
        </label>
        <label>
          Berlaku sampai
          <input
            type="date"
            value={form.operational_license_end}
            onChange={(event) =>
              setField("operational_license_end", event.target.value)
            }
          />
        </label>
      </fieldset>
      <fieldset className="school-photo-field">
        <legend>Akreditasi</legend>
        <label>
          Peringkat
          <input
            value={form.accreditation}
            onChange={(event) => setField("accreditation", event.target.value)}
            placeholder="Contoh: A"
          />
        </label>
        <label>
          Nomor akreditasi
          <input
            value={form.accreditation_number}
            onChange={(event) =>
              setField("accreditation_number", event.target.value)
            }
          />
        </label>
        <label>
          Berlaku sampai
          <input
            type="date"
            value={form.accreditation_valid_until}
            onChange={(event) =>
              setField("accreditation_valid_until", event.target.value)
            }
          />
        </label>
      </fieldset>
      <fieldset className="school-photo-field">
        <legend>Foto sekolah</legend>
        {!!profile?.photos.length && (
          <div className="school-photo-list">
            {profile.photos.map((photo) => (
              <div key={photo.id}>
                <span title={photo.file_name}>{photo.file_name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeletePhoto(photo.id)}
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(event) =>
            setPendingPhotos(Array.from(event.target.files || []))
          }
        />
        <span className="helper">
          PNG/JPG, maksimal 5 MB per foto. Beberapa foto dapat dipilih
          sekaligus.
        </span>
        {!!pendingPhotos.length && (
          <span className="badge">
            {pendingPhotos.length} foto siap diunggah
          </span>
        )}
      </fieldset>
      <div className="school-drawer-actions">
        <button className="primary" disabled={busy}>
          {busy
            ? "Menyimpan…"
            : mode === "new"
              ? "Tambah sekolah"
              : "Simpan perubahan"}
        </button>
      </div>
    </form>
  );
}

export function SitesPage({
  user,
  sites,
  reload,
  switchSite,
}: {
  user: Actor;
  sites: SiteSummary[];
  reload: () => Promise<void>;
  switchSite: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<SchoolForm>({ ...emptySchoolForm });
  const [mode, setMode] = useState<"new" | "edit" | null>(null);
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [view, setViewState] = useState<SchoolView>(() => {
    const saved = localStorage.getItem("langkahsiswa:sites:view");
    return saved === "table" ? "table" : "big-thumbnail";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  const editable = can(user, "site.write");
  const query = search.trim().toLocaleLowerCase("id-ID");
  const filteredSites = sites.filter((site) =>
    [
      site.school_name,
      site.name,
      site.slug,
      site.address,
      site.school_level,
      site.education_authority,
      site.npsn,
    ]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query),
  );
  const visibleSites = filteredSites.slice(0, visibleLimit);

  useEffect(() => setVisibleLimit(30), [search, view]);

  const loadMoreSites = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      element.scrollTop + element.clientHeight >= element.scrollHeight - 80 &&
      visibleLimit < filteredSites.length
    )
      setVisibleLimit((current) => current + 30);
  };

  const setView = (next: SchoolView) => {
    setViewState(next);
    localStorage.setItem("langkahsiswa:sites:view", next);
  };

  const closeDrawer = () => {
    if (busy) return;
    setMode(null);
    setProfile(null);
    setPendingPhotos([]);
    setForm({ ...emptySchoolForm });
  };

  const openNew = () => {
    setError("");
    setMessage("");
    setProfile(null);
    setPendingPhotos([]);
    setForm({ ...emptySchoolForm });
    setMode("new");
  };

  const openEdit = async (site: SiteSummary) => {
    setMode("edit");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const detail = await api<SiteProfile>("sites/" + site.id);
      setProfile(detail);
      setForm(formFromProfile(detail));
    } catch (reason) {
      setError((reason as Error).message);
      setMode(null);
    } finally {
      setBusy(false);
    }
  };

  const saveSchool = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const registry =
      form.education_authority === "KEMENDIKBUD"
        ? {
            nss: form.nss,
            dapodik_id: form.dapodik_id,
            nsm: null,
            emis_id: null,
          }
        : {
            nss: null,
            dapodik_id: null,
            nsm: form.nsm,
            emis_id: form.emis_id,
          };
    const legalProfile = {
      education_form: form.education_form || null,
      ownership_status: form.ownership_status,
      province_id: form.province_id || null,
      city_id: form.city_id || null,
      district_id: form.district_id || null,
      village_id: form.village_id || null,
      postal_code: form.postal_code || null,
      establishment_decree_number: form.establishment_decree_number || null,
      establishment_decree_date: form.establishment_decree_date || null,
      operational_license_number: form.operational_license_number || null,
      operational_license_start: form.operational_license_start || null,
      operational_license_end: form.operational_license_end || null,
      accreditation: form.accreditation || null,
      accreditation_number: form.accreditation_number || null,
      accreditation_valid_until: form.accreditation_valid_until || null,
    };
    try {
      let siteId = profile?.id;
      if (mode === "new") {
        const created = await send("sites", {
          name: form.name,
          slug: form.slug,
          school_name: form.name,
          address: form.address,
          phone: form.phone,
          education_authority: form.education_authority,
          school_level: form.school_level,
          npsn: form.npsn,
          ...registry,
          ...legalProfile,
        });
        siteId = created.id;
      } else if (siteId) {
        await send(
          "sites/" + siteId,
          {
            name: form.name,
            school_name: form.name,
            address: form.address,
            phone: form.phone,
            principal_teacher_id: form.principal_teacher_id || null,
            education_authority: form.education_authority,
            school_level: form.school_level,
            npsn: form.npsn,
            ...registry,
            ...legalProfile,
          },
          "PATCH",
        );
      }
      if (siteId) {
        for (const photo of pendingPhotos)
          await send("sites/" + siteId + "/photos", await encodePhoto(photo));
      }
      await reload();
      setMessage(
        mode === "new"
          ? "Sekolah baru berhasil ditambahkan."
          : "Data sekolah berhasil diperbarui.",
      );
      setMode(null);
      setProfile(null);
      setPendingPhotos([]);
      setForm({ ...emptySchoolForm });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!profile) return;
    setBusy(true);
    try {
      await api("sites/" + profile.id + "/photos/" + photoId, {
        method: "DELETE",
      });
      setProfile({
        ...profile,
        photos: profile.photos.filter((photo) => photo.id !== photoId),
      });
      await reload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YAYASAN</span>
          <h1>List Sekolah</h1>
        </div>
        <div className="page-actions">
          <div className="filter-toolbar">
            <input
              aria-label="Cari sekolah"
              placeholder="Cari sekolah…"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            <button
              className={view === "big-thumbnail" ? "active" : ""}
              type="button"
              aria-label="Big Thumbnail"
              title="Big Thumbnail"
              aria-pressed={view === "big-thumbnail"}
              onClick={() => setView("big-thumbnail")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="8" height="8" rx="1" />
                <rect x="13" y="3" width="8" height="8" rx="1" />
                <rect x="3" y="13" width="8" height="8" rx="1" />
                <rect x="13" y="13" width="8" height="8" rx="1" />
              </svg>
            </button>
            <button
              className={view === "table" ? "active" : ""}
              type="button"
              aria-label="Table"
              title="Table"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="1" />
                <path d="M3 9h18M3 14h18M9 4v16" />
              </svg>
            </button>
          </div>
          {editable && (
            <button className="primary" onClick={openNew}>
              + Tambah sekolah
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      {message && <p className="notice success">{message}</p>}
      {view === "big-thumbnail" ? (
        <section
          className="site-list"
          aria-label="Sekolah dalam tampilan big thumbnail"
        >
          {filteredSites.map((site) => (
            <article
              className={
                site.current ? "card site-card current" : "card site-card"
              }
              key={site.id}
            >
              <SchoolPhoto site={site} photo={site.photos?.[0]} />
              {editable && (
                <button
                  className="site-card-menu thumbnail-menu-button"
                  aria-label={"Edit " + (site.school_name || site.name)}
                  onClick={() => void openEdit(site)}
                >
                  ☰
                </button>
              )}
              <div className="site-card-body">
                <span className="eyebrow">
                  {site.is_primary ? "LOKASI UTAMA" : "LOKASI"}
                </span>
                <h2>{site.school_name || site.name}</h2>
                <p className="site-address">
                  {site.address || "Alamat belum dilengkapi"}
                </p>
                <dl className="site-card-meta">
                  <div>
                    <dt>Telepon</dt>
                    <dd>{site.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt>Kepala sekolah</dt>
                    <dd>{site.principal_name || "—"}</dd>
                  </div>
                  <div>
                    <dt>NPSN</dt>
                    <dd>{site.npsn || "—"}</dd>
                  </div>
                  <div>
                    <dt>Naungan</dt>
                    <dd>
                      {site.education_authority === "KEMENAG"
                        ? "Kemenag"
                        : "Kemendikbud"}
                    </dd>
                  </div>
                  <div>
                    <dt>Jenjang</dt>
                    <dd>{schoolLevelLabel(site)}</dd>
                  </div>
                  <div>
                    <dt>Kepemilikan</dt>
                    <dd>
                      {site.ownership_status === "PUBLIC" ? "Negeri" : "Swasta"}
                    </dd>
                  </div>
                  <div>
                    <dt>Akreditasi</dt>
                    <dd>{site.accreditation || "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className="site-card-footer">
                <span className="muted">Kode: {site.slug}</span>
                {site.current ? (
                  <span className="site-status">Sedang digunakan</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => void switchSite(site.id)}
                  >
                    Buka lokasi
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section
          className="card school-table"
          aria-label="Sekolah dalam tampilan table"
        >
          <div className="table-wrap" onScroll={loadMoreSites}>
            <SortableTable
              rowLimit={visibleLimit}
              onSortChange={() => setVisibleLimit(30)}
            >
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Jenjang</th>
                  <th>Naungan</th>
                  <th>Kepemilikan</th>
                  <th>Identitas</th>
                  <th>Izin operasional</th>
                  <th>Akreditasi</th>
                  <th>Kepala sekolah</th>
                  <th>Telepon</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <strong>{site.school_name || site.name}</strong>
                      <span className="school-table-address">
                        {site.address || "Alamat belum dilengkapi"}
                      </span>
                    </td>
                    <td>{schoolLevelLabel(site)}</td>
                    <td>
                      {site.education_authority === "KEMENAG"
                        ? "Kemenag"
                        : "Kemendikbud"}
                    </td>
                    <td>
                      {site.ownership_status === "PUBLIC" ? "Negeri" : "Swasta"}
                    </td>
                    <td>
                      <span>NPSN: {site.npsn || "—"}</span>
                      <span>
                        {site.education_authority === "KEMENAG" ? "NSM" : "NSS"}
                        :{" "}
                        {site.education_authority === "KEMENAG"
                          ? site.nsm || "—"
                          : site.nss || "—"}
                      </span>
                    </td>
                    <td>
                      <span>{site.operational_license_number || "—"}</span>
                      <span className="muted">
                        s.d. {site.operational_license_end || "tidak dibatasi"}
                      </span>
                    </td>
                    <td>
                      <span>{site.accreditation || "—"}</span>
                      <span className="muted">
                        {site.accreditation_number || "Tanpa nomor"}
                      </span>
                    </td>
                    <td>{site.principal_name || "—"}</td>
                    <td>{site.phone || "—"}</td>
                    <td>
                      {site.current ? (
                        <span className="site-status">Aktif</span>
                      ) : (
                        "Tersedia"
                      )}
                    </td>
                    <td>
                      <div className="school-table-actions">
                        {editable && (
                          <button onClick={() => void openEdit(site)}>
                            Edit
                          </button>
                        )}
                        {!site.current && (
                          <button
                            disabled={busy}
                            onClick={() => void switchSite(site.id)}
                          >
                            Buka
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
            {visibleSites.length < filteredSites.length && (
              <div className="table-lazy-status" role="status">
                Scroll untuk memuat sekolah berikutnya…
              </div>
            )}
          </div>
        </section>
      )}
      {mode && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup editor sekolah"
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="school-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {mode === "new" ? "SEKOLAH BARU" : "EDIT SEKOLAH"}
                </span>
                <h2 id="school-drawer-title">
                  {mode === "new"
                    ? "Tambah sekolah"
                    : form.name || "Data sekolah"}
                </h2>
              </div>
              <button aria-label="Tutup" onClick={closeDrawer}>
                ×
              </button>
            </div>
            {busy && !profile && mode === "edit" ? (
              <p className="muted">Memuat data sekolah…</p>
            ) : (
              <SchoolEditor
                mode={mode}
                form={form}
                setForm={setForm}
                profile={profile}
                pendingPhotos={pendingPhotos}
                setPendingPhotos={setPendingPhotos}
                busy={busy}
                onSubmit={saveSchool}
                onDeletePhoto={deletePhoto}
              />
            )}
          </aside>
        </div>
      )}
    </>
  );
}
