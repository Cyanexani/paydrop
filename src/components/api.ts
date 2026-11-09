export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? res.statusText);
  return data as T;
}

export interface Session {
  viewer: { id: string; name: string; role: "client" | "freelancer"; kind: "human" | "agent" } | null;
  personas: Array<{ id: string; name: string; role: "client" | "freelancer"; kind: "human" | "agent"; headline: string | null }>;
}

export interface PublicConfig {
  paypalClientId: string | null;
  paypalEnv: "sandbox" | "live" | null;
  chargeCurrency: "INR" | "USD";
  inrPerUsd: number;
  aiMode: "claude" | "mock";
}
