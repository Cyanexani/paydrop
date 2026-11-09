import type { ScopeResult } from "./scoping-schema";

/**
 * Deterministic stand-in for Claude, used when no API key is configured (AI_MODE=mock).
 * It returns the brief's dance studio example so the whole flow can be demoed offline.
 */
export function mockScope(brief: string): ScopeResult {
  const text = brief.trim();
  if (text.length < 40) {
    return {
      status: "needs_info",
      questions: [
        "What should the finished project do? List the pages or features you need.",
        "Do you have content (text, photos, logo) ready, or should the freelancer create it?",
        "Does anything need logins, payments or bookings?",
      ],
    };
  }
  if (/fake review|phishing|malware/i.test(text)) {
    return { status: "refused", reason: "This work breaks PayPal's Acceptable Use Policy." };
  }
  return {
    status: "scoped",
    projectTitle: "Dance studio website",
    summary: "A website for a dance studio with class booking, a photo gallery and basic SEO.",
    milestones: [
      {
        title: "Design and layout",
        description: "Home, classes and contact pages with the studio's branding, responsive on phones.",
        skill: "web_dev",
        complexityTags: ["standard"],
        complexityReason: "Static pages and layout.",
        estimate: { optimistic: 6, likely: 8, pessimistic: 14, reasoning: "Three pages from an existing logo and colours." },
        durationDays: 4,
        criteria: [
          { text: "Home, Classes and Contact pages load without errors", method: "browser" },
          { text: "Pages have no horizontal scroll at 375px width", method: "browser" },
          { text: "The studio logo and two brand colours appear on every page", method: "browser" },
        ],
      },
      {
        title: "Booking system",
        description: "Visitors pick a class and time slot and pay a deposit through PayPal.",
        skill: "web_dev",
        complexityTags: ["integrations"],
        complexityReason: "Payment integration.",
        estimate: { optimistic: 8, likely: 12, pessimistic: 20, reasoning: "Slot picker, form validation and PayPal checkout." },
        durationDays: 5,
        criteria: [
          { text: "A visitor can choose a class and a free time slot", method: "browser" },
          { text: "Submitting without a name or phone number shows an error", method: "browser" },
          { text: "Completing a booking opens PayPal checkout for the deposit", method: "browser" },
        ],
      },
      {
        title: "Gallery",
        description: "A photo gallery of performances and classes.",
        skill: "web_dev",
        complexityTags: ["standard"],
        complexityReason: "Static gallery.",
        estimate: { optimistic: 3, likely: 4, pessimistic: 7, reasoning: "Grid with a lightbox from supplied photos." },
        durationDays: 2,
        criteria: [
          { text: "The gallery page shows at least 12 photos", method: "browser" },
          { text: "Clicking a photo opens it larger", method: "browser" },
        ],
      },
      {
        title: "Deploy and SEO",
        description: "Live on the client's domain with titles, descriptions and a sitemap.",
        skill: "web_dev",
        complexityTags: ["standard"],
        complexityReason: "Hosting and metadata.",
        estimate: { optimistic: 2, likely: 3, pessimistic: 6, reasoning: "Domain and DNS can take longer than expected." },
        durationDays: 2,
        criteria: [
          { text: "The site loads over HTTPS on the client's domain", method: "browser" },
          { text: "Every page has a unique title and meta description", method: "browser" },
          { text: "/sitemap.xml lists every page", method: "browser" },
        ],
      },
    ],
  };
}
