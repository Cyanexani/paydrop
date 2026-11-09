import { mkdir } from "node:fs/promises";
import Kernel from "@onkernel/sdk";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

export interface CheckerBrowser {
  mode: "kernel" | "local";
  context: BrowserContext;
  /** Stops recording and releases the browser; returns where the replay can be watched. */
  close(): Promise<{ replayUrl: string | null; replayFile: string | null }>;
}

/**
 * Kernel cloud browser when KERNEL_API_KEY is set (recorded as a Kernel replay), otherwise a
 * local headless Chromium recording a video. Delivered sites never run on the app server's
 * own browser profile, and no platform credentials are present in the session.
 */
export async function openCheckerBrowser(opts: { replayDir?: string } = {}): Promise<CheckerBrowser> {
  if (process.env.KERNEL_API_KEY) return openKernel();
  return openLocal(opts.replayDir);
}

async function openKernel(): Promise<CheckerBrowser> {
  const kernel = new Kernel();
  const session = await kernel.browsers.create({ stealth: false, headless: false });
  const replay = await kernel.browsers.replays.start(session.session_id, { max_duration_in_seconds: 300 }).catch(() => null);
  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(session.cdp_ws_url);
  } catch (error) {
    await kernel.browsers.deleteByID(session.session_id).catch(() => undefined);
    throw error;
  }
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return {
    mode: "kernel",
    context,
    async close() {
      let replayUrl: string | null = replay?.replay_view_url ?? null;
      if (replay) {
        await kernel.browsers.replays.stop(replay.replay_id, { id_or_name: session.session_id }).catch(() => undefined);
        const listed = await kernel.browsers.replays.list(session.session_id).catch(() => []);
        replayUrl = listed.find((r) => r.replay_id === replay.replay_id)?.replay_view_url ?? replayUrl;
      }
      await browser?.close().catch(() => undefined);
      await kernel.browsers.deleteByID(session.session_id).catch(() => undefined);
      return { replayUrl, replayFile: null };
    },
  };
}

async function openLocal(replayDir?: string): Promise<CheckerBrowser> {
  const browser = await chromium.launch({ headless: true, channel: process.env.CHECKER_BROWSER_CHANNEL || undefined });
  if (replayDir) await mkdir(replayDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: replayDir ? { dir: replayDir, size: { width: 960, height: 600 } } : undefined,
  });
  return {
    mode: "local",
    context,
    async close() {
      const pages = context.pages();
      await context.close().catch(() => undefined);
      let replayFile: string | null = null;
      for (const p of pages) {
        const path = await p.video()?.path().catch(() => null);
        if (path) replayFile = path;
      }
      await browser.close().catch(() => undefined);
      return { replayUrl: null, replayFile };
    },
  };
}
