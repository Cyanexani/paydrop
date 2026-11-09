import type { Page } from "playwright-core";
import type { PageReport } from "./types";

export const NAME_SHIM = "globalThis.__name = globalThis.__name || ((f) => f);";

/**
 * Snapshot what a person would see, plus the hidden strings an attacker could use to
 * talk to the checker. Interactive elements get stable `data-mp-ref` handles the agent can use.
 */
export async function pageReport(page: Page, status: number | null, consoleErrors: string[]): Promise<PageReport> {
  // Some TS runners (tsx/esbuild keepNames) wrap functions in a __name helper that doesn't exist in the page.
  await page.evaluate(NAME_SHIM);
  const data = await page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    let n = 0;
    const ref = (el: Element) => {
      let r = el.getAttribute("data-mp-ref");
      if (!r) {
        r = `e${++n}`;
        el.setAttribute("data-mp-ref", r);
      }
      return r;
    };
    const visible = (el: Element) => {
      const s = window.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (el: Element) => {
      const id = el.getAttribute("id");
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return clean(byFor?.textContent || el.closest("label")?.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder"));
    };

    const hidden: Array<{ where: "hidden" | "comment" | "attribute" | "meta"; text: string }> = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (!visible(el) && el.children.length === 0 && clean(el.textContent)) hidden.push({ where: "hidden", text: clean(el.textContent).slice(0, 500) });
      for (const attr of ["alt", "title", "aria-label", "data-instructions", "content"]) {
        const v = el.getAttribute(attr);
        if (v && v.length > 20) hidden.push({ where: "attribute", text: v.slice(0, 500) });
      }
    });
    document.querySelectorAll("meta").forEach((m) => {
      const v = m.getAttribute("content");
      if (v && v.length > 20) hidden.push({ where: "meta", text: v.slice(0, 500) });
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => hidden.push({ where: "hidden", text: clean(s.textContent).slice(0, 800) }));
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    for (let c = walker.nextNode(); c; c = walker.nextNode()) hidden.push({ where: "comment", text: clean(c.textContent).slice(0, 500) });

    return {
      title: clean(document.title),
      metaDescription: clean(document.querySelector('meta[name="description"]')?.getAttribute("content")),
      headings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).map((h) => clean(h.textContent)).slice(0, 30),
      text: clean(document.body?.innerText).slice(0, 6000),
      links: Array.from(document.querySelectorAll("a[href]"))
        .filter(visible)
        .slice(0, 60)
        .map((a) => {
          const href = (a as HTMLAnchorElement).href;
          return { ref: ref(a), text: clean(a.textContent).slice(0, 80), href, internal: new URL(href, location.href).origin === location.origin };
        }),
      buttons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'))
        .filter(visible)
        .slice(0, 40)
        .map((b) => ({ ref: ref(b), text: clean(b.textContent || (b as HTMLInputElement).value).slice(0, 80) })),
      fields: Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea"))
        .filter(visible)
        .slice(0, 40)
        .map((f) => ({
          ref: ref(f),
          tag: f.tagName.toLowerCase(),
          type: (f as HTMLInputElement).type ?? "",
          name: f.getAttribute("name") ?? "",
          label: labelFor(f),
          required: (f as HTMLInputElement).required,
          options: f.tagName === "SELECT" ? Array.from((f as HTMLSelectElement).options).map((o) => clean(o.textContent)) : undefined,
        })),
      // Only images that are visible and actually loaded (a broken image doesn't count).
      images: Array.from(document.querySelectorAll("img")).filter((i) => visible(i) && (i as HTMLImageElement).naturalWidth > 0).length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      viewportWidth: window.innerWidth,
      hiddenStrings: hidden.slice(0, 200),
    };
  });
  return { url: page.url(), status, consoleErrors: consoleErrors.slice(-10), ...data };
}

/** Compact text the AI reads: never the raw HTML. */
export function reportForModel(r: PageReport): string {
  const lines = [
    `URL: ${r.url} (HTTP ${r.status ?? "?"}, viewport ${r.viewportWidth}px, horizontal overflow: ${r.horizontalOverflow ? "yes" : "no"})`,
    `Title: ${r.title || "(none)"}`,
    `Meta description: ${r.metaDescription || "(none)"}`,
    `Headings: ${r.headings.join(" | ") || "(none)"}`,
    `Images: ${r.images}`,
    `Links: ${r.links.map((l) => `[${l.ref}] ${l.text || "(no text)"} -> ${l.href}`).join("; ") || "(none)"}`,
    `Buttons: ${r.buttons.map((b) => `[${b.ref}] ${b.text}`).join("; ") || "(none)"}`,
    `Form fields: ${r.fields.map((f) => `[${f.ref}] ${f.tag}${f.type ? `/${f.type}` : ""} "${f.label || f.name}"${f.required ? " required" : ""}${f.options ? ` options: ${f.options.join(", ")}` : ""}`).join("; ") || "(none)"}`,
    r.consoleErrors.length ? `Console errors: ${r.consoleErrors.join(" | ")}` : "Console errors: none",
    `Visible text:\n${r.text}`,
  ];
  return lines.join("\n");
}
