import { describe, expect, it } from "vitest";
import { mockScope } from "./mock-scoping";
import { quoteInBrief, toScopeResult, type AiScopeOutput } from "./scoping-schema";

const BRIEF =
  "A website for my dance studio, Jaya Dance & Fitness: home, classes and contact pages, online class booking with a deposit through PayPal, a photo gallery of our shows, live on our own domain with good SEO. We have a logo and photos.";

const milestone = (title: string, briefQuote: string): AiScopeOutput["milestones"][number] => ({
  title,
  description: "What gets built.",
  briefQuote,
  skill: "web_dev",
  complexityTags: ["standard"],
  complexityReason: "Static pages.",
  estimate: { optimistic: 4, likely: 6, pessimistic: 10, reasoning: "Three pages." },
  durationDays: 3,
  criteria: [{ text: "The page loads", method: "browser" }],
});
const scoped = (...milestones: AiScopeOutput["milestones"]): AiScopeOutput => ({ status: "scoped", projectTitle: "Studio site", summary: "A site.", questions: [], refusalReason: "", milestones });

describe("quoteInBrief", () => {
  it("accepts exact excerpts whatever the case, spacing or quote style", () => {
    expect(quoteInBrief("online class booking with a deposit through PayPal", BRIEF)).toBe(true);
    expect(quoteInBrief("  “Online  class booking”  ", BRIEF)).toBe(true);
    expect(quoteInBrief("home, classes and contact pages ... a photo gallery of our shows", BRIEF)).toBe(true);
  });
  it("rejects paraphrases, invented work, reordered excerpts and tiny fragments", () => {
    expect(quoteInBrief("a booking system with PayPal deposits", BRIEF)).toBe(false);
    expect(quoteInBrief("a blog with weekly posts", BRIEF)).toBe(false);
    expect(quoteInBrief("a photo gallery of our shows ... home, classes and contact pages", BRIEF)).toBe(false);
    expect(quoteInBrief("a", BRIEF)).toBe(false);
    expect(quoteInBrief("", BRIEF)).toBe(false);
  });
});

describe("toScopeResult with a brief", () => {
  it("passes a scope whose milestones all quote the brief", () => {
    const r = toScopeResult(scoped(milestone("Pages", "home, classes and contact pages"), milestone("Booking", "online class booking with a deposit through PayPal")), BRIEF);
    expect(r.ok).toBe(true);
  });
  it("rejects a milestone the brief never asked for, naming it", () => {
    const r = toScopeResult(scoped(milestone("Pages", "home, classes and contact pages"), milestone("Mobile app", "an iOS and Android app")), BRIEF);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.issues.join(" ")).toMatch(/1\.briefQuote.*Mobile app.*not in the brief/);
  });
  it("rejects a milestone with no quote at all", () => {
    const r = toScopeResult(scoped(milestone("Pages", "")), BRIEF);
    expect(r).toMatchObject({ ok: false });
  });
  it("without a brief (older callers) the quote is not required", () => {
    expect(toScopeResult(scoped(milestone("Pages", ""))).ok).toBe(true);
  });
});

describe("demo scoper", () => {
  it("quotes the brief on every milestone it can", () => {
    const r = mockScope(BRIEF);
    expect(r.status).toBe("scoped");
    if (r.status !== "scoped") return;
    for (const m of r.milestones) {
      expect(m.briefQuote, m.title).toBeTruthy();
      expect(quoteInBrief(m.briefQuote!, BRIEF), m.title).toBe(true);
    }
  });
});
