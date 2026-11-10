export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const AUTH_PAGES = /^\/(login|signup|forgot-password|reset-password)(\/|$)/;

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  // The session ended (expired, or signed out in another tab): go to sign-in, then come back here.
  if (res.status === 401 && data.error?.code === "signed_out" && typeof window !== "undefined" && !AUTH_PAGES.test(window.location.pathname)) {
    // A full page load on purpose: it drops every component's data from the ended session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? res.statusText);
  return data as T;
}

export interface Session {
  viewer: { id: string; name: string; role: "client" | "freelancer"; kind: "human" | "agent"; email: string | null; emailVerified: boolean; demo: boolean } | null;
  demoEnabled: boolean;
  personas: Array<{ id: string; name: string; role: "client" | "freelancer"; kind: "human" | "agent"; headline: string | null }>;
}

export interface PublicConfig {
  paypalClientId: string | null;
  paypalEnv: "sandbox" | "live" | null;
  chargeCurrency: "INR" | "USD";
  inrPerUsd: number;
  aiMode: "claude" | "mock";
}
