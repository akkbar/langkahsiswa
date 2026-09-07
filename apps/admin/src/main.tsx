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
function Workspace({ user, onLogout }: { user: Actor; onLogout: () => void }) {
  const [route, setRoute] = useState(
    location.hash.slice(1) ||
      (can(user, "student.read") ? "students" : "report-cards"),
  );
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
  const groups = [...new Set(links.map((l) => l.group))];
  const allowed = links.some((l) => l.key === route);
  const title = links.find((l) => l.key === route)?.title || "SchoolApp";
  return (
    <div className="workspace">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#students">
          <span className="brandmark">S</span>SchoolApp
        </a>
        <div className="school-pill">
          <span className="school-avatar">▥</span>
          <div>
            <strong>
              {String(catalog.schools?.[0]?.name || "Sekolah Anda")}
            </strong>
            <span>Ruang kerja akademik</span>
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
          <span className="badge green">V0.2 · Academic</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="menu-toggle"
              aria-label="Buka menu"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              ☰
            </button>
            <span className="muted">Sekolah</span>
            <span className="separator">/</span>
            <strong>{title}</strong>
          </div>
          <div className="user-menu">
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
          ) : (
            <SettingsPage user={user} />
          )}
        </main>
        <footer className="app-footer">
          SchoolApp <span>Administrasi akademik, dalam satu ruang.</span>
        </footer>
      </div>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
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
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  if (loading)
    return (
      <main className="boot" role="status">
        Memuat SchoolApp…
      </main>
    );
  return user ? (
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
        location.hash = can(u, "student.read") ? "students" : "report-cards";
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
