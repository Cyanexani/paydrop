"use client";

import { useEffect, useSyncExternalStore } from "react";

import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemeChoice = "dark" | "light" | "system";

function resolve(choice: ThemeChoice): "dark" | "light" {
  if (choice === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return choice;
}

function apply(choice: ThemeChoice) {
  const theme = resolve(choice);
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.toggle("dark", theme === "dark");
}

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  apply(choice);
  window.dispatchEvent(new Event("mp-theme"));
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** The theme in effect ("dark" | "light"), updating when it changes. */
export function useTheme(): "dark" | "light" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}

/** The stored choice, and a setter. Follows the OS while the choice is "system". */
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribeChoice, readChoice, () => "dark" as const);
  return [choice, setThemeChoice];
}

function subscribeChoice(cb: () => void) {
  window.addEventListener("mp-theme", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("mp-theme", cb);
    window.removeEventListener("storage", cb);
  };
}

/** Mounted once in the layout: keeps "system" in step with the OS, and other tabs in step with this one. */
export function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOs = () => {
      if (readChoice() === "system") apply("system");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) apply(readChoice());
    };
    mq.addEventListener("change", onOs);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onOs);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

/** Header button: one click flips between light and dark. */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setThemeChoice(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="jelly grid size-10 place-items-center rounded-full border border-line text-muted transition-colors hover:border-butter hover:text-paper"
    >
      {theme === "dark" ? (
        <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
