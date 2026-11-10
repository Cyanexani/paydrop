import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The checker opens whatever link a freelancer submits, from inside our network. Without a guard,
 * a link to http://localhost, a cloud metadata address or another internal service would make the
 * checker fetch it and show the result on the contract (server-side request forgery). These helpers
 * refuse any address that isn't on the public internet.
 *
 * Local development and the checker eval serve fixtures on 127.0.0.1, so private addresses are
 * allowed outside production, or with CHECKER_ALLOW_PRIVATE=1. The app's own public address
 * (where AI-agent deliveries are hosted) is always allowed.
 */
export class BlockedUrlError extends Error {
  /** `unresolvable`: the name has no DNS record right now (not proof of anything internal). */
  constructor(message: string, readonly kind: "blocked" | "unresolvable" = "blocked") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export function privateAddressesAllowed(): boolean {
  const flag = process.env.CHECKER_ALLOW_PRIVATE;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
];

/** True for loopback, private, link-local and other addresses that aren't on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const lower = ip.toLowerCase().split("%")[0];
    if (lower === "::" || lower === "::1") return true;
    // IPv4 written inside IPv6 (::ffff:10.0.0.1, or its hex form ::ffff:a00:1).
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  // Not an IP address at all: refuse rather than guess.
  return true;
}

function ownHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      // A malformed APP_URL simply isn't an allowed host.
    }
  }
  return hosts;
}

type Resolver = (hostname: string) => Promise<string[]>;
const systemResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Throws BlockedUrlError unless `raw` is an http(s) URL whose host resolves only to public addresses.
 * Every address a name resolves to must be public, so a name with one public and one private record
 * can't be used to slip through.
 */
export async function assertPublicUrl(raw: string, resolve: Resolver = systemResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("That isn't a valid web address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Only http and https links can be checked");
  if (url.username || url.password) throw new BlockedUrlError("Links with a username or password in them can't be checked");
  if (privateAddressesAllowed()) return url;

  // URL keeps IPv6 literals in brackets; strip them, and a trailing dot on names.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (ownHosts().has(host)) return url;
  const refused = new BlockedUrlError("That link points to a private or internal address. Submit a link on the public internet.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw refused;
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw refused;
    return url;
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new BlockedUrlError(`We couldn't find ${host}. Check the link and try again.`, "unresolvable");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw refused;
  return url;
}

/** A per-check guard that remembers each host's verdict, for use on every request the browser makes. */
export function requestGuard(resolve: Resolver = systemResolver) {
  const verdicts = new Map<string, Promise<boolean>>();
  return (raw: string): Promise<boolean> => {
    let key: string;
    try {
      const u = new URL(raw);
      // data:, blob: and about: never leave the browser.
      if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return Promise.resolve(true);
      key = `${u.protocol}//${u.host}`;
    } catch {
      return Promise.resolve(false);
    }
    let verdict = verdicts.get(key);
    if (!verdict) {
      verdict = assertPublicUrl(raw, resolve).then(() => true, () => false);
      verdicts.set(key, verdict);
    }
    return verdict;
  };
}

/** fetch that follows redirects itself, checking every hop, so a public page can't bounce us inside. */
export async function guardedFetch(raw: string, init: { signal?: AbortSignal } = {}, maxHops = 5): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { redirect: "manual", signal: init.signal });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new BlockedUrlError("Too many redirects");
}
