import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { resources } from "../../../packages/validation/src";
import type { Actor } from "../../../packages/shared-types/src";
import { all, send, setToken, refreshSession } from "./api";
import { Catalog, can, ErrorBox, Empty } from "./components";
import "./styles.css";
import { Login } from "./pages/login";
import { ResourcePage } from "./pages/resources";
import { AttendancePage } from "./pages/attendance";
import { ScoresPage } from "./pages/grades";
import { ReportsPage } from "./pages/reports";
import { SettingsPage } from "./pages/settings";
import { UsersPage } from "./pages/users";
import { ThemeToggle } from "./theme";
import {
  BillingPage,
  WalletPage,
  PosPage,
  financeAccess,
  financeAdmin,
} from "./pages/finance";
import {
  EventsPage,
  NotificationsPage,
  PortalPage,
} from "./pages/communications";
import { AdmissionsPage, FilesPage } from "./pages/admissions-files";
import { PublicAdmissions } from "./pages/ppdb-public";
import { WebsiteBuilderPage } from "./pages/website-builder";
import {
  BoardingPage,
  DomainsPage,
  LibraryPage,
  SecurityPage,
} from "./pages/operations";
const homeRoute = (user: Actor) =>
  can(user, "student.read")
    ? "students"
    : financeAdmin(user)
      ? "billing"
      : user.roles.some((role) =>
            ["PARENT", "STUDENT", "TEACHER"].includes(role),
          )
        ? "portal"
        : "events";
function Workspace({ user, onLogout }: { user: Actor; onLogout: () => void }) {
  const [route, setRoute] = useState(location.hash.slice(1) || homeRoute(user));
  const [catalog, setCatalog] = useState<Catalog>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  async function refresh() {
    const keys = Object.keys(resources).filter((key) =>
      can(user, `${resources[key].permission}.read`),
    );
    if (can(user, "people.read")) keys.push("users");
    const values = await Promise.all(keys.map((key) => all(key)));
    setCatalog(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const change = () => {
      setRoute(location.hash.slice(1));
      setMobileOpen(false);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [user.id]);
  const extra = [
    {
      key: "attendance",
      title: "Absensi",
      group: "Kehadiran",
      permission: "attendance.read",
    },
    {
      key: "grades",
      title: "Input Nilai",
      group: "Penilaian",
      permission: "grade.read",
    },
    {
      key: "report-cards",
      title: "Raport Siswa",
      group: "Penilaian",
      permission: can(user, "report.read") ? "report.read" : "report.own",
    },
    {
      key: "users",
      title: "Akun Pengguna",
      group: "Administrasi",
      permission: "user.write",
    },
    {
      key: "settings",
      title: "Kebijakan Raport",
      group: "Administrasi",
      permission: "school.write",
    },
  ];
  const links = [
    ...Object.entries(resources).map(([key, r]) => ({
      key,
      title: r.title,
      group: r.group,
      permission: `${r.permission}.read`,
    })),
    ...extra,
  ].filter((r) => can(user, r.permission));
  links.push(
    {
      key: "portal",
      title: "Ringkasan Siswa",
      group: "Kehadiran",
      permission: "",
    },
    ...(financeAccess(user)
      ? [
          {
            key: "billing",
            title: "Tagihan Sekolah",
            group: "Keuangan",
            permission: "",
          },
          {
            key: "wallet",
            title: "Dompet Siswa",
            group: "Keuangan",
            permission: "",
          },
        ]
      : []),
    ...(financeAdmin(user)
      ? [
          {
            key: "pos",
            title: "Kasir Kantin",
            group: "Keuangan",
            permission: "",
          },
        ]
      : []),
    {
      key: "events",
      title: "Agenda Sekolah",
      group: "Komunikasi",
      permission: "",
    },
    {
      key: "notifications",
      title: "Notifikasi",
      group: "Komunikasi",
      permission: "",
    },
  );
  if (can(user, "admission.read"))
    links.push({
      key: "admissions",
      title: "PPDB",
      group: "Administrasi",
      permission: "",
    });
  if (can(user, "file.read"))
    links.push({
      key: "files",
      title: "Manajemen Berkas",
      group: "Administrasi",
      permission: "",
    });
  if (can(user, "website.read"))
    links.push({
      key: "website",
      title: "Website Sekolah",
      group: "Publikasi",
      permission: "",
    });
  if (can(user, "domain.read"))
    links.push({
      key: "domains",
      title: "Custom Domain",
      group: "Publikasi",
      permission: "",
    });
  if (can(user, "boarding.read"))
    links.push({
      key: "boarding",
      title: "Boarding School",
      group: "Operasional",
      permission: "",
    });
  if (can(user, "library.read"))
    links.push({
      key: "library",
      title: "Perpustakaan",
      group: "Operasional",
      permission: "",
    });
  if (can(user, "audit.read"))
    links.push({
      key: "security",
      title: "Audit & Keamanan",
      group: "Administrasi",
      permission: "",
    });
  const groups = [...new Set(links.map((l) => l.group))];
  const allowed = links.some((l) => l.key === route);
  const title = links.find((l) => l.key === route)?.title || "SchoolApp";
  return (
    <div className="workspace">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <a className="brand" href={`#${homeRoute(user)}`}>
          <span className="brandmark">S</span>SchoolApp
        </a>
        <div className="school-pill">
          <span className="school-avatar">▥</span>
          <div>
            <strong>
              {String(catalog.schools?.[0]?.name || "Sekolah Anda")}
            </strong>
            <span>Ruang kerja sekolah</span>
          </div>
        </div>
        <nav aria-label="Navigasi utama">
          {groups.map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-heading">{group}</span>
              {links
                .filter((l) => l.group === group)
                .map((l) => (
                  <a
                    className={route === l.key ? "active" : ""}
                    key={l.key}
                    href={`#${l.key}`}
                    aria-current={route === l.key ? "page" : undefined}
                  >
                    {l.title}
                    {route === l.key && <span>›</span>}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="badge">V1.0 · School Platform</span>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="menu-toggle"
              aria-label="Buka menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              ☰
            </button>
            <span className="muted">Sekolah</span>
            <span className="separator">/</span>
            <strong>{title}</strong>
          </div>
          <div className="user-menu">
            <ThemeToggle />
            <div>
              <strong>{user.name}</strong>
              <span className="small muted">{user.roles.join(" · ")}</span>
            </div>
            <button
              onClick={async () => {
                try {
                  await send("auth/logout", {});
                  setToken("");
                  onLogout();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Keluar
            </button>
          </div>
        </header>
        <main className="content">
          <ErrorBox error={error} />
          {error && (
            <button
              onClick={() => {
                setError("");
                setLoading(true);
                refresh()
                  .catch((e) => setError(e.message))
                  .finally(() => setLoading(false));
              }}
            >
              Coba muat ulang
            </button>
          )}
          {loading ? (
            <Empty text="Menyiapkan data sekolah…" />
          ) : !allowed ? (
            <Empty text="Halaman tidak tersedia untuk peran Anda. Pilih menu di samping." />
          ) : resources[route] ? (
            <ResourcePage
              key={route}
              resource={route}
              user={user}
              catalog={catalog}
              refresh={refresh}
            />
          ) : route === "attendance" ? (
            <AttendancePage catalog={catalog} user={user} />
          ) : route === "grades" ? (
            <ScoresPage catalog={catalog} user={user} />
          ) : route === "report-cards" ? (
            <ReportsPage catalog={catalog} user={user} />
          ) : route === "users" ? (
            <UsersPage catalog={catalog} refresh={refresh} />
          ) : route === "billing" ? (
            <BillingPage user={user} />
          ) : route === "wallet" ? (
            <WalletPage user={user} />
          ) : route === "pos" ? (
            <PosPage />
          ) : route === "events" ? (
            <EventsPage user={user} catalog={catalog} />
          ) : route === "notifications" ? (
            <NotificationsPage user={user} />
          ) : route === "portal" ? (
            <PortalPage />
          ) : route === "admissions" ? (
            <AdmissionsPage user={user} catalog={catalog} />
          ) : route === "files" ? (
            <FilesPage user={user} catalog={catalog} />
          ) : route === "website" ? (
            <WebsiteBuilderPage user={user} catalog={catalog} />
          ) : route === "domains" ? (
            <DomainsPage user={user} />
          ) : route === "boarding" ? (
            <BoardingPage user={user} catalog={catalog} />
          ) : route === "library" ? (
            <LibraryPage user={user} catalog={catalog} />
          ) : route === "security" ? (
            <SecurityPage user={user} />
          ) : (
            <SettingsPage user={user} />
          )}
        </main>
        <footer className="app-footer">
          SchoolApp{" "}
          <span>Akademik, keuangan, dan komunikasi dalam satu ruang.</span>
        </footer>
      </div>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicRoute, setPublicRoute] = useState(location.hash.slice(1));
  useEffect(() => {
    refreshSession()
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    const expire = () => {
      setUser(null);
      setToken("");
    };
    window.addEventListener("session-expired", expire);
    const change = () => setPublicRoute(location.hash.slice(1));
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("session-expired", expire);
      window.removeEventListener("hashchange", change);
    };
  }, []);
  if (loading)
    return (
      <main className="boot" role="status">
        Memuat SchoolApp…
      </main>
    );
  return !user && publicRoute === "ppdb" ? (
    <PublicAdmissions />
  ) : user ? (
    <Workspace
      user={user}
      onLogout={() => {
        setUser(null);
        location.hash = "";
      }}
    />
  ) : (
    <Login
      onLogin={(u) => {
        setUser(u);
        location.hash = homeRoute(u);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
