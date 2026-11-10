import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt from Node's crypto: memory-hard, no native add-ons. Parameters are stored with each hash. */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEY_LEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash" (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Checked against when the email doesn't exist, so a wrong email takes as long as a wrong password. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not-a-real-password-for-timing");
  return dummy;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** The most common choices; long enough passwords from this list still get refused. */
const COMMON = new Set([
  "password123", "password1234", "1234567890", "qwertyuiop", "iloveyou12", "123456789a", "abcdefghij", "passw0rd123",
  "letmein1234", "welcome123", "admin12345", "qwerty12345", "milestonepay", "milestone123", "paydrop1234", "paydrop12345",
]);

/** Returns why a password is refused, or null. Length matters most (NIST SP 800-63B); no forced symbol rules. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don't include your email in your password";
  return null;
}
