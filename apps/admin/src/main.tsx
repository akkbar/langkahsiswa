import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { resources } from "../../../packages/validation/src";
import type { Actor, SiteSummary } from "../../../packages/shared-types/src";
import { all, api, send, setToken, refreshSession } from "./api";
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
import { PortalPage } from "./pages/communications";
import { AdmissionsPage, FilesPage } from "./pages/admissions-files";
import { PublicAdmissions } from "./pages/ppdb-public";
import { WebsiteBuilderPage } from "./pages/website-builder";
import {
  BoardingPage,
  DomainsPage,
  LibraryPage,
  SecurityPage,
} from "./pages/operations";
import { DashboardPage, SitesPage } from "./pages/dashboard";
import { FamilyPage } from "./pages/family";
import { SchoolAccountsPage } from "./pages/school-accounts";
import { FoundationTeamPage } from "./pages/foundation-team";
import { FoundationProfilePage } from "./pages/foundation-profile";
import { CbtPage } from "./pages/cbt";
import { TimetablesPage } from "./pages/timetables";
import { SubjectsPage } from "./pages/subjects";
import { AcademicYearSetupPage } from "./pages/academic-year-setup";
const homeRoute = (user: Actor) => {
  const hasOperationalRole = user.roles.some(
    (role) => !["PARENT", "STUDENT", "CANTEEN_ADMIN"].includes(role),
  );
  if (hasOperationalRole) return "dashboard";
  if (user.roles.includes("PARENT")) return "family";
  if (user.roles.includes("STUDENT")) return "portal";
  return "dashboard";
};

const boardingNavigation = [
  { key: "boarding", section: "hunian", title: "Hunian" },
  {
    key: "boarding-perizinan",
    section: "perizinan",
    title: "Izin & Kunjungan",
  },
  {
    key: "boarding-pembinaan",
    section: "pembinaan",
    title: "Pembinaan & Tahfidz",
  },
  {
    key: "boarding-mutabaah",
    section: "mutabaah",
    title: "Mutabaah Ibadah",
  },
  {
    key: "boarding-kesehatan",
    section: "kesehatan",
    title: "Kesehatan",
  },
  { key: "boarding-diniyah", section: "diniyah", title: "Diniyah" },
  {
    key: "boarding-kegiatan",
    section: "kegiatan",
    title: "Kegiatan & Laundry",
  },
  {
    key: "boarding-modul",
    section: "modul",
    title: "Aktivasi Modul",
  },
] as const;

const groupedNavigation: Record<string, string[]> = {
  Guru: ["grades", "assessments", "attendance"],
  Administrasi: [
    "academic-year-setup",
    "academic-years",
    "semesters",
    "academic-calendar",
    "students",
    "class-subjects",
    "class-students",
    "timetables",
    "assessment-categories",
    "student-guardians",
    "report-cards",
    "settings",
    "admissions",
  ],
  Website: ["website", "domains"],
  PPDB: ["ppdb"],
  Pengaturan: ["security", "users", "school-team", "files"],
  Keuangan: ["billing", "wallet", "pos"],
  "Boarding School": boardingNavigation.map(({ key }) => key),
  Yayasan: [
    "foundation-profile",
    "sites",
    "foundation-team",
    "subjects",
    "grade-levels",
    "classrooms",
  ],
};
const operationalNavigationGroups = new Set([
  "Yayasan",
  "Guru",
  "Administrasi",
  "Pengaturan",
  "Keuangan",
  "Website",
]);
const unmarkedNavigationGroups = new Set([
  "Yayasan",
  "Guru",
  "Administrasi",
  "Pengaturan",
]);
const unmarkedNavigationKeys = new Set(["dashboard", "portal", "cbt"]);
const openAllNavigationKeys = new Set(["dashboard", "portal", "cbt", "ppdb"]);

function initiallyOpenGroups() {
  const route = location.hash.slice(1);
  return Object.fromEntries(
    Object.entries(groupedNavigation).map(([group, keys]) => [
      group,
      keys.includes(route),
    ]),
  );
}
function Workspace({
  user,
  onLogout,
  onUserChange,
}: {
  user: Actor;
  onLogout: () => void;
  onUserChange: (user: Actor) => void;
}) {
  const [route, setRoute] = useState(location.hash.slice(1) || homeRoute(user));
  const [catalog, setCatalog] = useState<Catalog>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] =
    useState<Record<string, boolean>>(initiallyOpenGroups);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDetailOpen, setAccountDetailOpen] = useState(false);
  const [schoolSwitcherOpen, setSchoolSwitcherOpen] = useState(false);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  async function logout() {
    try {
      await send("auth/logout", {});
      setToken("");
      onLogout();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function loadSites() {
    if (!can(user, "site.read")) return;
    const result = await api<{ data: SiteSummary[] }>("sites");
    setSites(result.data);
  }
  async function switchSite(id: string) {
    setSchoolSwitcherOpen(false);
    if (id === user.tenant_id) return;
    setLoading(true);
    setError("");
    try {
      const result = await send(`sites/${id}/switch`, {});
      setToken(result.access_token);
      onUserChange(result.user);
      location.hash = "dashboard";
    } catch (reason) {
      setError((reason as Error).message);
      setLoading(false);
    }
  }
  async function refresh() {
    const keys = Object.keys(resources).filter((key) =>
      can(user, `${resources[key].permission}.read`),
    );
    if (can(user, "people.read") || can(user, "user.read")) keys.push("users");
    const values = await Promise.all(keys.map((key) => all(key)));
    setCatalog(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
  }
  useEffect(() => {
    Promise.all([refresh(), loadSites()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const change = () => {
      const nextRoute = location.hash.slice(1);
      setRoute(nextRoute);
      const activeGroup = Object.entries(groupedNavigation).find(([, keys]) =>
        keys.includes(nextRoute),
      )?.[0];
      if (activeGroup)
        setOpenGroups((current) => ({ ...current, [activeGroup]: true }));
      setMobileOpen(false);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [user.id]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = () => setAccountMenuOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", escape);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    if (!schoolSwitcherOpen) return;
    const close = () => setSchoolSwitcherOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", escape);
    };
  }, [schoolSwitcherOpen]);
  const extra = [
    {
      key: "attendance",
      title: "Absensi",
      group: "Guru",
      permission: "attendance.read",
    },
    {
      key: "grades",
      title: "Input Nilai",
      group: "Guru",
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
      title: "Role Setting",
      group: "Pengaturan",
      permission: "user.read",
    },
    {
      key: "settings",
      title: "Kebijakan Raport",
      group: "Administrasi",
      permission: "school.read",
    },
  ];
  const links = [
    ...Object.entries(resources)
      .filter(
        ([key]) =>
          ![
            "schools",
            "teachers",
            "staff",
            "parents",
            "academic-years",
            "classes",
            "teacher-subjects",
            "teacher-competencies",
          ].includes(key),
      )
      .map(([key, r]) => ({
        key,
        title: r.title,
        group: r.group,
        permission: `${r.permission}.read`,
      })),
    ...extra,
  ].filter((r) => can(user, r.permission));
  if (can(user, "foundation.read"))
    links.push({
      key: "foundation-profile",
      title: "Profil Yayasan",
      group: "Yayasan",
      permission: "foundation.read",
    });
  if (can(user, "academic_setup.read"))
    links.push({
      key: "academic-year-setup",
      title: "Setup Tahun Ajaran",
      group: "Administrasi",
      permission: "academic_setup.read",
    });
  if (can(user, "user.read"))
    links.push({
      key: "school-team",
      title: "Semua Akun",
      group: "Pengaturan",
      permission: "user.read",
    });
  if (can(user, "people.read"))
    links.push({
      key: "foundation-team",
      title: "Guru dan Staff",
      group: "Yayasan",
      permission: "people.read",
    });
  links.push(
    ...(user.roles.includes("PARENT")
      ? [
          {
            key: "family",
            title: "Keluarga & PPDB",
            group: "Utama",
            permission: "family.read",
          },
        ]
      : []),
    {
      key: "portal",
      title: "Ringkasan Siswa",
      group: "Dashboard",
      permission: can(user, "student.read") ? "student.read" : "family.read",
    },
    ...(financeAccess(user)
      ? [
          {
            key: "billing",
            title: "Tagihan Sekolah",
            group: "Keuangan",
            permission: can(user, "finance.read")
              ? "finance.read"
              : "family.read",
          },
          {
            key: "wallet",
            title: "Dompet Siswa",
            group: "Keuangan",
            permission: can(user, "wallet.read")
              ? "wallet.read"
              : "family.read",
          },
        ]
      : []),
    ...(financeAdmin(user)
      ? [
          {
            key: "pos",
            title: "Kasir Kantin",
            group: "Keuangan",
            permission: "pos.read",
          },
        ]
      : []),
    {
      key: "cbt",
      title: "Simulasi Siswa",
      group: "Dashboard",
      permission: "site.read",
    },
  );
  if (can(user, "admission.read"))
    links.push({
      key: "admissions",
      title: "Pengaturan PPDB",
      group: "Administrasi",
      permission: "admission.read",
    });
  if (!user.roles.includes("STUDENT"))
    links.push({
      key: "ppdb",
      title: "PPDB",
      group: "PPDB",
      permission: "site.read",
    });
  if (can(user, "file.read"))
    links.push({
      key: "files",
      title: "Management Berkas",
      group: "Pengaturan",
      permission: "file.read",
    });
  if (can(user, "website.read"))
    links.push({
      key: "website",
      title: "Website Sekolah",
      group: "Website",
      permission: "website.read",
    });
  if (can(user, "domain.read"))
    links.push({
      key: "domains",
      title: "Custom Domain",
      group: "Website",
      permission: "domain.read",
    });
  if (can(user, "boarding.read"))
    links.push(
      ...boardingNavigation.map(({ key, title }) => ({
        key,
        title,
        group: "Boarding School",
        permission: "boarding.read",
      })),
    );
  if (can(user, "library.read"))
    links.push({
      key: "library",
      title: "Perpustakaan",
      group: "Operasional",
      permission: "library.read",
    });
  if (can(user, "audit.read"))
    links.push({
      key: "security",
      title: "Audit & Keamanan",
      group: "Pengaturan",
      permission: "audit.read",
    });
  if (can(user, "site.read"))
    links.push({
      key: "sites",
      title: "List Sekolah",
      group: "Yayasan",
      permission: "site.read",
    });
  links.unshift({
    key: "dashboard",
    title: "Dashboard",
    group: "Dashboard",
    permission: "site.read",
  });
  for (let index = links.length - 1; index >= 0; index--)
    if (
      !openAllNavigationKeys.has(links[index].key) &&
      !can(user, links[index].permission)
    )
      links.splice(index, 1);
  const dataKeys = new Set([
    "sites",
    "foundation-profile",
    "foundation-team",
    "subjects",
    "grade-levels",
    "classrooms",
  ]);
  const administrationKeys = new Set(groupedNavigation.Administrasi);
  const teacherKeys = new Set(groupedNavigation.Guru);
  const settingsKeys = new Set(groupedNavigation.Pengaturan);
  const academicKeys = new Set([
    "teacher-subjects",
    "class-subjects",
    "class-students",
    "attendance",
    "assessments",
    "grades",
  ]);
  for (const link of links) {
    if (link.key === "dashboard") link.group = "Dashboard";
    else if (["portal", "cbt"].includes(link.key)) link.group = "Dashboard";
    else if (link.key === "family") link.group = "Utama";
    else if (dataKeys.has(link.key)) link.group = "Yayasan";
    else if (settingsKeys.has(link.key)) link.group = "Pengaturan";
    else if (administrationKeys.has(link.key)) link.group = "Administrasi";
    else if (teacherKeys.has(link.key)) link.group = "Guru";
    else if (groupedNavigation.Website.includes(link.key))
      link.group = "Website";
    else if (groupedNavigation.PPDB.includes(link.key)) link.group = "PPDB";
    else if (academicKeys.has(link.key)) link.group = "Akademik";
    else if (["billing", "wallet", "pos"].includes(link.key))
      link.group = "Keuangan";
    else if (groupedNavigation["Boarding School"].includes(link.key))
      link.group = "Boarding School";
    else if (link.key === "library") link.group = "Operasional";
    else link.group = "Publikasi";
  }
  if (user.account_level !== "OPERATIONAL")
    for (let index = links.length - 1; index >= 0; index--)
      if (operationalNavigationGroups.has(links[index].group))
        links.splice(index, 1);
  const groupOrder = [
    "Dashboard",
    "Utama",
    "Akademik",
    "Guru",
    "Keuangan",
    "Boarding School",
    "Operasional",
    "PPDB",
    "Publikasi",
    "Administrasi",
    "Pengaturan",
    "Yayasan",
    "Website",
  ];
  const groups = groupOrder.filter((group) =>
    links.some((link) => link.group === group),
  );
  const allowed = links.some((l) => l.key === route);
  const activeBoardingSection = boardingNavigation.find(
    ({ key }) => key === route,
  );
  const activeSchool = catalog.schools?.[0];
  const schoolName = String(
    activeSchool?.name || user.tenant_name || "Sekolah Anda",
  );
  const schoolAddress = String(
    activeSchool?.address || "Alamat sekolah belum diatur",
  );
  return (
    <div className="workspace">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <a className="brand" href={`#${homeRoute(user)}`}>
          <span className="brandmark">L</span>LangkahSiswa
        </a>
        <div
          className="school-context"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="school-pill"
            aria-haspopup={sites.length > 1 ? "menu" : undefined}
            aria-expanded={sites.length > 1 ? schoolSwitcherOpen : undefined}
            onClick={() =>
              sites.length > 1 && setSchoolSwitcherOpen(!schoolSwitcherOpen)
            }
          >
            <span className="school-avatar">▥</span>
            <span className="school-pill-copy">
              <strong>{schoolName}</strong>
              <span title={schoolAddress}>{schoolAddress}</span>
            </span>
            {sites.length > 1 && (
              <span className="school-switch-chevron" aria-hidden="true">
                {schoolSwitcherOpen ? "−" : "+"}
              </span>
            )}
          </button>
          {schoolSwitcherOpen && (
            <div className="school-switch-menu" role="menu">
              <span className="eyebrow">AKSES SEKOLAH</span>
              {sites.map((site) => (
                <button
                  type="button"
                  role="menuitem"
                  className={site.current ? "current" : ""}
                  key={site.id}
                  onClick={() => void switchSite(site.id)}
                >
                  <span>
                    <strong>{site.school_name || site.name}</strong>
                    <small>{site.roles.join(", ")}</small>
                  </span>
                  <span aria-hidden="true">{site.current ? "✓" : "→"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <nav aria-label="Navigasi utama">
          {groups.map((group) => {
            const groupLinks = links
              .filter((link) => link.group === group)
              .sort((a, b) => {
                const order = groupedNavigation[group];
                return order ? order.indexOf(a.key) - order.indexOf(b.key) : 0;
              });
            const items = groupLinks.map((link) => (
              <a
                className={route === link.key ? "active" : ""}
                key={link.key}
                href={`#${link.key}`}
                aria-current={route === link.key ? "page" : undefined}
              >
                {unmarkedNavigationGroups.has(group) ||
                unmarkedNavigationKeys.has(link.key)
                  ? ""
                  : "* "}
                {link.title}
                {route === link.key && <span>›</span>}
              </a>
            ));
            return (
              <div className="nav-group" key={group}>
                {groupedNavigation[group] ? (
                  <>
                    <button
                      className={`nav-group-toggle ${groupedNavigation[group].includes(route) ? "current" : ""}`}
                      aria-expanded={!!openGroups[group]}
                      onClick={() =>
                        setOpenGroups((current) => ({
                          ...current,
                          [group]: !current[group],
                        }))
                      }
                    >
                      <span>
                        {unmarkedNavigationGroups.has(group)
                          ? group
                          : `* ${group}`}
                      </span>
                      <span aria-hidden="true">
                        {openGroups[group] ? "−" : "+"}
                      </span>
                    </button>
                    {openGroups[group] && (
                      <div className="nav-submenu">{items}</div>
                    )}
                  </>
                ) : (
                  <>
                    <hr className="nav-divider" />
                    {items}
                  </>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {accountMenuOpen && (
            <div className="account-popover" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setAccountDetailOpen(true);
                }}
              >
                <span aria-hidden="true">◎</span> Akun Saya
              </button>
              <ThemeToggle menuItem />
              <button
                className="sidebar-signout"
                role="menuitem"
                onClick={() => void logout()}
              >
                <span aria-hidden="true">↪</span> Keluar
              </button>
            </div>
          )}
          <button
            className="sidebar-account account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setAccountMenuOpen(!accountMenuOpen);
            }}
          >
            <span className="sidebar-user-avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="sidebar-account-detail">
              <strong title={user.name}>{user.name}</strong>
            </div>
            <span className="account-chevron" aria-hidden="true">
              ⌃
            </span>
          </button>
        </div>
      </aside>
      {accountDetailOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">AKUN SAYA</span>
                <h2 id="account-title">{user.name}</h2>
              </div>
              <button
                aria-label="Tutup detail akun"
                onClick={() => setAccountDetailOpen(false)}
              >
                ×
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Peran</dt>
                <dd>{user.roles.join(" · ")}</dd>
              </div>
              <div>
                <dt>Yayasan</dt>
                <dd>{user.organization_name || "—"}</dd>
              </div>
              <div>
                <dt>Lokasi aktif</dt>
                <dd>{user.tenant_name || "—"}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-shell">
        <button
          className="menu-toggle"
          aria-label="Buka menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          ☰
        </button>
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
          ) : route === "dashboard" ? (
            <DashboardPage user={user} catalog={catalog} sites={sites} />
          ) : route === "sites" ? (
            <SitesPage
              user={user}
              sites={sites}
              reload={async () => {
                await Promise.all([loadSites(), refresh()]);
              }}
              switchSite={switchSite}
            />
          ) : route === "foundation-profile" ? (
            <FoundationProfilePage user={user} />
          ) : route === "academic-year-setup" ? (
            <AcademicYearSetupPage
              user={user}
              catalog={catalog}
              refresh={refresh}
            />
          ) : route === "family" ? (
            <FamilyPage />
          ) : route === "school-team" ? (
            <SchoolAccountsPage
              user={user}
              catalog={catalog}
              refresh={refresh}
            />
          ) : route === "foundation-team" ? (
            <FoundationTeamPage
              user={user}
              catalog={catalog}
              refresh={refresh}
            />
          ) : route === "subjects" ? (
            <SubjectsPage user={user} catalog={catalog} refresh={refresh} />
          ) : route === "timetables" ? (
            <TimetablesPage user={user} catalog={catalog} />
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
            <UsersPage user={user} catalog={catalog} refresh={refresh} />
          ) : route === "billing" ? (
            <BillingPage user={user} />
          ) : route === "wallet" ? (
            <WalletPage user={user} />
          ) : route === "pos" ? (
            <PosPage />
          ) : route === "portal" ? (
            <PortalPage />
          ) : route === "admissions" ? (
            <AdmissionsPage user={user} catalog={catalog} />
          ) : route === "ppdb" ? (
            <PublicAdmissions />
          ) : route === "files" ? (
            <FilesPage user={user} catalog={catalog} />
          ) : route === "website" ? (
            <WebsiteBuilderPage user={user} catalog={catalog} />
          ) : route === "domains" ? (
            <DomainsPage user={user} />
          ) : activeBoardingSection ? (
            <BoardingPage
              user={user}
              catalog={catalog}
              section={activeBoardingSection.section}
              title={activeBoardingSection.title}
            />
          ) : route === "library" ? (
            <LibraryPage user={user} catalog={catalog} />
          ) : route === "security" ? (
            <SecurityPage user={user} />
          ) : route === "cbt" || route === "cimulasi-cbt" ? (
            <CbtPage />
          ) : (
            <SettingsPage user={user} />
          )}
        </main>
        <footer className="app-footer">
          LangkahSiswa{" "}
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
        Memuat LangkahSiswa…
      </main>
    );
  return !user && (publicRoute === "cbt" || publicRoute === "cimulasi-cbt") ? (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        padding: "1rem",
      }}
    >
      <CbtPage />
    </div>
  ) : !user && publicRoute === "ppdb" ? (
    <PublicAdmissions />
  ) : user ? (
    <Workspace
      user={user}
      onUserChange={setUser}
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
