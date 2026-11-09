"use client";

import { useState } from "react";
import { api } from "../api";

/** POST helper that tracks a busy flag, reports errors and refreshes the view afterwards. */
export function useAction(onChange: () => void, onError: (message: string | null) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T = Record<string, unknown>>(key: string, path: string, body: unknown = {}): Promise<T | null> {
    setBusy(key);
    onError(null);
    try {
      return await api<T>(path, { body });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
      onChange();
    }
  }
  return { busy, run };
}
