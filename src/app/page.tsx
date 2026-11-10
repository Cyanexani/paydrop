import Link from "next/link";
import { Reveal } from "@/components/motion";
import { PageTransition } from "@/components/page-transition";

const PREVIEW = [
  { n: 1, title: "Design and layout", price: "₹4,350", status: "Paid out", tone: "var(--tone-paid)" },
  { n: 2, title: "Booking system", price: "₹6,120", status: "Checking", tone: "var(--tone-check)" },
  { n: 3, title: "Gallery", price: "₹3,400", status: "Funded · held", tone: "var(--tone-held)" },
  { n: 4, title: "Deploy and SEO", price: "₹3,455", status: "Not funded", tone: "var(--tone-neutral)" },
];

const STEPS = [
  {
    title: "Scope the work",
    body: "Describe the project in plain words. The AI splits it into milestones, each with a price and criteria that can be checked, and asks when the brief is too vague to price.",
    icon: "M4 6h16M4 12h10M4 18h13",
  },
  {
    title: "Fund a milestone",
    body: "The client funds each milestone before work starts. PayPal holds the money, not us, and the hold is renewed before it expires.",
    icon: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z",
  },
  {
    title: "Release on verified work",
    body: "An AI checker opens the delivered site and tests every criterion. The client approves, and the payout goes to the freelancer's PayPal.",
    icon: "M5 12.5l4.5 4.5L19 7.5",
  },
];

export default function Home() {
  return (
    <PageTransition>
      <div className="space-y-20 pb-8">
        <section className="grid items-center gap-10 pt-6 lg:grid-cols-[1.05fr_1fr] lg:pt-12">
          <div className="flex min-w-0 flex-col gap-6">
            <span className="chip self-start"><span className="sw" style={{ background: "var(--tone-paid)" }} />Milestone payments held at PayPal</span>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Pay for outcomes,<br />not promises.
            </h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-muted">
              Describe the work. It&apos;s split into priced milestones. The client&apos;s money waits at PayPal and moves only when the work checks out.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/new" className="jelly inline-flex min-h-11 items-center gap-2 rounded-lg bg-butter px-5 text-[15px] font-semibold text-plum shadow-sm hover:bg-white">
                Start a project <span aria-hidden>→</span>
              </Link>
              <Link href="/contracts" className="jelly inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-5 text-[15px] font-semibold hover:bg-well">
                View contracts
              </Link>
            </div>
            <p className="text-sm text-subtle">Free to try. Sign in, or explore with a demo account.</p>
          </div>

          <div aria-hidden className="min-w-0 rounded-2xl border border-line-soft bg-raised shadow-[0_24px_60px_-30px_rgb(0_0_0/0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Dance studio website</p>
                <p className="truncate text-xs text-subtle">Jaya Dance &amp; Fitness → Ravi Kumar</p>
              </div>
              <span className="chip"><span className="sw" style={{ background: "var(--tone-held)" }} />Active</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft text-center">
              {[["To fund", "₹3,455"], ["Held at PayPal", "₹9,520"], ["Paid out", "₹4,350"]].map(([k, v]) => (
                <div key={k} className="px-3 py-4">
                  <p className="text-xs text-subtle">{k}</p>
                  <p className="money pt-1 text-lg">{v}</p>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-line-soft">
              {PREVIEW.map((m) => (
                <li key={m.n} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid size-6 flex-none place-items-center rounded-md bg-well text-xs font-semibold text-muted">{m.n}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                  <span className="chip max-sm:hidden"><span className="sw" style={{ background: m.tone }} />{m.status}</span>
                  <span className="money w-16 text-right text-sm">{m.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-6">
          <Reveal className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <p className="leading-relaxed text-muted">Every milestone follows the same path: agreed, funded, delivered, checked, paid. You can see where the money is at each step.</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} as="article" delay={i * 80} className="flex flex-col gap-3 rounded-xl border border-line-soft bg-raised p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-magenta/10 text-magenta">
                    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                  </span>
                  <span className="text-sm font-medium text-subtle">Step {i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
