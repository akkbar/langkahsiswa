import React, { useEffect, useMemo, useState } from "react";
import type { Actor, Entity } from "../../../../packages/shared-types/src";
import { api, send } from "../api";
import { can, Catalog, ErrorBox, Empty } from "../components";

type AccountTab = "parents" | "teachers" | "staff";
type CompetencyDraft = { subject_id: string; grade_level_id: string };

const tabConfig = {
  parents: { label: "Orang tua/Wali", role: "PARENT", profile: "parents" },
  teachers: { label: "Guru", role: "TEACHER", profile: "teachers" },
  staff: { label: "Staff", role: "STAFF", profile: "staff" },
} as const;

const operationalStaffRoles = new Set([
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "FINANCE",
  "STAFF",
  "FOUNDATION_STAFF",
  "FOUNDATION_HEAD",
]);

function rolesOf(account: Entity) {
  return Array.isArray(account.roles) ? account.roles.map(String) : [];
}

export function SchoolAccountsPage({
  user,
  catalog,
  refresh,
}: {
  user: Actor;
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<AccountTab>("parents");
  const [selectedId, setSelectedId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [competencyRows, setCompetencyRows] = useState<CompetencyDraft[]>([]);
  const [relationship, setRelationship] = useState("GUARDIAN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState<"create" | "mapping" | null>(null);
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [accountForm, setAccountForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const accounts = catalog.users || [];
  const profiles = catalog[tabConfig[tab].profile] || [];
  const parentProfiles = catalog.parents || [];
  const guardians = catalog["student-guardians"] || [];
  const students = catalog.students || [];
  const subjects = catalog.subjects || [];
  const gradeLevels = catalog["grade-levels"] || [];
  const teacherCompetencies = catalog["teacher-competencies"] || [];
  const selected = accounts.find((account) => account.id === selectedId);
  const canManageMappings =
    ["create", "update", "delete"].every((action) =>
      can(user, `people.${action}`),
    ) && can(user, "user.update");

  const tabAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const roles = rolesOf(account);
        const hasProfile = profiles.some(
          (profile) => profile.user_id === account.id,
        );
        if (tab === "parents") return roles.includes("PARENT") || hasProfile;
        if (tab === "teachers") return roles.includes("TEACHER") || hasProfile;
        return (
          roles.some((role) => operationalStaffRoles.has(role)) || hasProfile
        );
      }),
    [accounts, profiles, tab],
  );
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!query) return tabAccounts;
    return tabAccounts.filter((account) => {
      const owned = linkedStudents(account.id)
        .map((student) => student.name)
        .join(" ");
      return [account.name, account.email, rolesOf(account).join(" "), owned]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(query);
    });
  }, [tabAccounts, search, parentProfiles, guardians, students]);
  const visibleAccounts = filteredAccounts.slice(0, visibleLimit);

  function parentFor(accountId: string) {
    return parentProfiles.find((profile) => profile.user_id === accountId);
  }

  function linkedStudents(accountId: string) {
    const parent = parentFor(accountId);
    if (!parent) return [];
    const ids = new Set(
      guardians
        .filter((guardian) => guardian.parent_id === parent.id)
        .map((guardian) => String(guardian.student_id)),
    );
    return students.filter((student) => ids.has(student.id));
  }

  function competenciesFor(teacherId: string) {
    return teacherCompetencies
      .filter((item) => item.teacher_id === teacherId)
      .map((item) => ({
        subject_id: String(item.subject_id),
        grade_level_id: String(item.grade_level_id),
      }));
  }

  useEffect(() => {
    if (!selected) {
      setProfileId("");
      setStudentIds([]);
      setCompetencyRows([]);
      return;
    }
    const linkedProfile = profiles.find(
      (profile) => profile.user_id === selected.id,
    );
    setProfileId(String(linkedProfile?.id || ""));
    setStudentIds(linkedStudents(selected.id).map((student) => student.id));
    setCompetencyRows(
      tab === "teachers" && linkedProfile
        ? competenciesFor(String(linkedProfile.id))
        : [],
    );
    setError("");
  }, [selectedId, tab, catalog]);

  useEffect(() => {
    setSelectedId("");
    setSearch("");
    setVisibleLimit(30);
    setDrawer(null);
  }, [tab]);

  useEffect(() => setVisibleLimit(30), [search]);

  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setDrawer(null);
        setSelectedId("");
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer, busy]);

  function closeDrawer() {
    if (busy) return;
    setDrawer(null);
    setSelectedId("");
    setError("");
  }

  function loadMore(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    if (
      element.scrollTop + element.clientHeight >= element.scrollHeight - 80 &&
      visibleLimit < filteredAccounts.length
    )
      setVisibleLimit((current) => current + 30);
  }

  const availableProfiles = profiles.filter(
    (profile) => !profile.user_id || profile.user_id === selectedId,
  );

  async function saveMapping() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const currentRoles = rolesOf(selected);
      const addedRoles = [
        ...(currentRoles.includes(tabConfig[tab].role)
          ? []
          : [tabConfig[tab].role]),
        ...(studentIds.length && !currentRoles.includes("PARENT")
          ? ["PARENT"]
          : []),
      ];
      if (addedRoles.length)
        await send(`users/${selected.id}/roles`, { add: addedRoles }, "PATCH");
      const profileResource = tabConfig[tab].profile;
      const currentProfile = profiles.find(
        (profile) => profile.user_id === selected.id,
      );
      if (currentProfile && currentProfile.id !== profileId)
        await send(
          `${profileResource}/${currentProfile.id}`,
          { user_id: null },
          "PATCH",
        );
      if (profileId && currentProfile?.id !== profileId)
        await send(
          `${profileResource}/${profileId}`,
          { user_id: selected.id },
          "PATCH",
        );

      if (tab === "teachers" && profileId) {
        const competencyKeys = competencyRows
          .filter((item) => item.subject_id && item.grade_level_id)
          .map((item) => `${item.subject_id}:${item.grade_level_id}`);
        if (new Set(competencyKeys).size !== competencyKeys.length)
          throw new Error(
            "Mata pelajaran dan tingkat kelas yang sama tidak boleh dipilih dua kali",
          );
        const existingCompetencies = teacherCompetencies.filter(
          (item) => item.teacher_id === profileId,
        );
        const desired = new Set(competencyKeys);
        for (const item of existingCompetencies)
          if (!desired.has(`${item.subject_id}:${item.grade_level_id}`))
            await api(`teacher-competencies/${item.id}`, {
              method: "DELETE",
            });
        const existing = new Set(
          existingCompetencies.map(
            (item) => `${item.subject_id}:${item.grade_level_id}`,
          ),
        );
        for (const item of competencyRows)
          if (
            item.subject_id &&
            item.grade_level_id &&
            !existing.has(`${item.subject_id}:${item.grade_level_id}`)
          )
            await send("teacher-competencies", {
              teacher_id: profileId,
              subject_id: item.subject_id,
              grade_level_id: item.grade_level_id,
            });
      }

      const previousParent = parentFor(selected.id);
      let parent = previousParent;
      if (tab === "parents" && profileId)
        parent = parentProfiles.find((item) => item.id === profileId);
      if (studentIds.length && !parent)
        parent = await send("parents", {
          name: selected.name,
          email: selected.email,
          user_id: selected.id,
        });

      if (parent) {
        if (previousParent && previousParent.id !== parent.id)
          for (const guardian of guardians.filter(
            (item) => item.parent_id === previousParent.id,
          ))
            await api(`student-guardians/${guardian.id}`, {
              method: "DELETE",
            });
        const existing = guardians.filter(
          (guardian) => guardian.parent_id === parent!.id,
        );
        const currentIds = new Set(
          existing.map((guardian) => String(guardian.student_id)),
        );
        for (const studentId of studentIds)
          if (!currentIds.has(studentId))
            await send("student-guardians", {
              student_id: studentId,
              parent_id: parent.id,
              relationship,
              is_primary: false,
              can_pickup: true,
              receive_notification: true,
            });
        for (const guardian of existing)
          if (!studentIds.includes(String(guardian.student_id)))
            await api(`student-guardians/${guardian.id}`, { method: "DELETE" });
      }

      await refresh();
      setMessage("Mapping akun, sekolah, profil, dan siswa sudah diperbarui.");
      setDrawer(null);
      setSelectedId("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await send("users", {
        ...accountForm,
        roles: [tabConfig[tab].role],
      });
      await refresh();
      setAccountForm({ name: "", email: "", password: "" });
      setDrawer(null);
      setMessage(`Akun ${tabConfig[tab].label} terhubung ke sekolah aktif.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">YAYASAN · AKUN OPERATIONAL</span>
          <h1>Semua Akun</h1>
          <p className="muted">
            Petakan satu identity ke sekolah aktif, profil warga sekolah, dan
            siswa yang dimiliki. Akun guru atau staff tetap dapat menjadi wali.
          </p>
        </div>
        <div className="page-actions filter-toolbar">
          <input
            aria-label="Cari akun"
            placeholder="Cari nama, email, role, atau siswa…"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {can(user, "user.create") && (
            <button
              className="primary"
              onClick={() => {
                setError("");
                setMessage("");
                setDrawer("create");
              }}
            >
              + Hubungkan Akun
            </button>
          )}
        </div>
      </div>

      <ErrorBox error={drawer ? "" : error} />
      {message && <p className="notice success">{message}</p>}

      <div className="tabs school-team-tabs" aria-label="Jenis akun sekolah">
        {(Object.keys(tabConfig) as AccountTab[]).map((key) => (
          <button
            className={tab === key ? "primary" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {tabConfig[key].label}
          </button>
        ))}
      </div>

      <section className="card">
        {!visibleAccounts.length ? (
          <Empty text={`Belum ada akun ${tabConfig[tab].label}.`} />
        ) : (
          <div className="table-wrap" onScroll={loadMore}>
            <table>
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Role</th>
                  <th>Binding sekolah</th>
                  <th>Profil</th>
                  <th>Kepemilikan siswa</th>
                  <th>Mapel & tingkat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => {
                  const profile = profiles.find(
                    (item) => item.user_id === account.id,
                  );
                  const owned = linkedStudents(account.id);
                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{String(account.name)}</strong>
                        <br />
                        <span className="muted">{String(account.email)}</span>
                      </td>
                      <td>{rolesOf(account).join(", ") || "—"}</td>
                      <td>
                        <span className="badge green">{user.tenant_name}</span>
                      </td>
                      <td>
                        {profile ? String(profile.name) : "Belum dipetakan"}
                      </td>
                      <td>
                        {owned.length
                          ? owned.map((student) => student.name).join(", ")
                          : "—"}
                      </td>
                      <td>
                        {tab === "teachers" && profile
                          ? competenciesFor(String(profile.id))
                              .map((competency) => {
                                const subject = subjects.find(
                                  (item) => item.id === competency.subject_id,
                                );
                                const level = gradeLevels.find(
                                  (item) =>
                                    item.id === competency.grade_level_id,
                                );
                                return `${String(subject?.name || "Mapel")} · ${String(level?.name || "Tingkat")}`;
                              })
                              .join(", ") || "Belum diatur"
                          : "—"}
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            setSelectedId(account.id);
                            setDrawer("mapping");
                          }}
                        >
                          Atur mapping
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleAccounts.length < filteredAccounts.length && (
              <div className="table-lazy-status" role="status">
                Scroll untuk memuat data berikutnya…
              </div>
            )}
          </div>
        )}
      </section>

      {drawer && (
        <div className="school-drawer-layer">
          <button
            className="school-drawer-backdrop"
            aria-label="Tutup form akun"
            onClick={closeDrawer}
          />
          <aside
            className="school-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-drawer-title"
          >
            <div className="school-drawer-header">
              <div>
                <span className="eyebrow">
                  {drawer === "create" ? "AKUN BARU" : "MAPPING AKUN"}
                </span>
                <h2 id="account-drawer-title">
                  {drawer === "create"
                    ? "Hubungkan Akun"
                    : String(selected?.name || "Akun")}
                </h2>
              </div>
              <button aria-label="Tutup" disabled={busy} onClick={closeDrawer}>
                ×
              </button>
            </div>
            <ErrorBox error={error} />
            {drawer === "create" ? (
              <form className="school-editor-form" onSubmit={createAccount}>
                <p className="muted">
                  Akun dibuat atau digunakan kembali berdasarkan email, lalu
                  diberi role {tabConfig[tab].label} pada sekolah ini.
                </p>
                <label>
                  Nama
                  <input
                    required
                    value={accountForm.name}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={accountForm.email}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        email: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Kata sandi awal
                  <input
                    required
                    type="password"
                    minLength={12}
                    autoComplete="new-password"
                    value={accountForm.password}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        password: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="school-drawer-actions">
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Menyimpan…"
                      : `Hubungkan sebagai ${tabConfig[tab].label}`}
                  </button>
                </div>
              </form>
            ) : (
              selected && (
                <form
                  className="school-editor-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveMapping();
                  }}
                >
                  <p className="muted">
                    Sekolah aktif menjadi konteks binding. Pilih profil dan anak
                    yang terhubung dengan identity ini.
                  </p>
                  <label>
                    Profil {tabConfig[tab].label}
                    <select
                      value={profileId}
                      onChange={(event) => {
                        setProfileId(event.target.value);
                        setCompetencyRows(
                          tab === "teachers"
                            ? competenciesFor(event.target.value)
                            : [],
                        );
                      }}
                    >
                      <option value="">Belum dipetakan</option>
                      {availableProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {String(profile.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tab === "teachers" && (
                    <fieldset>
                      <legend>Mata pelajaran dan tingkat kelas</legend>
                      {!profileId && (
                        <span className="muted">
                          Pilih profil guru terlebih dahulu.
                        </span>
                      )}
                      {competencyRows.map((competency, index) => (
                        <div className="account-competency-row" key={index}>
                          <label>
                            Mata pelajaran
                            <select
                              disabled={!profileId}
                              value={competency.subject_id}
                              onChange={(event) =>
                                setCompetencyRows((current) =>
                                  current.map((item, position) =>
                                    position === index
                                      ? {
                                          ...item,
                                          subject_id: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="">Pilih mata pelajaran</option>
                              {subjects.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {String(subject.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Tingkat kelas
                            <select
                              disabled={!profileId}
                              value={competency.grade_level_id}
                              onChange={(event) =>
                                setCompetencyRows((current) =>
                                  current.map((item, position) =>
                                    position === index
                                      ? {
                                          ...item,
                                          grade_level_id: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="">Pilih tingkat kelas</option>
                              {gradeLevels.map((level) => (
                                <option key={level.id} value={level.id}>
                                  {String(level.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              setCompetencyRows((current) =>
                                current.filter(
                                  (_, position) => position !== index,
                                ),
                              )
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={!profileId}
                        onClick={() =>
                          setCompetencyRows((current) => [
                            ...current,
                            { subject_id: "", grade_level_id: "" },
                          ])
                        }
                      >
                        + Tambah kompetensi
                      </button>
                    </fieldset>
                  )}
                  <label>
                    Hubungan untuk siswa baru
                    <select
                      value={relationship}
                      onChange={(event) => setRelationship(event.target.value)}
                    >
                      <option value="FATHER">Ayah</option>
                      <option value="MOTHER">Ibu</option>
                      <option value="GUARDIAN">Wali</option>
                    </select>
                  </label>
                  <fieldset>
                    <legend>Kepemilikan / akses siswa</legend>
                    {!students.length && (
                      <span className="muted">Belum ada siswa.</span>
                    )}
                    {students.map((student) => (
                      <label className="check" key={student.id}>
                        <input
                          type="checkbox"
                          checked={studentIds.includes(student.id)}
                          onChange={(event) =>
                            setStudentIds((current) =>
                              event.target.checked
                                ? [...current, student.id]
                                : current.filter((id) => id !== student.id),
                            )
                          }
                        />
                        {String(student.name)}
                      </label>
                    ))}
                  </fieldset>
                  <div className="school-drawer-actions">
                    <button
                      className="primary"
                      disabled={busy || !canManageMappings}
                    >
                      {busy ? "Menyimpan…" : "Simpan mapping"}
                    </button>
                  </div>
                </form>
              )
            )}
          </aside>
        </div>
      )}
    </>
  );
}
