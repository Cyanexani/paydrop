import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, isPrivateAddress, requestGuard } from "./net-guard";

const resolveTo = (...ips: string[]) => async () => ips;

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "255.255.255.255", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicUrl in production", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.CHECKER_ALLOW_PRIVATE;
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...env };
  });

  it("refuses internal hosts and addresses without resolving them", async () => {
    const never = async () => {
      throw new Error("should not resolve");
    };
    for (const url of ["http://localhost:3000/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5:5432/", "http://db.internal/", "http://printer.local/", "http://0.0.0.0/"]) {
      await expect(assertPublicUrl(url, never), url).rejects.toThrow(/private or internal/);
    }
  });

  it("refuses other schemes and embedded credentials", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/Only http and https/);
    await expect(assertPublicUrl("ftp://example.com/")).rejects.toThrow(/Only http and https/);
    await expect(assertPublicUrl("https://user:pw@example.com/", resolveTo("93.184.216.34"))).rejects.toThrow(/username or password/);
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/valid web address/);
  });

  it("refuses a public-looking name that resolves to a private address, even alongside a public one", async () => {
    await expect(assertPublicUrl("https://evil.example/", resolveTo("10.0.0.1"))).rejects.toThrow(/private or internal/);
    await expect(assertPublicUrl("https://evil.example/", resolveTo("93.184.216.34", "127.0.0.1"))).rejects.toThrow(/private or internal/);
    await expect(assertPublicUrl("https://gone.example/", async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow(/couldn't find/);
  });

  it("accepts public sites and the app's own address", async () => {
    expect((await assertPublicUrl("https://jayadance.example/booking", resolveTo("93.184.216.34"))).hostname).toBe("jayadance.example");
    process.env.APP_URL = "https://paydrop.onrender.com";
    expect((await assertPublicUrl("https://paydrop.onrender.com/deliveries/ct_1/", resolveTo("10.0.0.9"))).pathname).toBe("/deliveries/ct_1/");
  });

  it("CHECKER_ALLOW_PRIVATE=1 turns the guard off; the per-check guard caches by host", async () => {
    let calls = 0;
    const guard = requestGuard(async () => {
      calls++;
      return ["93.184.216.34"];
    });
    expect(await guard("https://cdn.example/a.js")).toBe(true);
    expect(await guard("https://cdn.example/b.js")).toBe(true);
    expect(calls).toBe(1);
    expect(await guard("http://127.0.0.1:9000/admin")).toBe(false);
    expect(await guard("data:text/plain,hi")).toBe(true);
    process.env.CHECKER_ALLOW_PRIVATE = "1";
    expect((await assertPublicUrl("http://127.0.0.1:4000/")).port).toBe("4000");
  });
});

describe("assertPublicUrl outside production", () => {
  it("allows local fixtures, which the checker eval relies on", async () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    expect((await assertPublicUrl("http://127.0.0.1:5173/")).hostname).toBe("127.0.0.1");
  });
});
