import React, { useState, useEffect, useRef } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { ErrorBox } from "../components";
import { api, send, setToken } from "../api";
import { ThemeToggle } from "../theme";
import type { AccountType } from "../../../../packages/shared-types/src";
type GoogleId = {
  initialize: (options: {
    client_id: string;
    callback: (result: { credential: string }) => void;
    auto_select: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => void;
  cancel: () => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}
let googleLibrary: Promise<void> | null = null;
function loadGoogle() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (!googleLibrary)
    googleLibrary = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        googleLibrary = null;
        reject(
          new Error(
            "Google belum dapat dihubungi. Gunakan email dan kata sandi atau muat ulang halaman.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return googleLibrary;
}
export function Login({ onLogin }: { onLogin: (user: Actor) => void }) {
  const [form, setForm] = useState({
    organization_code: "demo",
    account_type: "SCHOOL_ADMIN" as AccountType,
    email: "",
    password: "",
    remember: false,
  });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [registration, setRegistration] = useState({
    tenant_slug: "demo",
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleState, setGoogleState] = useState("loading");
  const [linkCredential, setLinkCredential] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const googleButton = useRef<HTMLDivElement>(null);
  const organization = useRef(form.organization_code);
  organization.current = form.organization_code;
  const accountType = useRef(form.account_type);
  accountType.current = form.account_type;
  const loginCallback = useRef(onLogin);
  loginCallback.current = onLogin;
  async function googleLogin(credential: string, account_password?: string) {
    if (!organization.current.trim()) {
      setError("Isi kode yayasan sebelum masuk dengan Google.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await send("auth/google", {
        organization_code: organization.current.trim(),
        account_type: accountType.current,
        credential,
        remember: form.remember,
        ...(account_password ? { account_password } : {}),
      });
      setToken(data.access_token);
      loginCallback.current(data.user);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (
        message.includes("GOOGLE_LINK_REQUIRED") ||
        message.toLowerCase().includes("kata sandi")
      )
        setLinkCredential(credential);
    } finally {
      setBusy(false);
    }
  }
  const googleCallback = useRef(googleLogin);
  googleCallback.current = googleLogin;
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean; client_id: string }>("auth/google/config")
      .then(async (config) => {
        if (!active) return;
        if (!config.enabled) {
          setGoogleState("disabled");
          return;
        }
        await loadGoogle();
        if (!active || !googleButton.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.client_id,
          auto_select: false,
          callback: ({ credential }) => {
            void googleCallback.current(credential);
          },
        });
        window.google.accounts.id.renderButton(googleButton.current, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "signin_with",
          locale: "id",
          width: Math.min(360, googleButton.current.clientWidth || 300),
        });
        setGoogleState("ready");
      })
      .catch((e) => {
        if (active) {
          setGoogleState("error");
          setError(e.message);
        }
      });
    return () => {
      active = false;
      window.google?.accounts.id.cancel();
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await send("auth/login", form);
      setToken(data.access_token);
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brandmark">L</span>LangkahSiswa
        </div>
        <div>
          <span className="eyebrow">RUANG KERJA SEKOLAH</span>
          <h1>
            Administrasi tertata.
            <br />
            Belajar lebih bermakna.
          </h1>
          <p>
            Satu tempat untuk akademik, keuangan siswa, dan kabar terbaru dari
            sekolah.
          </p>
          <div className="story-tags">
            <span>Akademik</span>
            <span>Keuangan</span>
            <span>Komunikasi</span>
          </div>
        </div>
        <p className="story-footer">Sekolah · Guru · Siswa · Orang tua</p>
      </section>
      <section className="login-panel">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        {!registerMode ? (
          <form onSubmit={submit}>
            <span className="eyebrow">SELAMAT DATANG</span>
            <h2>Masuk ke sekolah Anda</h2>
            <p className="muted">
              Pilih ruang akun, lalu gunakan kredensial yang sesuai.
            </p>
            <ErrorBox error={error} />
            <div
              className="account-type-switch"
              role="group"
              aria-label="Jenis akun"
            >
              {[
                ["SCHOOL_ADMIN", "Admin Sekolah"],
                ["FAMILY", "Siswa / Wali"],
                ["SCHOOL_TENANT", "Tenant Sekolah"],
              ].map(([value, title]) => (
                <button
                  key={value}
                  type="button"
                  className={form.account_type === value ? "active" : ""}
                  aria-pressed={form.account_type === value}
                  onClick={() => {
                    setForm({ ...form, account_type: value as AccountType });
                    setLinkCredential("");
                    setError("");
                  }}
                >
                  {title}
                </button>
              ))}
            </div>
            <label>
              Kode yayasan
              <input
                autoComplete="organization"
                required
                value={form.organization_code}
                onChange={(e) => {
                  setForm({ ...form, organization_code: e.target.value });
                  setLinkCredential("");
                }}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                placeholder="nama@sekolah.sch.id"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="password-label">
              <span>Kata sandi</span>
              <div className="password-field">
                <input
                  aria-label="Kata sandi"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="password-visibility"
                  aria-label={
                    passwordVisible
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible(!passwordVisible)}
                >
                  {passwordVisible ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.8 10.8 0 0112 4c5.5 0 9 6 9 6a15.8 15.8 0 01-2.4 3.2M6.2 6.2C4.2 7.7 3 10 3 10s3.5 6 9 6a9.7 9.7 0 004-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <label className="check login-remember">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(event) =>
                  setForm({ ...form, remember: event.target.checked })
                }
              />
              Tetap masuk di perangkat ini
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Memeriksa akun…" : "Masuk ke LangkahSiswa →"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const data = await send("public/family/register", registration);
                setToken(data.access_token);
                onLogin(data.user);
              } catch (reason) {
                setError((reason as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="eyebrow">AKUN KELUARGA</span>
            <h2>Buat akun orang tua</h2>
            <p className="muted">
              Setelah akun dibuat, Anda langsung diarahkan ke PPDB jika belum
              memiliki data siswa.
            </p>
            <ErrorBox error={error} />
            <label>
              Kode yayasan
              <input
                required
                value={registration.tenant_slug}
                onChange={(event) =>
                  setRegistration({
                    ...registration,
                    tenant_slug: event.target.value.toLowerCase(),
                  })
                }
              />
            </label>
            <label>
              Nama orang tua/wali
              <input
                required
                value={registration.name}
                onChange={(event) =>
                  setRegistration({ ...registration, name: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={registration.email}
                onChange={(event) =>
                  setRegistration({
                    ...registration,
                    email: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Nomor telepon
              <input
                required
                value={registration.phone}
                onChange={(event) =>
                  setRegistration({
                    ...registration,
                    phone: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Kata sandi
              <input
                required
                type="password"
                minLength={12}
                value={registration.password}
                onChange={(event) =>
                  setRegistration({
                    ...registration,
                    password: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Membuat akun…" : "Buat akun & lanjut PPDB →"}
            </button>
          </form>
        )}
        <button
          className="login-mode-switch"
          type="button"
          onClick={() => {
            setRegisterMode(!registerMode);
            setError("");
          }}
        >
          {registerMode
            ? "Sudah punya akun? Masuk"
            : "Belum punya akun? Daftar sebagai orang tua"}
        </button>
        {!registerMode && (
          <>
            <div className="login-divider">
              <span>atau</span>
            </div>
            <div
              className={busy ? "google-signin busy" : "google-signin"}
              ref={googleButton}
            />
            {googleState === "disabled" && (
              <p className="muted small google-hint">
                Login Google belum diaktifkan oleh sekolah.
              </p>
            )}
            {googleState === "loading" && (
              <p className="muted small google-hint" role="status">
                Menyiapkan login Google…
              </p>
            )}
            {linkCredential && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void googleLogin(linkCredential, accountPassword);
                }}
              >
                <p className="muted small">
                  Konfirmasi kata sandi akun sekolah untuk menautkan Google
                  pertama kali.
                </p>
                <label>
                  Kata sandi akun sekolah
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Tautkan akun Google</button>
              </form>
            )}
          </>
        )}
        <p className="muted small login-access">
          Akses data mengikuti peran dan sekolah Anda.
        </p>
        <a className="ppdb-link" href="#ppdb">
          Pendaftaran siswa baru (PPDB) →
        </a>
      </section>
    </main>
  );
}
