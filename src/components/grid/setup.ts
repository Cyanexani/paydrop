"use client";

import { AllCommunityModule, ModuleRegistry, colorSchemeDark, colorSchemeLight, themeQuartz } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import { useMemo, useSyncExternalStore } from "react";
import { formatMoney } from "@/lib/money";

let registered = false;

/** AG Grid Enterprise: row grouping, totals, set filters, Excel export and the AI Toolkit. */
export function ensureGridModules() {
  if (registered) return;
  ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
  const key = process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY;
  if (key) LicenseManager.setLicenseKey(key);
  registered = true;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useGridTheme() {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return useMemo(
    () =>
      themeQuartz.withPart(dark ? colorSchemeDark : colorSchemeLight).withParams({
        accentColor: "#047857",
        fontFamily: "inherit",
        fontSize: 13,
        headerFontWeight: 600,
      }),
    [dark],
  );
}

export const money = (p: { value: unknown }) => (typeof p.value === "number" ? formatMoney(p.value) : "");
