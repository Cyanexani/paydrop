"use client";

import { AllCommunityModule, ModuleRegistry, colorSchemeDark, themeQuartz } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
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

// The app is always dark: one plum-tinted grid theme, built once.
const gridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  accentColor: "#ff49c1",
  backgroundColor: "#2c0a26",
  foregroundColor: "#fbe9f3",
  headerBackgroundColor: "#44113e",
  oddRowBackgroundColor: "#330d2d",
  borderColor: "rgb(255 255 255 / 0.08)",
  chromeBackgroundColor: "#330d2d",
  wrapperBorderRadius: 18,
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
});

export function useGridTheme() {
  return gridTheme;
}

export const money = (p: { value: unknown }) => (typeof p.value === "number" ? formatMoney(p.value) : "");
