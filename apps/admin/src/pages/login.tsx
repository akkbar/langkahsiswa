import React, { useState, useEffect, useRef } from "react";
import type { Actor } from "../../../../packages/shared-types/src";
import { ErrorBox } from "../components";
import { api, send, setToken } from "../api";
import { ThemeToggle } from "../theme";
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
    tenant_slug: "demo",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleState, setGoogleState] = useState("loading");
  const [linkCredential, setLinkCredential] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const googleButton = useRef<HTMLDivElement>(null);
  const school = useRef(form.tenant_slug);
  school.current = form.tenant_slug;
  const loginCallback = useRef(onLogin);
  loginCallback.current = onLogin;
  async function googleLogin(credential: string, account_password?: string) {
    if (!school.current.trim()) {
      setError("Isi kode sekolah sebelum masuk dengan Google.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await send("auth/google", {
        tenant_slug: school.current.trim(),
        credential,
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
          <span className="brandmark">S</span>LangkahSiswa
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
        <form onSubmit={submit}>
          <span className="eyebrow">SELAMAT DATANG</span>
          <h2>Masuk ke sekolah Anda</h2>
          <p className="muted">
            Gunakan akun yang diberikan administrator sekolah.
          </p>
          <ErrorBox error={error} />
          <label>
            Kode sekolah
            <input
              autoComplete="organization"
              required
              value={form.tenant_slug}
              onChange={(e) => {
                setForm({ ...form, tenant_slug: e.target.value });
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
          <label>
            Kata sandi
            <input
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Memeriksa akun…" : "Masuk ke LangkahSiswa →"}
          </button>
        </form>
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
              Konfirmasi kata sandi akun sekolah untuk menautkan Google pertama
              kali.
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
