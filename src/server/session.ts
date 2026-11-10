import { cookies } from "next/headers";
import type { Db } from "@/db/client";
import type { users } from "@/db/schema";
import { SESSION_DAYS, createSession, revokeSession, sessionUser } from "./auth/accounts";
import { AppError } from "./errors";

/**
 * Sessions: the httpOnly cookie holds a random token; the database stores only its SHA-256, with
 * an expiry. Signing out deletes the row, so a copied cookie stops working everywhere.
 */
export const SESSION_COOKIE = "mp_session";

export type Viewer = typeof users.$inferSelect;

async function cookieToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in user and whether it's a demo session, or null. */
export async function currentSession(db: Db): Promise<{ viewer: Viewer; demo: boolean } | null> {
  const raw = await cookieToken();
  if (!raw) return null;
  const s = await sessionUser(db, raw);
  return s ? { viewer: s.user, demo: s.demo } : null;
}

/** The signed-in user plus the raw cookie token, for actions that must spare "this device". */
export async function requireSession(db: Db): Promise<{ viewer: Viewer; demo: boolean; token: string }> {
  const raw = await cookieToken();
  const s = raw ? await sessionUser(db, raw) : null;
  if (!raw || !s) throw new AppError(401, "signed_out", "Sign in to continue");
  return { viewer: s.user, demo: s.demo, token: raw };
}

export async function currentViewer(db: Db): Promise<Viewer | null> {
  return (await currentSession(db))?.viewer ?? null;
}

export async function requireViewer(db: Db): Promise<Viewer> {
  const viewer = await currentViewer(db);
  if (!viewer) throw new AppError(401, "signed_out", "Sign in to continue");
  return viewer;
}

/** Start a session for `userId` and set the cookie (replacing any session this browser had). */
export async function signIn(db: Db, userId: string, req: Request, demo = false): Promise<void> {
  const old = await cookieToken();
  if (old) await revokeSession(db, old);
  const { token, expiresAt } = await createSession(db, userId, { demo, userAgent: req.headers.get("user-agent") });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure whenever the site is served over HTTPS (Render, or behind a proxy that says so); plain
    // http://localhost would otherwise drop the cookie and sign-in would silently fail.
    secure: isHttps(req),
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 86_400,
  });
}

function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export async function signOut(db: Db): Promise<void> {
  const raw = await cookieToken();
  if (raw) await revokeSession(db, raw);
  (await cookies()).delete(SESSION_COOKIE);
}

/** The caller's address, for rate limits: Render puts the client first in X-Forwarded-For. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * Refuse cross-site form posts to the auth endpoints: the browser's Origin must be this site.
 * (Cookies are SameSite=Lax too; this is the second lock.)
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // Non-browser clients (curl, Postman, tests) send no Origin.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new AppError(403, "bad_origin", "Request came from another site");
}
