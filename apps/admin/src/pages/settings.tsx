import React, { useState, useEffect } from "react";
import type {
  Actor,
  Entity,
  Page,
} from "../../../../packages/shared-types/src";
import {
  Catalog,
  can,
  statusLabels,
  label,
  ErrorBox,
  Empty,
  Select,
  FieldInput,
} from "../components";
import { api, send } from "../api";
export function SettingsPage({ user }: { user: Actor }) {
  const [setting, setSetting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    api(`tenants/${user.tenant_id}`)
      .then((r) => {
        setSetting(r.principal_approval_required);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [user]);
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">PENGATURAN</span>
          <h1>Kebijakan raport</h1>
        </div>
      </div>
      <section className="card padded">
        <ErrorBox error={error} />
        {message && <p className="notice success">{message}</p>}
        <label className="check">
          <input
            type="checkbox"
            checked={setting}
            disabled={!loaded || busy}
            onChange={(e) => setSetting(e.target.checked)}
          />
          Wajib persetujuan kepala sekolah sebelum publikasi
        </label>
        <p className="muted">
          Review wali kelas tetap wajib. Raport yang sudah terbit tidak dapat
          diubah.
        </p>
        <button
          className="primary"
          disabled={!loaded || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await send(
                `tenants/${user.tenant_id}/settings`,
                { principal_approval_required: setting },
                "PATCH",
              );
              setMessage("Kebijakan disimpan.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Simpan kebijakan
        </button>
      </section>
    </>
  );
}
