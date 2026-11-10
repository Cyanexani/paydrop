import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { ensureSeeded } from "../seed";
import { createSession, logIn, sessionUser, signUp, type User } from "./accounts";
import { changePassword, describeDevice, listDevices, presenceOf, publicProfile, requestEmailVerification, signOutDevices, updateProfile, verifyEmail } from "./profile";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await ensureSeeded(db);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const PASSWORD = "correct horse battery";
let n = 0;
async function account(role: "client" | "freelancer" = "freelancer"): Promise<User> {
  n++;
  return signUp(db, { name: "Priya Shah", email: `priya${n}@example.com`, password: PASSWORD, role, skills: role === "freelancer" ? ["web_dev"] : undefined, acceptTerms: true }, `10.0.0.${n}`);
}
const fresh = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

describe("profile settings", () => {
  it("a freelancer can change name, headline, skills and PayPal email", async () => {
    const u = await account();
    const updated = await updateProfile(db, u, false, { name: "Priya S.", headline: "Booking sites", skills: ["web_dev", "ui_design"], paypalEmail: "Pay@Example.com" });
    expect(updated).toMatchObject({ name: "Priya S.", headline: "Booking sites", skills: ["web_dev", "ui_design"], paypalEmail: "pay@example.com" });
  });

  it("a freelancer can't end up with no skills, and a client gets no freelancer fields", async () => {
    const f = await account();
    await expect(updateProfile(db, f, false, { name: "Priya", skills: [] })).rejects.toThrow(/at least one skill/);
    const c = await account("client");
    const updated = await updateProfile(db, c, false, { name: "Studio", headline: "ignored", skills: ["web_dev"], paypalEmail: "x@example.com" });
    expect(updated).toMatchObject({ name: "Studio", headline: null, skills: [], paypalEmail: null });
  });

  it("demo accounts are read-only", async () => {
    const meera = await fresh("fl-meera");
    await expect(updateProfile(db, meera, true, { name: "Changed" })).rejects.toThrow(/Demo accounts/);
    expect((await fresh("fl-meera")).name).toBe("Meera Iyer");
  });
});

describe("password change", () => {
  it("needs the current password, then signs out other devices but not this one", async () => {
    const u = await account();
    const here = await createSession(db, u.id);
    const there = await createSession(db, u.id);
    await expect(changePassword(db, u, false, { currentPassword: "wrong wrong wrong", newPassword: "another fine phrase" }, here.token, "1.1.1.1")).rejects.toThrow(/current password/);
    await expect(changePassword(db, u, false, { currentPassword: PASSWORD, newPassword: "short" }, here.token, "1.1.1.1")).rejects.toThrow(/at least 10/);
    await changePassword(db, u, false, { currentPassword: PASSWORD, newPassword: "another fine phrase" }, here.token, "1.1.1.1");
    expect(await sessionUser(db, here.token)).not.toBeNull();
    expect(await sessionUser(db, there.token)).toBeNull();
    await expect(logIn(db, { email: u.email!, password: PASSWORD }, "2.2.2.2")).rejects.toThrow();
    expect((await logIn(db, { email: u.email!, password: "another fine phrase" }, "2.2.2.2")).id).toBe(u.id);
  });
});

describe("devices", () => {
  it("lists this device first and signs the others out", async () => {
    const u = await account();
    const phone = await createSession(db, u.id, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605 Version/18.0 Safari/604" });
    const here = await createSession(db, u.id, { userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537 Chrome/140 Safari/537" });
    const devices = await listDevices(db, u.id, here.token);
    expect(devices.map((d) => [d.device, d.current])).toEqual([["Chrome on Windows", true], ["Safari on iPhone or iPad", false]]);
    await expect(signOutDevices(db, u.id, here.token, devices[0].id)).rejects.toThrow(/Sign out in the account menu/);
    expect(await signOutDevices(db, u.id, here.token)).toBe(1);
    expect(await sessionUser(db, phone.token)).toBeNull();
    expect(await sessionUser(db, here.token)).not.toBeNull();
  });

  it("can't sign out someone else's device", async () => {
    const a = await account();
    const b = await account();
    const mine = await createSession(db, a.id);
    const theirs = await createSession(db, b.id);
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, b.id));
    expect(await signOutDevices(db, a.id, mine.token, row.id)).toBe(0);
    expect(await sessionUser(db, theirs.token)).not.toBeNull();
  });

  it("names common browsers", () => {
    expect(describeDevice(null)).toBe("Unknown device");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Gecko/20100101 Firefox/130.0")).toBe("Firefox on Mac");
  });
});

describe("email verification", () => {
  async function link(u: User): Promise<string> {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await requestEmailVerification(db, u, false, "https://app.example");
    const token = String(log.mock.calls.at(-1)?.[0]).match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    return token!;
  }

  it("a link verifies the account once, and is never returned to the caller", async () => {
    const u = await account();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await requestEmailVerification(db, u, false, "https://app.example");
    expect(JSON.stringify(res)).not.toContain("token");
    const token = String(log.mock.calls.at(-1)?.[0]).match(/token=([\w-]+)/)![1];
    expect((await verifyEmail(db, token)).email).toBe(u.email);
    expect((await fresh(u.id)).emailVerifiedAt).not.toBeNull();
    await expect(verifyEmail(db, token)).rejects.toThrow(/expired or was already used/);
    expect((await requestEmailVerification(db, await fresh(u.id), false, "https://app.example")).alreadyVerified).toBe(true);
  });

  it("rejects expired links and unknown tokens", async () => {
    const u = await account();
    const token = await link(u);
    await expect(verifyEmail(db, token, new Date(Date.now() + 25 * 3_600_000))).rejects.toThrow(/expired/);
    await expect(verifyEmail(db, "x".repeat(43))).rejects.toThrow(/expired/);
    expect((await fresh(u.id)).emailVerifiedAt).toBeNull();
  });

  it("demo accounts can't request one", async () => {
    await expect(requestEmailVerification(db, await fresh("fl-meera"), true, "https://app.example")).rejects.toThrow(/Demo accounts/);
  });
});

describe("presence and public profiles", () => {
  it("a request marks the user online; five minutes later they are 'active ago'", async () => {
    const u = await account();
    expect(presenceOf(await fresh(u.id))).toEqual({ online: false, lastSeenAt: null });
    const s = await createSession(db, u.id);
    const now = new Date();
    await sessionUser(db, s.token, now);
    expect(presenceOf(await fresh(u.id), now).online).toBe(true);
    expect(presenceOf(await fresh(u.id), new Date(now.getTime() + 6 * 60_000)).online).toBe(false);
  });

  it("shows a freelancer's verified record and no contact details", async () => {
    const p = await publicProfile(db, "fl-meera");
    expect(p).toMatchObject({ name: "Meera Iyer", kind: "human", tier: "Expert", badges: { emailVerified: false, milestonesVerified: 18, payoutsReceived: 0 } });
    expect(p.stats.completed).toBe(18);
    expect(p.stats.firstTryPassRate).toBeCloseTo(17 / 18);
    expect(p.stats.onTimeRate).toBeCloseTo(16 / 18);
    expect(p.stats.stars).toBeCloseTo(4.7);
    expect(p.recentWork).toHaveLength(6);
    expect(JSON.stringify(p)).not.toContain("@");
  });

  it("an agent's profile names its owner; clients have no public profile", async () => {
    const bot = await publicProfile(db, "agent-buildbot");
    expect(bot).toMatchObject({ kind: "agent", owner: { id: "fl-ravi", name: "Ravi Kumar" } });
    expect(bot.stats.firstTryPassRate).toBeNull();
    await expect(publicProfile(db, "client-jaya")).rejects.toThrow(/not found/);
    await expect(publicProfile(db, "nobody")).rejects.toThrow(/not found/);
  });
});
