import type { ReactNode } from "react";

const POINTS = [
  { color: "#ff49c1", text: "Money waits at PayPal, not with us" },
  { color: "#ffb3ae", text: "Work is checked on the live site" },
  { color: "#fff7ad", text: "Paid only when it passes" },
];

/** Sign-in pages: a poster on the left (top on phones), the form on the right. */
export function AuthShell({ eyebrow, title, subtitle, children, footer }: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-stretch">
      <section aria-hidden className="poster flex min-h-[220px] min-w-0 flex-col max-lg:order-last lg:min-h-[680px]">
        <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-6 sm:px-8">
          <span>MilestonePay<br /><span className="opacity-75">Pay per milestone</span></span>
          <span className="text-right">Secure<br /><span className="opacity-75">sign-in</span></span>
        </div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden max-lg:hidden">
          <span className="ring size-[340px]" />
          <span className="ring size-[220px]" />
          <div className="goo-lg absolute inset-0">
            <div className="mb left-[38%] top-[34%] size-[150px] bg-paper" />
            <div className="mb mb1 left-[26%] top-[46%] size-[70px] bg-butter" />
            <div className="mb mb2 left-[56%] top-[26%] size-[86px] bg-peach" />
            <div className="mb mb3 left-[50%] top-[60%] size-[54px] bg-magenta" />
          </div>
        </div>
        <ul className="flex flex-col gap-2.5 px-6 pb-6 pt-5 sm:px-8">
          {POINTS.map((p) => (
            <li key={p.text} className="chip chip-glass self-start whitespace-normal py-1.5 pl-1.5 pr-4 text-[13px]">
              <span className="sw size-5" style={{ background: p.color }} />
              {p.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-w-0 flex-col justify-center rounded-[40px] border border-line-soft bg-raised px-5 py-9 sm:px-10">
        <div className="mx-auto w-full max-w-[440px] space-y-7">
          <div className="rise space-y-3">
            <span className="label text-peach">{eyebrow}</span>
            <h1 className="cond text-4xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
            {subtitle && <p className="text-[15px] leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="border-t border-line pt-5 text-sm text-muted">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
