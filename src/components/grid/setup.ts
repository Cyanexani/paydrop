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

const shared = { fontFamily: "inherit", fontSize: 13, headerFontWeight: 600, wrapperBorderRadius: 10 } as const;

// Grids in the app's own surface colours, built once per theme.
const darkTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  ...shared,
  accentColor: "#8b96ff",
  backgroundColor: "#12151c",
  foregroundColor: "#eef0f4",
  headerBackgroundColor: "#181c25",
  oddRowBackgroundColor: "#12151c",
  borderColor: "#272c38",
  chromeBackgroundColor: "#181c25",
});
const lightTheme = themeQuartz.withPart(colorSchemeLight).withParams({
  ...shared,
  accentColor: "#4f46e5",
  backgroundColor: "#ffffff",
  foregroundColor: "#111827",
  headerBackgroundColor: "#f6f7f9",
  oddRowBackgroundColor: "#ffffff",
  borderColor: "#e8ebf0",
  chromeBackgroundColor: "#f6f7f9",
});

export function useGridTheme() {
  return useTheme() === "light" ? lightTheme : darkTheme;
}

export const money = (p: { value: unknown }) => (typeof p.value === "number" ? formatMoney(p.value) : "");

/** Column defaults for every grid: no ⋮ menu on each header (sorting, resizing and filters stay). */
export const baseColDef = { suppressHeaderMenuButton: true, resizable: true } as const;

/** Grid options shared by every grid: plain column names, without "sum(…)" around them. */
export const baseGridProps = { suppressAggFuncInHeader: true } as const;
