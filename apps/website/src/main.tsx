import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  WebsiteRenderer,
  type WebsiteContent,
  type WebsiteSite,
} from "../../../packages/website-renderer/src";
import "./styles.css";

type Page = WebsiteSite & {
  title: string;
  slug: string;
  tenant_slug?: string;
  content: WebsiteContent;
};
const route = () => {
  const customDomain = !["localhost", "127.0.0.1"].includes(location.hostname);
  if (customDomain)
    return {
      tenant: "",
      slug: location.pathname.split("/").filter(Boolean)[0] || "home",
      domain: location.hostname.toLowerCase(),
    };
  const [tenant = "demo", slug = "home"] = location.pathname
    .split("/")
    .filter(Boolean);
  return { tenant: tenant.toLowerCase(), slug: slug.toLowerCase(), domain: "" };
};

function App() {
  const [current, setCurrent] = useState(route);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const pop = () => setCurrent(route());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    setLoading(true);
    setError("");
    const endpoint = current.domain
      ? `/api/v1/public/websites/domains/${encodeURIComponent(current.domain)}/pages/${encodeURIComponent(current.slug)}`
      : `/api/v1/public/websites/${encodeURIComponent(current.tenant)}/pages/${encodeURIComponent(current.slug)}`;
    fetch(endpoint)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "Halaman belum diterbitkan atau tidak ditemukan."
              : "Website belum dapat dimuat.",
          );
        return response.json();
      })
      .then((data: Page) => {
        setPage(data);
        document.title =
          data.content.seo.title || `${data.title} · ${data.site_name}`;
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute(
            "content",
            data.content.seo.description ||
              data.tagline ||
              "Website resmi sekolah",
          );
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", data.primary_color || "#004aad");
      })
      .catch((reason: Error) => {
        setPage(null);
        setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, [current.tenant, current.slug, current.domain]);
  if (loading)
    return (
      <main className="site-state">
        <span className="site-mark">S</span>
        <p>Memuat website sekolah…</p>
      </main>
    );
  if (error || !page)
    return (
      <main className="site-state">
        <span className="site-mark">S</span>
        <h1>Halaman tidak tersedia</h1>
        <p>{error}</p>
        <a href={current.domain ? "/home" : `/${current.tenant}/home`}>
          Kembali ke beranda
        </a>
      </main>
    );
  const pageUrl = (slug: string) =>
    current.domain ? `/${slug}` : `/${current.tenant}/${slug}`;
  const assetTenant = current.tenant || page.tenant_slug || "";
  return (
    <WebsiteRenderer
      content={page.content}
      site={page}
      pageUrl={pageUrl}
      assetUrl={(id) =>
        `/api/v1/public/websites/${encodeURIComponent(assetTenant)}/assets/${encodeURIComponent(id)}`
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
