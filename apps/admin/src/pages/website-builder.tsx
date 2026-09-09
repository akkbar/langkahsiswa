import React, { useEffect, useMemo, useState } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import {
  WebsiteRenderer,
  type WebsiteBlock,
  type WebsiteBlockType,
  type WebsiteContent,
} from "../../../../packages/website-renderer/src";
import { api, authenticatedBlobUrl, send } from "../api";
import { can, type Catalog, Empty, ErrorBox } from "../components";
import { PageHeading, dateText } from "./finance";

type Row = Record<string, any>;
const blockLabels: Record<WebsiteBlockType, string> = {
  hero: "Hero",
  text: "Teks",
  image: "Gambar",
  gallery: "Galeri",
  news: "Berita",
  announcement: "Pengumuman",
  event: "Agenda",
  teacher: "Guru dan staf",
  contact: "Kontak",
  map: "Peta",
  footer: "Footer",
};
const blockTypes = Object.keys(blockLabels) as WebsiteBlockType[];
const emptyContent = (): WebsiteContent => ({
  seo: { title: "", description: "" },
  blocks: [],
});
const normalizedContent = (content: WebsiteContent) => {
  const result = structuredClone(content);
  for (const block of result.blocks)
    if (block.type === "news")
      for (const item of block.props.items || [])
        if (!item.date) delete item.date;
  return result;
};
const newBlock = (type: WebsiteBlockType): WebsiteBlock => {
  const props: Record<WebsiteBlockType, Record<string, any>> = {
    hero: {
      eyebrow: "SELAMAT DATANG",
      title: "Sekolah untuk masa depan",
      subtitle: "Tuliskan pesan utama sekolah.",
      cta_label: "Pelajari lebih lanjut",
      cta_url: "/profil",
      asset_id: null,
    },
    text: {
      heading: "Tentang sekolah",
      body: "Tuliskan informasi sekolah di sini.",
      alignment: "left",
    },
    image: { asset_id: "", caption: "" },
    gallery: { heading: "Galeri", asset_ids: [] },
    news: {
      heading: "Berita terbaru",
      items: [{ title: "Judul berita", excerpt: "Ringkasan berita", url: "" }],
    },
    announcement: {
      heading: "Pengumuman",
      items: [{ title: "Judul pengumuman", body: "Isi pengumuman" }],
    },
    event: {
      heading: "Agenda",
      items: [
        {
          title: "Kegiatan sekolah",
          date: new Date().toISOString().slice(0, 10),
          location: "",
        },
      ],
    },
    teacher: {
      heading: "Guru dan staf",
      items: [{ name: "Nama guru", role: "Guru", asset_id: null }],
    },
    contact: { heading: "Hubungi kami", address: "", phone: "", email: "" },
    map: {
      heading: "Lokasi sekolah",
      embed_url: "https://www.google.com/maps/embed?pb=",
    },
    footer: { text: "Hak cipta sekolah", links: [] },
  };
  return { id: crypto.randomUUID(), type, props: props[type] };
};

function AssetSelect({
  value,
  assets,
  onChange,
  optional = false,
}: {
  value: string | null;
  assets: Row[];
  onChange: (value: string | null) => void;
  optional?: boolean;
}) {
  return (
    <label>
      Gambar{!optional && " *"}
      <select
        required={!optional}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{optional ? "Tanpa gambar" : "Pilih gambar"}</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
  area = false,
  type = "text",
  required = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  area?: boolean;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      {area ? (
        <textarea
          required={required}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          required={required}
          type={type}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
type ItemField = {
  key: string;
  label: string;
  type?: string;
  area?: boolean;
  asset?: boolean;
};
function ItemsEditor({
  items,
  fields,
  assets,
  onChange,
}: {
  items: Row[];
  fields: ItemField[];
  assets: Row[];
  onChange: (items: Row[]) => void;
}) {
  const update = (index: number, key: string, value: any) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  return (
    <div className="builder-items">
      {items.map((item, index) => (
        <div className="builder-item" key={index}>
          {fields.map((field) =>
            field.asset ? (
              <AssetSelect
                key={field.key}
                optional
                value={item[field.key]}
                assets={assets}
                onChange={(value) => update(index, field.key, value)}
              />
            ) : (
              <TextField
                key={field.key}
                label={field.label}
                type={field.type}
                area={field.area}
                value={item[field.key]}
                onChange={(value) => update(index, field.key, value)}
              />
            ),
          )}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Hapus item
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            Object.fromEntries(
              fields.map((field) => [field.key, field.asset ? null : ""]),
            ),
          ])
        }
      >
        + Tambah item
      </button>
    </div>
  );
}
function BlockFields({
  block,
  assets,
  update,
}: {
  block: WebsiteBlock;
  assets: Row[];
  update: (props: Row) => void;
}) {
  const p = block.props;
  const field = (
    key: string,
    label: string,
    options: { area?: boolean; type?: string; required?: boolean } = {},
  ) => (
    <TextField
      label={label}
      value={p[key]}
      onChange={(value) => update({ ...p, [key]: value })}
      {...options}
    />
  );
  const items = (fields: ItemField[]) => (
    <ItemsEditor
      items={p.items || []}
      fields={fields}
      assets={assets}
      onChange={(value) => update({ ...p, items: value })}
    />
  );
  if (block.type === "hero")
    return (
      <>
        {field("eyebrow", "Label kecil")}
        {field("title", "Judul", { required: true })}
        {field("subtitle", "Subjudul", { area: true })}
        <div className="form-grid">
          {field("cta_label", "Teks tombol")}
          {field("cta_url", "Tautan tombol")}
        </div>
        <AssetSelect
          optional
          value={p.asset_id}
          assets={assets}
          onChange={(value) => update({ ...p, asset_id: value })}
        />
      </>
    );
  if (block.type === "text")
    return (
      <>
        {field("heading", "Judul")}
        {field("body", "Isi", { area: true, required: true })}
        <label>
          Perataan
          <select
            value={p.alignment}
            onChange={(e) => update({ ...p, alignment: e.target.value })}
          >
            <option value="left">Kiri</option>
            <option value="center">Tengah</option>
          </select>
        </label>
      </>
    );
  if (block.type === "image")
    return (
      <>
        <AssetSelect
          value={p.asset_id}
          assets={assets}
          onChange={(value) => update({ ...p, asset_id: value || "" })}
        />
        {field("caption", "Keterangan")}
      </>
    );
  if (block.type === "gallery")
    return (
      <>
        {field("heading", "Judul")}
        <label>
          Pilih gambar
          <div className="asset-checks">
            {assets.map((asset) => (
              <label className="check" key={asset.id}>
                <input
                  type="checkbox"
                  checked={(p.asset_ids || []).includes(asset.id)}
                  onChange={(e) =>
                    update({
                      ...p,
                      asset_ids: e.target.checked
                        ? [...(p.asset_ids || []), asset.id]
                        : (p.asset_ids || []).filter(
                            (id: string) => id !== asset.id,
                          ),
                    })
                  }
                />
                {asset.name}
              </label>
            ))}
          </div>
        </label>
      </>
    );
  if (block.type === "news")
    return (
      <>
        {field("heading", "Judul")}
        {items([
          { key: "title", label: "Judul berita" },
          { key: "excerpt", label: "Ringkasan", area: true },
          { key: "date", label: "Tanggal", type: "date" },
          { key: "url", label: "Tautan" },
        ])}
      </>
    );
  if (block.type === "announcement")
    return (
      <>
        {field("heading", "Judul")}
        {items([
          { key: "title", label: "Judul pengumuman" },
          { key: "body", label: "Isi", area: true },
        ])}
      </>
    );
  if (block.type === "event")
    return (
      <>
        {field("heading", "Judul")}
        {items([
          { key: "title", label: "Nama kegiatan" },
          { key: "date", label: "Tanggal/waktu" },
          { key: "location", label: "Lokasi" },
        ])}
      </>
    );
  if (block.type === "teacher")
    return (
      <>
        {field("heading", "Judul")}
        {items([
          { key: "name", label: "Nama" },
          { key: "role", label: "Jabatan" },
          { key: "asset_id", label: "Foto", asset: true },
        ])}
      </>
    );
  if (block.type === "contact")
    return (
      <>
        {field("heading", "Judul")}
        {field("address", "Alamat", { area: true })}
        <div className="form-grid">
          {field("phone", "Telepon")}
          {field("email", "Email", { type: "email" })}
        </div>
      </>
    );
  if (block.type === "map")
    return (
      <>
        {field("heading", "Judul")}
        {field("embed_url", "URL embed Google Maps", { required: true })}
        <p className="helper">
          Gunakan URL dari menu Bagikan → Sematkan peta di Google Maps.
        </p>
      </>
    );
  return (
    <>
      {field("text", "Teks footer", { area: true })}
      {items([
        { key: "label", label: "Label tautan" },
        { key: "url", label: "Tautan" },
      ])}
    </>
  );
}

export function WebsiteBuilderPage({
  user,
  catalog,
}: {
  user: Actor;
  catalog: Catalog;
}) {
  const editable = can(user, "website.write");
  const [settings, setSettings] = useState<Row | null>(null);
  const [pages, setPages] = useState<Row[]>([]);
  const [assets, setAssets] = useState<Row[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState<Row | null>(null);
  const [content, setContent] = useState<WebsiteContent>(emptyContent);
  const [versionId, setVersionId] = useState("");
  const [newType, setNewType] = useState<WebsiteBlockType>("hero");
  const [newPage, setNewPage] = useState({ title: "", slug: "" });
  const [upload, setUpload] = useState({
    name: "",
    alt_text: "",
    file: null as File | null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(action: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      if (message) setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const [site, pageResult, assetResult] = await Promise.all([
      api("website/settings"),
      api("website/pages"),
      api("website/assets"),
    ]);
    setSettings(site);
    setPages(pageResult.data);
    setAssets(assetResult.data);
    const urls = await Promise.all(
      assetResult.data.map(
        async (asset: Row) =>
          [
            asset.id,
            await authenticatedBlobUrl(`website/assets/${asset.id}/file`),
          ] as const,
      ),
    );
    setAssetUrls((old) => {
      Object.values(old).forEach(URL.revokeObjectURL);
      return Object.fromEntries(urls);
    });
  }
  async function openPage(id: string, selectVersion?: string) {
    const detail = await api(`website/pages/${id}`);
    const version =
      detail.versions.find((item: Row) => item.id === selectVersion) ||
      detail.versions[0];
    setPage(detail);
    setVersionId(version.id);
    setContent(structuredClone(version.content));
  }
  useEffect(() => {
    void run(load);
    return () => Object.values(assetUrls).forEach(URL.revokeObjectURL);
  }, []);
  const schoolId =
    settings?.school_id || String(catalog.schools?.[0]?.id || "");
  const currentVersion = page?.versions?.find(
    (item: Row) => item.id === versionId,
  );
  const publicUrl = settings?.tenant_slug
    ? `${location.protocol}//${location.hostname}:5174/${settings.tenant_slug}/${page?.slug || "home"}`
    : "";
  const previewSite = useMemo(
    () => ({
      site_name: settings?.site_name || "Website Sekolah",
      tagline: settings?.tagline || "",
      primary_color: settings?.primary_color || "#004aad",
      navigation: pages
        .filter((item) => item.status === "PUBLISHED")
        .map((item) => ({ title: item.title, slug: item.slug })),
    }),
    [settings, pages],
  );
  const replaceBlock = (index: number, next: WebsiteBlock) =>
    setContent({
      ...content,
      blocks: content.blocks.map((block, i) => (i === index ? next : block)),
    });
  return (
    <>
      <PageHeading
        eyebrow="WEBSITE SEKOLAH"
        title="Website Builder"
        description="Susun halaman dari blok aman, simpan riwayat versi, lalu terbitkan ke website publik."
      />
      <ErrorBox error={error} />
      {success && <div className="notice success">{success}</div>}
      <section className="card padded">
        <div className="detail-heading">
          <div>
            <h2>Identitas website</h2>
            <p className="muted small">
              Warna utama dianjurkan #004aad agar konsisten dengan LangkahSiswa.
            </p>
          </div>
          {publicUrl && (
            <a
              className="button-link"
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
            >
              Buka website
            </a>
          )}
        </div>
        {settings && (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await send(
                  "website/settings",
                  {
                    school_id: settings.school_id,
                    site_name: settings.site_name,
                    tagline: settings.tagline,
                    primary_color: settings.primary_color,
                  },
                  "PUT",
                );
                setSettings(result);
              }, "Identitas website disimpan.");
            }}
          >
            <label>
              Sekolah
              <select
                disabled={!editable}
                value={settings.school_id}
                onChange={(e) =>
                  setSettings({ ...settings, school_id: e.target.value })
                }
              >
                {(catalog.schools || []).map((school) => (
                  <option key={school.id} value={school.id}>
                    {String(school.name)}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Nama website"
              required
              value={settings.site_name}
              onChange={(value) =>
                setSettings({ ...settings, site_name: value })
              }
            />
            <TextField
              label="Tagline"
              value={settings.tagline}
              onChange={(value) => setSettings({ ...settings, tagline: value })}
            />
            <label>
              Warna utama
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) =>
                  setSettings({ ...settings, primary_color: e.target.value })
                }
              />
            </label>
            {editable && (
              <button className="primary" disabled={busy}>
                Simpan identitas
              </button>
            )}
          </form>
        )}
      </section>
      <div className="builder-layout">
        <aside className="builder-sidebar">
          <section className="card padded">
            <h2>Halaman</h2>
            {editable && (
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const created = await send("website/pages", {
                      school_id: schoolId,
                      title: newPage.title,
                      slug: newPage.slug,
                      content: {
                        seo: { title: newPage.title, description: "" },
                        blocks: [newBlock("hero"), newBlock("footer")],
                      },
                    });
                    setNewPage({ title: "", slug: "" });
                    await load();
                    await openPage(created.id);
                  }, "Halaman dibuat sebagai draft.");
                }}
              >
                <TextField
                  label="Judul halaman"
                  required
                  value={newPage.title}
                  onChange={(title) => setNewPage({ ...newPage, title })}
                />
                <TextField
                  label="Slug URL"
                  required
                  value={newPage.slug}
                  onChange={(slug) =>
                    setNewPage({
                      ...newPage,
                      slug: slug
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    })
                  }
                />
                <button disabled={busy || !schoolId}>+ Buat halaman</button>
              </form>
            )}
            <div className="stack-list builder-page-list">
              {pages.map((item) => (
                <button
                  className={`list-choice ${page?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => void run(() => openPage(item.id))}
                >
                  <strong>{item.title}</strong>
                  <span>
                    /{item.slug} · v{item.latest_version}
                  </span>
                  <span
                    className={`badge status-${String(item.status).toLowerCase()}`}
                  >
                    {item.status === "PUBLISHED" ? "Terbit" : "Draft"}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="card padded">
            <h2>Pustaka gambar</h2>
            {editable && (
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!upload.file) return;
                  void run(async () => {
                    const data = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve(String(reader.result).split(",")[1]);
                        reader.onerror = () =>
                          reject(new Error("Gambar gagal dibaca"));
                        reader.readAsDataURL(upload.file!);
                      },
                    );
                    await send("website/assets", {
                      name: upload.name,
                      alt_text: upload.alt_text,
                      file_name: upload.file!.name,
                      mime_type: upload.file!.type,
                      data_base64: data,
                    });
                    setUpload({ name: "", alt_text: "", file: null });
                    await load();
                  }, "Gambar ditambahkan.");
                }}
              >
                <TextField
                  label="Nama gambar"
                  required
                  value={upload.name}
                  onChange={(name) => setUpload({ ...upload, name })}
                />
                <TextField
                  label="Teks alternatif"
                  value={upload.alt_text}
                  onChange={(alt_text) => setUpload({ ...upload, alt_text })}
                />
                <label>
                  File PNG/JPEG
                  <input
                    required
                    accept="image/png,image/jpeg"
                    type="file"
                    onChange={(e) =>
                      setUpload({
                        ...upload,
                        file: e.target.files?.[0] || null,
                      })
                    }
                  />
                </label>
                <button disabled={busy || !upload.file}>Unggah gambar</button>
              </form>
            )}
            <div className="asset-grid">
              {assets.map((asset) => (
                <figure key={asset.id}>
                  {assetUrls[asset.id] && (
                    <img src={assetUrls[asset.id]} alt={asset.alt_text} />
                  )}
                  <figcaption>
                    {asset.name}
                    <small>{asset.published ? "Publik" : "Privat"}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        </aside>
        <div className="builder-main">
          {!page ? (
            <section className="card">
              <Empty text="Pilih atau buat halaman untuk mulai menyusun website." />
            </section>
          ) : (
            <>
              <section className="card padded">
                <div className="detail-heading">
                  <div>
                    <h2>{page.title}</h2>
                    <p className="muted small">
                      /{page.slug} ·{" "}
                      {page.status === "PUBLISHED"
                        ? "Sudah diterbitkan"
                        : "Draft"}
                    </p>
                  </div>
                  <div className="actions">
                    {editable && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const version = await send(
                                `website/pages/${page.id}/versions`,
                                normalizedContent(content),
                              );
                              setVersionId(version.id);
                              await openPage(page.id, version.id);
                              await load();
                            }, "Versi baru disimpan.")
                          }
                        >
                          Simpan versi
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !versionId}
                          onClick={() =>
                            void run(
                              async () => {
                                await send(`website/pages/${page.id}/publish`, {
                                  version_id: versionId,
                                });
                                await load();
                                await openPage(page.id, versionId);
                              },
                              `Versi ${currentVersion?.version_number || ""} diterbitkan.`,
                            )
                          }
                        >
                          Terbitkan versi ini
                        </button>
                        {page.status === "PUBLISHED" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await send(
                                  `website/pages/${page.id}/unpublish`,
                                  {},
                                );
                                await load();
                                await openPage(page.id);
                              }, "Halaman ditarik dari website publik.")
                            }
                          >
                            Tarik publikasi
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="form-grid builder-seo">
                  <TextField
                    label="Judul SEO (maks. 70)"
                    value={content.seo.title}
                    onChange={(title) =>
                      setContent({ ...content, seo: { ...content.seo, title } })
                    }
                  />
                  <TextField
                    label="Deskripsi SEO (maks. 170)"
                    value={content.seo.description}
                    onChange={(description) =>
                      setContent({
                        ...content,
                        seo: { ...content.seo, description },
                      })
                    }
                  />
                </div>
                <label>
                  Riwayat versi
                  <select
                    value={versionId}
                    onChange={(e) =>
                      void run(() => openPage(page.id, e.target.value))
                    }
                  >
                    {page.versions.map((version: Row) => (
                      <option key={version.id} value={version.id}>
                        Versi {version.version_number} ·{" "}
                        {dateText(version.created_at)}
                        {version.id === page.published_version_id
                          ? " · sedang terbit"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              {editable && (
                <section className="card padded">
                  <div className="builder-add">
                    <label>
                      Jenis blok
                      <select
                        value={newType}
                        onChange={(e) =>
                          setNewType(e.target.value as WebsiteBlockType)
                        }
                      >
                        {blockTypes.map((type) => (
                          <option key={type} value={type}>
                            {blockLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() =>
                        setContent({
                          ...content,
                          blocks: [...content.blocks, newBlock(newType)],
                        })
                      }
                    >
                      + Tambah blok
                    </button>
                  </div>
                </section>
              )}
              <div className="builder-blocks">
                {content.blocks.map((block, index) => (
                  <section className="card padded builder-block" key={block.id}>
                    <div className="detail-heading">
                      <div>
                        <span className="eyebrow">BLOK {index + 1}</span>
                        <h2>{blockLabels[block.type]}</h2>
                      </div>
                      {editable && (
                        <div className="actions">
                          <button
                            disabled={index === 0}
                            onClick={() => {
                              const blocks = [...content.blocks];
                              [blocks[index - 1], blocks[index]] = [
                                blocks[index],
                                blocks[index - 1],
                              ];
                              setContent({ ...content, blocks });
                            }}
                          >
                            ↑
                          </button>
                          <button
                            disabled={index === content.blocks.length - 1}
                            onClick={() => {
                              const blocks = [...content.blocks];
                              [blocks[index], blocks[index + 1]] = [
                                blocks[index + 1],
                                blocks[index],
                              ];
                              setContent({ ...content, blocks });
                            }}
                          >
                            ↓
                          </button>
                          <button
                            onClick={() =>
                              setContent({
                                ...content,
                                blocks: content.blocks.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                    <fieldset disabled={!editable}>
                      <BlockFields
                        block={block}
                        assets={assets}
                        update={(props) =>
                          replaceBlock(index, { ...block, props })
                        }
                      />
                    </fieldset>
                  </section>
                ))}
              </div>
              <section className="card padded">
                <div className="section-title">
                  <h2>Pratinjau langsung</h2>
                  <p className="muted small">
                    Pratinjau memakai renderer yang sama dengan website publik.
                  </p>
                </div>
                <WebsiteRenderer
                  preview
                  content={content}
                  site={previewSite}
                  assetUrl={(id) => assetUrls[id] || ""}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
