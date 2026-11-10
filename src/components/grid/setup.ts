"use client";

import { AllCommunityModule, ModuleRegistry, colorSchemeDark, colorSchemeLight, themeQuartz } from "ag-grid-community";
import { useTheme } from "../theme";
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

const shared = { fontFamily: "inherit", fontSize: 13, headerFontWeight: 600, wrapperBorderRadius: 18, accentColor: "#ff49c1" } as const;

// Plum-tinted grids for each theme, built once.
const darkTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  ...shared,
  backgroundColor: "#160a13",
  foregroundColor: "#fff1f7",
  headerBackgroundColor: "#2c0f27",
  oddRowBackgroundColor: "#1a0d17",
  borderColor: "rgb(255 255 255 / 0.08)",
  chromeBackgroundColor: "#1a0d17",
});
const lightTheme = themeQuartz.withPart(colorSchemeLight).withParams({
  ...shared,
  accentColor: "#c2187f",
  backgroundColor: "#ffffff",
  foregroundColor: "#24081f",
  headerBackgroundColor: "#f5ebf1",
  oddRowBackgroundColor: "#fcf7fa",
  borderColor: "#eadbe4",
  chromeBackgroundColor: "#fbf5f8",
});

export function useGridTheme() {
  return useTheme() === "light" ? lightTheme : darkTheme;
}

export const money = (p: { value: unknown }) => (typeof p.value === "number" ? formatMoney(p.value) : "");

/** Column defaults for every grid: no ⋮ menu on each header (sorting, resizing and filters stay). */
export const baseColDef = { suppressHeaderMenuButton: true, resizable: true } as const;

/** Grid options shared by every grid: plain column names, without "sum(…)" around them. */
export const baseGridProps = { suppressAggFuncInHeader: true } as const;
