import type { Actor, Entity, Page } from "../../../packages/shared-types/src";
let token = "";
export function setToken(value: string) {
  token = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let refreshing: Promise<any> | null = null;
export async function refreshSession() {
  if (!refreshing)
    refreshing = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(401, "Silakan masuk kembali");
        const data = await res.json();
        setToken(data.access_token);
        return data as { access_token: string; user: Actor };
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const res = await fetch(`/api/v1/${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && retry && !path.startsWith("auth/")) {
    try {
      await refreshSession();
      return api(path, options, false);
    } catch {
      window.dispatchEvent(new Event("session-expired"));
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Koneksi gagal" }));
    throw new ApiError(
      res.status,
      [
        body.message,
        ...(body.errors || []).map((e: any) => `${e.field}: ${e.message}`),
      ].join(" · "),
    );
  }
  return res.json();
}
export const send = (path: string, data: unknown, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
export async function all(key: string) {
  let data: Entity[] = [];
  let page = 1;
  let total = 1;
  while (data.length < total) {
    const result = await api<Page<Entity>>(`${key}?limit=200&page=${page++}`);
    data = data.concat(result.data);
    total = result.total;
    if (!result.data.length) break;
  }
  return data;
}
export async function downloadReport(id: string) {
  let res = await fetch(`/api/v1/report-cards/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    await refreshSession();
    res = await fetch(`/api/v1/report-cards/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.message);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `raport-${id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
