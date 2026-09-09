import React, { useEffect, useState } from "react";
import "./styles.css";

export type WebsiteBlockType =
  | "hero"
  | "text"
  | "image"
  | "gallery"
  | "news"
  | "announcement"
  | "event"
  | "teacher"
  | "contact"
  | "map"
  | "footer";

export type WebsiteBlock = {
  id: string;
  type: WebsiteBlockType;
  props: Record<string, any>;
};
export type WebsiteContent = {
  seo: { title: string; description: string };
  blocks: WebsiteBlock[];
};
export type WebsiteSite = {
  site_name: string;
  tagline?: string;
  primary_color?: string;
  address?: string;
  phone?: string;
  navigation?: { title: string; slug: string }[];
};

type RendererProps = {
  content: WebsiteContent;
  site: WebsiteSite;
  assetUrl: (id: string) => string;
  pageUrl?: (slug: string) => string;
  preview?: boolean;
};

const heading = (value: unknown, fallback: string) => String(value || fallback);
const SiteImage = ({ id, alt, assetUrl }: any) =>
  id ? <img src={assetUrl(id)} alt={alt || ""} loading="lazy" /> : null;

const registry: Record<
  WebsiteBlockType,
  React.ComponentType<{
    block: WebsiteBlock;
    assetUrl: (id: string) => string;
    linkUrl: (url: string) => string;
  }>
> = {
  hero: ({ block, assetUrl, linkUrl }) => (
    <section className="sw-block sw-hero">
      <div className="sw-hero-copy">
        {block.props.eyebrow && (
          <span className="sw-eyebrow">{block.props.eyebrow}</span>
        )}
        <h1>{block.props.title}</h1>
        {block.props.subtitle && <p>{block.props.subtitle}</p>}
        {block.props.cta_label && block.props.cta_url && (
          <a className="sw-button" href={linkUrl(block.props.cta_url)}>
            {block.props.cta_label}
          </a>
        )}
      </div>
      {block.props.asset_id && (
        <div className="sw-hero-media">
          <SiteImage
            id={block.props.asset_id}
            alt={block.props.title}
            assetUrl={assetUrl}
          />
        </div>
      )}
    </section>
  ),
  text: ({ block }) => (
    <section
      className={`sw-block sw-text sw-align-${block.props.alignment || "left"}`}
    >
      {block.props.heading && <h2>{block.props.heading}</h2>}
      <p>{block.props.body}</p>
    </section>
  ),
  image: ({ block, assetUrl }) => (
    <figure className="sw-block sw-image">
      <SiteImage
        id={block.props.asset_id}
        alt={block.props.caption}
        assetUrl={assetUrl}
      />
      {block.props.caption && <figcaption>{block.props.caption}</figcaption>}
    </figure>
  ),
  gallery: ({ block, assetUrl }) => (
    <section className="sw-block">
      <h2>{heading(block.props.heading, "Galeri")}</h2>
      <div className="sw-gallery">
        {(block.props.asset_ids || []).map((id: string) => (
          <SiteImage
            key={id}
            id={id}
            alt={block.props.heading}
            assetUrl={assetUrl}
          />
        ))}
      </div>
    </section>
  ),
  news: ({ block, linkUrl }) => (
    <section className="sw-block">
      <h2>{heading(block.props.heading, "Berita")}</h2>
      <div className="sw-card-grid">
        {(block.props.items || []).map((item: any, index: number) => (
          <article className="sw-card" key={`${item.title}-${index}`}>
            {item.date && <time>{item.date}</time>}
            <h3>{item.title}</h3>
            <p>{item.excerpt}</p>
            {item.url && (
              <a className="sw-link" href={linkUrl(item.url)}>
                Baca selengkapnya
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  ),
  announcement: ({ block }) => (
    <section className="sw-block sw-soft">
      <h2>{heading(block.props.heading, "Pengumuman")}</h2>
      <div className="sw-list">
        {(block.props.items || []).map((item: any, index: number) => (
          <article key={`${item.title}-${index}`}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  ),
  event: ({ block }) => (
    <section className="sw-block">
      <h2>{heading(block.props.heading, "Agenda")}</h2>
      <div className="sw-list">
        {(block.props.items || []).map((item: any, index: number) => (
          <article className="sw-event" key={`${item.title}-${index}`}>
            <time>{item.date}</time>
            <div>
              <h3>{item.title}</h3>
              {item.location && <p>{item.location}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  ),
  teacher: ({ block, assetUrl }) => (
    <section className="sw-block">
      <h2>{heading(block.props.heading, "Guru dan staf")}</h2>
      <div className="sw-people">
        {(block.props.items || []).map((item: any, index: number) => (
          <article key={`${item.name}-${index}`}>
            {item.asset_id ? (
              <SiteImage
                id={item.asset_id}
                alt={item.name}
                assetUrl={assetUrl}
              />
            ) : (
              <span className="sw-avatar">{item.name.slice(0, 1)}</span>
            )}
            <h3>{item.name}</h3>
            <p>{item.role}</p>
          </article>
        ))}
      </div>
    </section>
  ),
  contact: ({ block }) => (
    <section className="sw-block sw-contact">
      <h2>{heading(block.props.heading, "Hubungi kami")}</h2>
      <div>
        {block.props.address && <p>{block.props.address}</p>}
        {block.props.phone && (
          <a href={`tel:${block.props.phone}`}>{block.props.phone}</a>
        )}
        {block.props.email && (
          <a href={`mailto:${block.props.email}`}>{block.props.email}</a>
        )}
      </div>
    </section>
  ),
  map: ({ block }) => (
    <section className="sw-block">
      <h2>{heading(block.props.heading, "Lokasi")}</h2>
      <iframe
        className="sw-map"
        src={block.props.embed_url}
        title={heading(block.props.heading, "Peta sekolah")}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  ),
  footer: ({ block, linkUrl }) => (
    <footer className="sw-footer">
      <p>{block.props.text}</p>
      <nav>
        {(block.props.links || []).map((item: any, index: number) => (
          <a key={`${item.label}-${index}`} href={linkUrl(item.url)}>
            {item.label}
          </a>
        ))}
      </nav>
    </footer>
  ),
};

export function WebsiteRenderer({
  content,
  site,
  assetUrl,
  pageUrl = (slug) => `/${slug}`,
  preview = false,
}: RendererProps) {
  const [dark, setDark] = useState(() =>
    preview || typeof window === "undefined"
      ? false
      : localStorage.getItem("langkahsiswa-site-theme") === "dark" ||
        (!localStorage.getItem("langkahsiswa-site-theme") &&
          matchMedia("(prefers-color-scheme: dark)").matches),
  );
  useEffect(() => {
    if (!preview)
      localStorage.setItem("langkahsiswa-site-theme", dark ? "dark" : "light");
  }, [dark, preview]);
  const linkUrl = (url: string) =>
    url.startsWith("/") && url.length > 1 ? pageUrl(url.slice(1)) : url;
  return (
    <div
      className={`sw-site${preview ? " sw-preview" : ""}${dark ? " sw-dark" : ""}`}
      style={
        { "--sw-blue": site.primary_color || "#004aad" } as React.CSSProperties
      }
    >
      <header className="sw-header">
        <a className="sw-brand" href={pageUrl("home")}>
          <span>S</span>
          <div>
            <strong>{site.site_name}</strong>
            {site.tagline && <small>{site.tagline}</small>}
          </div>
        </a>
        <nav>
          {(site.navigation || []).map((item) => (
            <a key={item.slug} href={pageUrl(item.slug)}>
              {item.title}
            </a>
          ))}
        </nav>
        {!preview && (
          <button
            className="sw-theme"
            type="button"
            aria-label={dark ? "Gunakan tema terang" : "Gunakan tema gelap"}
            onClick={() => setDark(!dark)}
          >
            {dark ? "☀ Terang" : "☾ Gelap"}
          </button>
        )}
      </header>
      <main>
        {content.blocks.length ? (
          content.blocks.map((block) => {
            const Block = registry[block.type];
            return (
              <Block
                key={block.id}
                block={block}
                assetUrl={assetUrl}
                linkUrl={linkUrl}
              />
            );
          })
        ) : (
          <section className="sw-block sw-empty">
            Tambahkan blok untuk mulai menyusun halaman.
          </section>
        )}
      </main>
    </div>
  );
}
