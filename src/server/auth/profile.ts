import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { contracts, emailVerifications, milestones, payouts, sessions, users } from "@/db/schema";
import { SKILLS, SKILL_LABELS, type Skill } from "@/lib/pricing/config";
import { AppError, notFound } from "../errors";
import { emitEvent } from "../integrations";
import { standingFor } from "../reputation";
import { normalizeEmail, type User } from "./accounts";
import { PASSWORD_MAX, hashPassword, passwordProblem, verifyPassword } from "./password";
import { LIMITS, blockedFor, hit } from "./rate-limit";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const VERIFY_HOURS = 24;
/** A user counts as online for this long after their last request. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

const demoReadOnly = () => new AppError(403, "demo_read_only", "Demo accounts can't be changed. Create your own account to edit a profile.");

// ---------------------------------------------------------------- profile

export const ProfileUpdate = z.object({
  name: z.string().trim().min(2, "Enter your name or business name").max(80),
  headline: z.string().trim().max(120, "Keep the headline under 120 characters").optional(),
  skills: z.array(z.enum(SKILLS)).max(SKILLS.length).optional(),
  paypalEmail: z.string().trim().max(254).email("Enter a valid PayPal email").optional().or(z.literal("")),
});

/** What the settings page shows about the signed-in account. */
export function accountView(user: User, demo: boolean) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    headline: user.headline,
    skills: user.skills,
    paypalEmail: user.paypalEmail,
    hasPassword: user.passwordHash !== null,
    demo,
    memberSince: user.createdAt.toISOString(),
  };
}

export async function updateProfile(db: Db, user: User, demo: boolean, input: z.infer<typeof ProfileUpdate>): Promise<User> {
  if (demo) throw demoReadOnly();
  const isFreelancer = user.role === "freelancer";
  if (isFreelancer && input.skills !== undefined && input.skills.length === 0) {
    throw new AppError(400, "invalid_input", "skills: Pick at least one skill");
  }
  const [updated] = await db
    .update(users)
    .set({
      name: input.name,
      // Clients have no public headline, skills or payout address.
      headline: isFreelancer ? input.headline || null : user.headline,
      skills: isFreelancer ? (input.skills ?? user.skills) : user.skills,
      paypalEmail: isFreelancer ? (input.paypalEmail ? normalizeEmail(input.paypalEmail) : user.paypalEmail) : user.paypalEmail,
    })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------- password

export const PasswordChange = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX),
  newPassword: z.string().min(1, "Enter a new password").max(PASSWORD_MAX),
});

/** Changes the password and signs out every other device; the session that asked stays signed in. */
export async function changePassword(db: Db, user: User, demo: boolean, input: z.infer<typeof PasswordChange>, currentToken: string, ip: string): Promise<void> {
  if (demo || !user.passwordHash) throw demoReadOnly();
  const key = `pwchange:${user.id}:${ip}`;
  const wait = blockedFor(key, LIMITS.loginPerAccount);
  if (wait) throw new AppError(429, "too_many_attempts", `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    hit(key, LIMITS.loginPerAccount);
    throw new AppError(400, "invalid_input", "currentPassword: That isn't your current password");
  }
  const problem = passwordProblem(input.newPassword, user.email ?? undefined);
  if (problem) throw new AppError(400, "invalid_input", `newPassword: ${problem}`);
  if (input.newPassword === input.currentPassword) throw new AppError(400, "invalid_input", "newPassword: Choose a password you haven't just used");
  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, user.id));
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sha256(currentToken))));
}

// ---------------------------------------------------------------- devices

/** "Chrome on Windows" from a User-Agent header; good enough to tell your own devices apart. */
export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|Postman|node/i.test(ua) ? "API client" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}

export async function listDevices(db: Db, userId: string, currentToken: string, now = new Date()) {
  const current = sha256(currentToken);
  const rows = await db.select().from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now))).orderBy(desc(sessions.lastSeenAt));
  return rows
    .map((r) => ({
      // The stored id is already a hash of the cookie, so it can't be used to sign in.
      id: r.id,
      device: describeDevice(r.userAgent),
      demo: r.demo,
      current: r.id === current,
      signedInAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Sign out one other device, or all of them. Returns how many were signed out. */
export async function signOutDevices(db: Db, userId: string, currentToken: string, sessionId?: string): Promise<number> {
  const current = sha256(currentToken);
  if (sessionId === current) throw new AppError(400, "bad_request", "To sign out here, use Sign out in the account menu");
  const gone = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, current), ...(sessionId ? [eq(sessions.id, sessionId)] : [])))
    .returning({ id: sessions.id });
  return gone.length;
}

// ---------------------------------------------------------------- email verification

/**
 * Sends a one-time link to the account's email. Like password resets, the link goes out through the
 * Zapier hook (printed to the server log in local development) and is never returned to the browser.
 */
export async function requestEmailVerification(db: Db, user: User, demo: boolean, baseUrl: string): Promise<{ delivery: "email" | "log" | "none"; alreadyVerified: boolean }> {
  if (demo) throw new AppError(403, "demo_read_only", "Demo accounts use example addresses, so there is nothing to verify.");
  if (!user.email) throw new AppError(400, "bad_request", "This account has no email address");
  const channel = process.env.ZAPIER_HOOK_URL ? "email" : process.env.NODE_ENV !== "production" ? "log" : "none";
  if (user.emailVerifiedAt) return { delivery: channel, alreadyVerified: true };
  const key = `verify:${user.id}`;
  const wait = blockedFor(key, LIMITS.resetPerIp);
  if (wait) throw new AppError(429, "too_many_attempts", `We've sent several links already. Try again in ${Math.ceil(wait / 60)} minutes.`);
  hit(key, LIMITS.resetPerIp);

  const raw = randomBytes(32).toString("base64url");
  await db.insert(emailVerifications).values({ id: sha256(raw), userId: user.id, email: user.email, expiresAt: new Date(Date.now() + VERIFY_HOURS * 3_600_000) });
  const verifyUrl = `${baseUrl}/verify-email?token=${raw}`;
  if (channel === "email") await emitEvent({ type: "auth.email_verification_requested", email: user.email, name: user.name, verifyUrl, expiresInHours: VERIFY_HOURS });
  else if (channel === "log") console.info(`[dev] Email verification link for ${user.email} (valid ${VERIFY_HOURS} hours): ${verifyUrl}`);
  else console.warn("Email verification requested, but no email channel is set up (ZAPIER_HOOK_URL)");
  return { delivery: channel, alreadyVerified: false };
}

/** Marks the account verified. Works signed out too: the link itself is the proof. */
export async function verifyEmail(db: Db, raw: string, now = new Date()): Promise<{ email: string }> {
  const invalid = () => new AppError(400, "verify_invalid", "This link has expired or was already used. Ask for a new one in Settings.");
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.id, sha256(raw)), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, now)));
  if (!row) throw invalid();
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || user.email !== row.email) throw invalid();
  await db.update(emailVerifications).set({ usedAt: now }).where(eq(emailVerifications.id, row.id));
  await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id));
  return { email: row.email };
}

// ---------------------------------------------------------------- public profile

export interface Presence {
  online: boolean;
  /** ISO time of the last activity, or null if the user has never signed in. */
  lastSeenAt: string | null;
}

export function presenceOf(user: Pick<User, "lastSeenAt">, now = new Date()): Presence {
  const at = user.lastSeenAt;
  return { online: !!at && now.getTime() - at.getTime() < ONLINE_WINDOW_MS, lastSeenAt: at?.toISOString() ?? null };
}

/**
 * A freelancer's or agent's public page. Everything on it comes from the platform's own records
 * (checker results, PayPal payouts, deadlines), not from what the freelancer wrote about themselves.
 * No email address or other contact detail is included.
 */
export async function publicProfile(db: Db, id: string, now = new Date()) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || user.role !== "freelancer") throw notFound("Profile");
  const [owner] = user.ownerId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, user.ownerId)) : [];

  const counted = user.outcomes.filter((o) => !o.disputeOpen && !o.selfDealt);
  const rated = counted.filter((o) => o.stars !== null);
  const verified = counted.filter((o) => o.verified).length;
  const bySkill = new Map<Skill, number>();
  for (const o of counted) bySkill.set(o.skill, (bySkill.get(o.skill) ?? 0) + 1);
  const primary = [...bySkill.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? user.skills[0] ?? "web_dev";
  const { standing, tier } = standingFor(user.outcomes, primary, now);

  // An agent's payouts go to its owner's PayPal, under the agent's own id as payee.
  const paid = await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.payeeKey, user.id), eq(payouts.status, "succeeded")));

  const recent = [...counted].filter((o) => o.verified).sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 6);
  const ids = recent.map((o) => o.milestoneId).filter((x): x is string => !!x);
  const rows = ids.length
    ? await db
        .select({ id: milestones.id, draft: milestones.draft, contractTitle: contracts.title })
        .from(milestones)
        .innerJoin(contracts, eq(contracts.id, milestones.contractId))
        .where(inArray(milestones.id, ids))
    : [];
  const titles = new Map(rows.map((r) => [r.id, { title: r.draft.title, project: r.contractTitle }]));

  return {
    id: user.id,
    name: user.name,
    kind: user.kind,
    headline: user.headline,
    skills: user.skills.map((s) => ({ id: s, label: SKILL_LABELS[s] })),
    owner: owner ?? null,
    memberSince: user.createdAt.toISOString(),
    presence: presenceOf(user, now),
    tier: tier.name,
    reputation: standing.vrs,
    badges: {
      emailVerified: user.emailVerifiedAt !== null,
      payoutsReceived: paid.length,
      milestonesVerified: verified,
    },
    stats: {
      completed: counted.length,
      firstTryPassRate: counted.length ? counted.filter((o) => o.firstPass).length / counted.length : null,
      onTimeRate: counted.length ? counted.filter((o) => o.onTime).length / counted.length : null,
      stars: rated.length ? rated.reduce((a, o) => a + (o.stars ?? 0), 0) / rated.length : null,
      ratings: rated.length,
    },
    recentWork: recent.map((o) => {
      const t = o.milestoneId ? titles.get(o.milestoneId) : undefined;
      return {
        title: t?.title ?? `${SKILL_LABELS[o.skill]} milestone`,
        project: t?.project ?? null,
        skill: SKILL_LABELS[o.skill],
        completedAt: o.completedAt,
        firstPass: o.firstPass,
        onTime: o.onTime,
        stars: o.stars,
      };
    }),
  };
}

export type PublicProfile = Awaited<ReturnType<typeof publicProfile>>;
