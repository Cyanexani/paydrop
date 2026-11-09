import { after } from "next/server";

/**
 * Run slow work (the browser checker) after the response is sent. Outside a Next.js
 * request (tests, scripts, the worker) it simply runs inline.
 */
export async function defer(task: () => Promise<unknown>): Promise<"deferred" | "inline"> {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.error("Deferred task failed", error);
    }
  };
  try {
    after(safe);
    return "deferred";
  } catch {
    await safe();
    return "inline";
  }
}
