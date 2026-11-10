import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { ensureSeeded } from "../seed";
import { createSession, demoUser, logIn, requestPasswordReset, resetPassword, revokeSession, sessionUser, signUp } from "./accounts";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { LIMITS } from "./rate-limit";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await ensureSeeded(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_LOGIN;
});

const newAccount = (over: Partial<Parameters<typeof signUp>[1]> = {}) =>
  ({ name: "Priya Shah", email: `priya.${Math.random().toString(36).slice(2)}@example.com`, password: "correct horse battery", role: "client", acceptTerms: true, ...over }) as Parameters<typeof signUp>[1];

describe("passwords", () => {
  it("hashes with a fresh salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("Correct horse battery", a)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("refuses short, common and email-based passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("password123")).toMatch(/too common/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/repeat/);
    expect(passwordProblem("priyashah2026!", "priyashah@example.com")).toMatch(/email/);
    expect(passwordProblem("correct horse battery", "priya@example.com")).toBeNull();
  });
});

describe("sign up and sign in", () => {
  it("creates an account with a hashed password and signs in with it, case-insensitive email", async () => {
    const input = newAccount({ email: "Priya.Shah@Example.com" });
    const user = await signUp(db, input, "1.1.1.1");
    expect(user.email).toBe("priya.shah@example.com");
    expect(user.passwordHash).not.toContain("correct horse");
    const again = await logIn(db, { email: " PRIYA.SHAH@example.com ", password: "correct horse battery" }, "1.1.1.1");
    expect(again.id).toBe(user.id);
  });

  it("refuses a second account with the same email", async () => {
    const input = newAccount();
    await signUp(db, input, "1.1.1.2");
    await expect(signUp(db, { ...input, email: input.email.toUpperCase() }, "1.1.1.2")).rejects.toMatchObject({ status: 409, code: "email_taken" });
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const input = newAccount();
    await signUp(db, input, "1.1.1.3");
    const wrong = logIn(db, { email: input.email, password: "not the password" }, "1.1.1.3");
    const unknown = logIn(db, { email: "nobody@example.com", password: "not the password" }, "1.1.1.3");
    await expect(wrong).rejects.toMatchObject({ status: 401, code: "wrong_credentials" });
    await expect(unknown).rejects.toMatchObject({ status: 401, code: "wrong_credentials", message: (await wrong.catch((e) => e)).message });
  });

  it("demo personas have no password, so they can't be signed into with one", async () => {
    await expect(logIn(db, { email: "jaya@jayadance.example", password: "anything at all" }, "1.1.1.4")).rejects.toMatchObject({ code: "wrong_credentials" });
  });

  it("locks an email out after too many wrong passwords, even with the right one", async () => {
    const input = newAccount();
    await signUp(db, input, "2.2.2.2");
    for (let i = 0; i < LIMITS.loginPerAccount.max; i++) {
      await expect(logIn(db, { email: input.email, password: "wrong password!" }, "2.2.2.2")).rejects.toMatchObject({ status: 401 });
    }
    await expect(logIn(db, { email: input.email, password: input.password }, "2.2.2.2")).rejects.toMatchObject({ status: 429, code: "too_many_attempts" });
    // Another address isn't affected.
    await expect(logIn(db, { email: input.email, password: input.password }, "3.3.3.3")).resolves.toMatchObject({ email: input.email });
  });

  it("freelancers get their skills and a payout email", async () => {
    const user = await signUp(db, newAccount({ role: "freelancer", skills: ["ui_design"], paypalEmail: "" }), "1.1.1.5");
    expect(user).toMatchObject({ role: "freelancer", skills: ["ui_design"], paypalEmail: user.email });
  });
});

describe("sessions", () => {
  it("stores only a hash of the cookie token, and ends on sign-out", async () => {
    const user = await signUp(db, newAccount(), "1.1.1.6");
    const { token } = await createSession(db, user.id);
    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows.map((r) => r.id)).not.toContain(token);
    expect((await sessionUser(db, token))?.user.id).toBe(user.id);
    await revokeSession(db, token);
    expect(await sessionUser(db, token)).toBeNull();
  });

  it("expires after its lifetime", async () => {
    const user = await signUp(db, newAccount(), "1.1.1.7");
    const { token, expiresAt } = await createSession(db, user.id);
    expect(await sessionUser(db, token, new Date(expiresAt.getTime() + 1000))).toBeNull();
    expect(await sessionUser(db, "made-up-token")).toBeNull();
  });
});

describe("password reset", () => {
  it("resets once with the emailed link and signs out other sessions", async () => {
    const input = newAccount();
    const user = await signUp(db, input, "4.4.4.4");
    const other = await createSession(db, user.id);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = await requestPasswordReset(db, input.email, "https://app.example", "4.4.4.4");
    expect(r.delivery).toBe("log");
    const link = String(log.mock.calls[0][0]).match(/https:\/\/app\.example\/reset-password\?token=([\w-]+)/);
    expect(link).not.toBeNull();

    await resetPassword(db, link![1], "a brand new passphrase");
    await expect(logIn(db, { email: input.email, password: "a brand new passphrase" }, "4.4.4.4")).resolves.toMatchObject({ id: user.id });
    expect(await sessionUser(db, other.token)).toBeNull();
    await expect(resetPassword(db, link![1], "another new passphrase")).rejects.toMatchObject({ code: "reset_invalid" });
  });

  it("answers the same for an unknown email and creates no link", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const r = await requestPasswordReset(db, "nobody-here@example.com", "https://app.example", "5.5.5.5");
    expect(r.delivery).toBe("log");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("demo accounts", () => {
  it("signs into demo personas only, and not when turned off", async () => {
    await expect(demoUser(db, "client-jaya")).resolves.toMatchObject({ id: "client-jaya" });
    await expect(demoUser(db, "agent-buildbot")).rejects.toMatchObject({ status: 400 });
    const [real] = await db.select().from(users).where(eq(users.role, "client"));
    expect(real).toBeTruthy();
    process.env.DEMO_LOGIN = "off";
    await expect(demoUser(db, "client-jaya")).rejects.toMatchObject({ status: 403, code: "demo_disabled" });
  });
});
