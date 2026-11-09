import Link from "next/link";

const steps = [
  {
    title: "Describe the project",
    body: "The AI scopes it into milestones with checkable criteria, and asks questions when the brief is too vague to price.",
    dot: "bg-magenta",
  },
  {
    title: "See a fair, explained price",
    body: "Same work earns the same base pay. Extra pay comes only from verified track record, shown line by line on a receipt.",
    dot: "bg-peach",
  },
  {
    title: "Money held, then released",
    body: "Each milestone is funded through PayPal and held, not taken. It is released only after the work is checked and the client approves.",
    dot: "bg-butter",
  },
];

const chips = [
  { label: "Funded · held", color: "#ff49c1", className: "left-[2%] top-[14%]", tilt: "-10deg", delay: "0s" },
  { label: "AI checked", color: "#ffb3ae", className: "right-[0%] top-[42%]", tilt: "8deg", delay: "-2s" },
  { label: "Paid out", color: "#fff7ad", className: "left-[14%] bottom-[8%]", tilt: "-5deg", delay: "-4s" },
];

export default function Home() {
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-7">
          <p className="animate-rise inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 py-1.5 pl-2 pr-4 text-sm text-zinc-300 backdrop-blur">
            <span className="dot-live size-2.5 rounded-full bg-magenta" aria-hidden />
            PayPal AI Hackathon · sandbox demo
          </p>
          <h1 className="animate-rise font-display text-5xl font-extrabold leading-[0.95] tracking-tight [animation-delay:80ms] sm:text-7xl">
            Pay for outcomes,
            <br />
            <span className="bg-gradient-to-r from-peach via-magenta to-butter bg-clip-text text-transparent">not promises.</span>
          </h1>
          <p className="animate-rise max-w-xl text-lg leading-relaxed text-zinc-300 [animation-delay:160ms]">
            MilestonePay turns a plain-language brief into milestones, prices them fairly, and holds the client&apos;s money in PayPal
            until the work is verified, whether the worker is a person or an AI agent.
          </p>
          <div className="animate-rise flex flex-wrap gap-3 [animation-delay:240ms]">
            <Link
              href="/new"
              className="inline-flex min-h-12 items-center rounded-full bg-butter px-7 font-semibold text-plum-800 shadow-[0_10px_30px_-10px_rgb(255_247_173/0.7)] transition-all hover:-translate-y-0.5 hover:bg-white"
            >
              Start a project
            </Link>
            <Link
              href="/contracts"
              className="inline-flex min-h-12 items-center rounded-full border border-white/15 bg-white/5 px-7 font-medium backdrop-blur transition-colors hover:border-white/30 hover:bg-white/10"
            >
              Your contracts
            </Link>
          </div>
          <p className="text-sm text-zinc-500">Pick a persona in the top-right corner to act as a client or a freelancer.</p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[30rem]" aria-hidden>
          <div className="absolute inset-[8%] rounded-full border border-white/[0.06]" />
          <div className="absolute inset-[24%] rounded-full border border-white/[0.06]" />
          <div className="goo absolute inset-0">
            <div className="blob blob-morph left-[30%] top-[28%] size-[42%] bg-gradient-to-br from-magenta to-plum-700" />
            <div className="blob blob-a left-[14%] top-[34%] size-[20%] bg-magenta" />
            <div className="blob blob-b left-[58%] top-[18%] size-[24%] bg-gradient-to-br from-peach to-magenta" />
            <div className="blob blob-c left-[54%] top-[60%] size-[15%] bg-peach" />
            <div className="blob blob-d left-[30%] top-[70%] size-[12%] bg-butter" />
          </div>
          {chips.map((c) => (
            <span
              key={c.label}
              className={`float-chip absolute flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-white shadow-lg backdrop-blur-md ${c.className}`}
              style={{ "--tilt": c.tilt, animationDelay: c.delay } as React.CSSProperties}
            >
              <span className="size-6 rounded-full ring-4 ring-white/20" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Three steps. One liquid flow of money.</h2>
          <p className="max-w-sm text-sm text-zinc-400">Every rupee is either held by PayPal, released for verified work, or returned. Nothing in between.</p>
        </div>
        <ol className="relative grid gap-5 md:grid-cols-3">
          <span aria-hidden className="absolute left-[16%] right-[16%] top-11 hidden h-px bg-gradient-to-r from-magenta via-peach to-butter opacity-50 md:block" />
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="group relative rounded-3xl border border-white/10 bg-plum-900/55 p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/25"
            >
              <span className="goo-sm relative mb-6 block size-10" aria-hidden>
                <span className={`absolute inset-0 rounded-full ${s.dot}`} />
                <span className={`absolute right-0 top-0 size-3 rounded-full ${s.dot} transition-transform duration-500 group-hover:translate-x-4 group-hover:-translate-y-2`} />
              </span>
              <span className="font-display text-sm font-bold text-zinc-500">0{i + 1}</span>
              <h3 className="mt-1 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
