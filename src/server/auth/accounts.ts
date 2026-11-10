import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { emailVerifications, passwordResets, sessions, users } from "@/db/schema";
import { SKILLS } from "@/lib/pricing/config";
import { AppError, badRequest, newId } from "../errors";
import { emitEvent } from "../integrations";
import { personas } from "../seed";
import { PASSWORD_MAX, dummyHash, hashPassword, passwordProblem, verifyPassword } from "./password";
import { LIMITS, blockedFor, clear, hit } from "./rate-limit";

export type User = typeof users.$inferSelect;

export const SESSION_DAYS = 30;
const RESET_MINUTES = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

const Email = z.string().trim().min(3).max(254).email("Enter a valid email address");
const Password = z.string().min(1, "Enter a password").max(PASSWORD_MAX);

// ---------------------------------------------------------------- sessions

export async function createSession(db: Db, userId: string, opts: { demo?: boolean; userAgent?: string | null; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const raw = token();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(raw), userId, demo: opts.demo ?? false, userAgent: opts.userAgent?.slice(0, 300) ?? null, expiresAt, lastSeenAt: now });
  return { token: raw, expiresAt };
}

/** The signed-in user for a cookie token, or null if the session is unknown or expired. */
export async function sessionUser(db: Db, raw: string, now = new Date()): Promise<{ user: User; demo: boolean } | null> {
  const [row] = await db.select().from(sessions).where(and(eq(sessions.id, sha256(raw)), gt(sessions.expiresAt, now)));
  if (!row) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user) return null;
  // Record activity at most once a minute, not on every request: it drives "Online now" and the
  // device list in Settings.
  if (now.getTime() - row.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
  }
  if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 60_000) {
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));
    user.lastSeenAt = now;
  }
  return { user, demo: row.demo };
}

export async function revokeSession(db: Db, raw: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(raw)));
}

export async function revokeAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpired(db: Db, now = new Date()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, now));
  await db.delete(emailVerifications).where(lt(emailVerifications.expiresAt, now));
}

// ---------------------------------------------------------------- sign up

export const SignUpRequest = z
  .object({
    name: z.string().trim().min(2, "Enter your name or business name").max(80),
    email: Email,
    password: Password,
    role: z.enum(["client", "freelancer"]),
    skills: z.array(z.enum(SKILLS)).max(SKILLS.length).optional(),
    paypalEmail: Email.optional().or(z.literal("")),
    acceptTerms: z.literal(true, { error: "Accept the terms to create an account" }),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.password, v.email);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    if (v.role === "freelancer" && !v.skills?.length) ctx.addIssue({ code: "custom", path: ["skills"], message: "Pick at least one skill" });
  });

export async function signUp(db: Db, input: z.infer<typeof SignUpRequest>, ip: string): Promise<User> {
  const ipKey = `signup:${ip}`;
  const wait = blockedFor(ipKey, LIMITS.signupPerIp);
  if (wait) throw tooMany(wait);
  hit(ipKey, LIMITS.signupPerIp);

  const email = normalizeEmail(input.email);
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) throw new AppError(409, "email_taken", "An account with this email already exists. Sign in instead.");
  const isFreelancer = input.role === "freelancer";
  const [user] = await db
    .insert(users)
    .values({
      id: newId(isFreelancer ? "fl" : "cl"),
      name: input.name.trim(),
      role: input.role,
      email,
      passwordHash: await hashPassword(input.password),
      // Freelancers are paid through PayPal Payouts; clients get scope and payment messages here.
      skills: isFreelancer ? (input.skills ?? []) : [],
      paypalEmail: isFreelancer ? normalizeEmail(input.paypalEmail || email) : null,
      contactEmail: email,
      headline: isFreelancer ? "New on MilestonePay" : null,
      lastLoginAt: new Date(),
    })
    .returning();
  return user;
}

// ---------------------------------------------------------------- sign in

export const LogInRequest = z.object({ email: Email, password: Password });

const WRONG = () => new AppError(401, "wrong_credentials", "That email and password don't match an account");
const tooMany = (seconds: number) =>
  new AppError(429, "too_many_attempts", `Too many attempts. Try again in ${seconds < 90 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}.`);

export async function logIn(db: Db, input: z.infer<typeof LogInRequest>, ip: string): Promise<User> {
  const email = normalizeEmail(input.email);
  const accountKey = `login:${ip}:${email}`;
  const ipKey = `login:${ip}`;
  const wait = Math.max(blockedFor(accountKey, LIMITS.loginPerAccount), blockedFor(ipKey, LIMITS.loginPerIp));
  if (wait) throw tooMany(wait);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same work whether or not the account exists, so response time doesn't reveal which emails are registered.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.passwordHash || !ok) {
    hit(accountKey, LIMITS.loginPerAccount);
    hit(ipKey, LIMITS.loginPerIp);
    throw WRONG();
  }
  clear(accountKey);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}

// ---------------------------------------------------------------- demo accounts

/** One-click demo sign-in, for judges and the demo video. Off with DEMO_LOGIN=off. */
export function demoLoginEnabled(): boolean {
  return process.env.DEMO_LOGIN !== "off";
}

export function demoPersonaIds(): Set<string> {
  return new Set(personas(new Date()).filter((p) => p.kind !== "agent").map((p) => p.id));
}

export async function demoUser(db: Db, userId: string): Promise<User> {
  if (!demoLoginEnabled()) throw new AppError(403, "demo_disabled", "Demo accounts are turned off on this deployment");
  if (!demoPersonaIds().has(userId)) throw badRequest("That isn't a demo account");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError(404, "not_found", "Demo account not found");
  return user;
}

// ---------------------------------------------------------------- password reset

export const ForgotRequest = z.object({ email: Email });
export const ResetRequest = z.object({ token: z.string().min(20).max(200), password: Password });

/**
 * Starts a reset. The answer never says whether the email has an account. The link goes out through
 * the Zapier hook (a Zap can email it); in local development it's also printed to the server log.
 * It is never returned to the browser that asked, or anyone could take over any account.
 */
export async function requestPasswordReset(db: Db, rawEmail: string, baseUrl: string, ip: string): Promise<{ delivery: "email" | "log" | "none" }> {
  const ipKey = `reset:${ip}`;
  const wait = blockedFor(ipKey, LIMITS.resetPerIp);
  if (wait) throw tooMany(wait);
  hit(ipKey, LIMITS.resetPerIp);

  const email = normalizeEmail(rawEmail);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const channel = process.env.ZAPIER_HOOK_URL ? "email" : process.env.NODE_ENV !== "production" ? "log" : "none";
  if (!user || user.kind === "agent") return { delivery: channel };

  const raw = token();
  await db.insert(passwordResets).values({ id: sha256(raw), userId: user.id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
  const resetUrl = `${baseUrl}/reset-password?token=${raw}`;
  if (channel === "email") await emitEvent({ type: "auth.password_reset_requested", email, name: user.name, resetUrl, expiresInMinutes: RESET_MINUTES });
  else if (channel === "log") console.info(`[dev] Password reset link for ${email} (valid ${RESET_MINUTES} minutes): ${resetUrl}`);
  else console.warn("Password reset requested, but no email channel is set up (ZAPIER_HOOK_URL)");
  return { delivery: channel };
}

/** Sets the new password, uses up the link, and signs out every other session. */
export async function resetPassword(db: Db, raw: string, password: string, now = new Date()): Promise<User> {
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.id, sha256(raw)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
  if (!row) throw new AppError(400, "reset_invalid", "This reset link has expired or was already used. Ask for a new one.");
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user) throw new AppError(400, "reset_invalid", "This reset link has expired or was already used. Ask for a new one.");
  const problem = passwordProblem(password, user.email ?? undefined);
  if (problem) throw new AppError(400, "weak_password", problem);
  await db.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, row.id));
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  await revokeAllSessions(db, user.id);
  return user;
}
