import type { ReactNode } from "react";

const POINTS = [
  ["Money waits at PayPal", "The client's payment is held by PayPal, not by us, until the milestone passes."],
  ["Work is checked on the live site", "An AI checker tests each agreed criterion and records what it saw."],
  ["Paid only when it passes", "The payout is released to the freelancer after the client approves verified work."],
];

/** Sign-in pages: the form in a card, with a short explainer beside it on wide screens. */
export function AuthShell({ title, subtitle, children, footer }: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[960px] gap-10 pt-4 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-start lg:pt-10">
      <section className="min-w-0 rounded-xl border border-line-soft bg-raised px-5 py-7 shadow-[var(--shadow-card)] sm:px-8">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight [&_br]:hidden">{title}</h1>
            {subtitle && <p className="text-sm leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="border-t border-line-soft pt-5 text-sm text-muted">{footer}</div>}
        </div>
      </section>

      <aside className="min-w-0 space-y-5 max-lg:hidden lg:pt-8">
        <h2 className="text-lg font-semibold">Pay for outcomes, not promises</h2>
        <ul className="space-y-5">
          {POINTS.map(([head, body]) => (
            <li key={head} className="flex gap-3">
              <span aria-hidden className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-magenta/15 text-magenta">
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{head}</span>
                <span className="block text-sm leading-relaxed text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
