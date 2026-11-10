import Link from "next/link";
import type { CSSProperties } from "react";
import { PointerBlob, Reveal } from "@/components/motion";
import { PageTransition } from "@/components/page-transition";

const chips = [
  { label: "#01 Scope", color: "#ff49c1", style: { left: 0, top: "6%", rotate: "-12deg" } },
  { label: "#02 Held", color: "#6a1452", style: { right: 0, top: "30%", rotate: "9deg", animationDelay: "-2s" } },
  { label: "#03 Checked", color: "#ffb3ae", style: { left: "6%", bottom: "14%", rotate: "-6deg", animationDelay: "-4s" } },
  { label: "#04 Paid", color: "#fff7ad", style: { right: "8%", bottom: "2%", rotate: "7deg", animationDelay: "-5s" } },
] satisfies { label: string; color: string; style: CSSProperties }[];

export default function Home() {
  return (
    <PageTransition>
    <div className="space-y-20">
      <section data-pointer-zone className="poster flex min-h-[600px] flex-col">
        <div aria-hidden className="ring right-[4%] top-20 size-[560px] max-lg:hidden" />
        <div aria-hidden className="ring right-[calc(4%+100px)] top-[180px] size-[360px] max-lg:hidden" />
        <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-7 sm:px-9">
          <span>MilestonePay<br /><span className="opacity-75">Pay per milestone</span></span>
          <span className="text-right">Stops<br /><span className="opacity-75">4</span></span>
        </div>
        <div className="flex flex-1 flex-wrap items-end gap-8 px-6 pb-9 pt-10 sm:px-9">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-7">
            <h1 className="cond rise text-[clamp(52px,8vw,116px)] font-extrabold leading-[0.88] tracking-[-0.045em]">
              Pay for<br />outcomes,<br />
              <span className="money text-butter [font-stretch:100%]">not promises.</span>
            </h1>
            <p className="max-w-[470px] text-lg leading-relaxed">
              Describe the work. Claude cuts it into priced milestones. The client&apos;s money waits in PayPal and only moves when the work checks out.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/new" className="jelly inline-flex min-h-[52px] items-center gap-3 rounded-full bg-butter px-7 font-bold text-plum hover:bg-white">
                Start a project <span aria-hidden>→</span>
              </Link>
              <Link href="/contracts" className="jelly inline-flex min-h-[52px] items-center rounded-full border border-paper/50 px-7 font-semibold hover:border-paper">
                Your contracts
              </Link>
            </div>
            <p className="label">Free to try: sign in, or explore with a demo account</p>
          </div>
          <div aria-hidden className="relative h-[400px] min-w-0 flex-[1_1_380px] max-sm:h-[300px]">
            <div className="goo-lg absolute inset-0">
              <div className="mb left-[30%] top-[24%] size-[200px] bg-paper" />
              <div className="mb mb1 left-[14%] top-[40%] size-[90px] bg-paper" />
              <div className="mb mb2 left-[62%] top-[16%] size-[110px] bg-butter" />
              <div className="mb mb3 left-[50%] top-[64%] size-[72px] bg-peach" />
              <div className="mb mb4 left-[26%] top-[74%] size-[52px] bg-paper" />
              <PointerBlob />
            </div>
            {chips.map((c) => (
              <span key={c.label} className="chip chip-glass float absolute py-1.5 pl-1.5 pr-[18px] text-sm font-medium" style={c.style}>
                <span className="sw size-6" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
        <div className="label grid grid-cols-3 gap-4 border-t border-paper/20 px-6 pb-6 pt-4 sm:px-9">
          <span>Sandbox demo<br /><span className="opacity-75">No real money moves</span></span>
          <span>Held by<br /><span className="opacity-75">PayPal, not us</span></span>
          <span className="text-right">Built for<br /><span className="opacity-75">PayPal AI Hackathon</span></span>
        </div>
      </section>

      <section>
        <Reveal className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-7">
          <h2 className="cond text-[clamp(40px,5vw,64px)] font-extrabold leading-[0.95]">
            Every rupee<br />is a <span className="money text-magenta [font-stretch:100%]">drop.</span>
          </h2>
          <p className="max-w-[360px] leading-relaxed text-muted">
            Watch where it sits. It&apos;s split into milestones, guarded at PayPal, and merges into the freelancer&apos;s pool only when the work passes.
          </p>
        </Reveal>
        <div className="grid md:grid-cols-3">
          <Step n="01" delay={0} tag="Scope" color="text-magenta" title="One brief splits into milestones" className="md:border-r md:pr-7"
            body="Claude scopes it and asks when the brief is too vague to price. Each drop gets checkable criteria and a computed price.">
            <div className="goo-md absolute inset-0"><span className="split s1" /><span className="split s2" /><span className="split s3" /><span className="split s4" /></div>
          </Step>
          <Step n="02" delay={120} tag="Hold" color="text-peach" title="PayPal guards the money" className="md:border-r md:px-7"
            body="The client funds a milestone before work starts. PayPal holds it, not us, and the hold is renewed before day 29.">
            <div className="goo-md absolute inset-0"><span className="hold-core" /><span className="hold-orb o1" /><span className="hold-orb o2" /><span className="hold-orb o3" /></div>
            <span className="label absolute left-[18px] top-3.5 text-subtle">PayPal</span>
            <span className="label absolute right-[18px] top-3.5 text-subtle">Authorized</span>
            <span className="label absolute bottom-3.5 left-[18px] text-subtle">Not taken until approved</span>
          </Step>
          <Step n="03" delay={240} tag="Release" color="text-butter" title="It merges when the work checks out" className="md:pl-7"
            body="An AI checker opens the live site and tests every criterion. The client approves, and the drop flows into the payout.">
            <div className="goo-md absolute inset-0"><span className="rel-drop" /><span className="rel-pool" /></div>
          </Step>
        </div>
      </section>
    </div>
    </PageTransition>
  );
}

function Step({ n, delay, tag, color, title, body, className, children }: {
  n: string;
  delay: number;
  tag: string;
  color: string;
  title: string;
  body: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal as="article" delay={delay} className={`flex flex-col gap-[18px] border-line py-7 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className={`money text-[56px] leading-none ${color}`}>{n}</span>
        <span className="label text-subtle">{tag}</span>
      </div>
      <div aria-hidden className="relative h-[200px] overflow-hidden rounded-[28px] bg-well">{children}</div>
      <h3 className="cond text-[32px] font-bold leading-none">{title}</h3>
      <p className="text-[15px] leading-relaxed text-muted">{body}</p>
    </Reveal>
  );
}
