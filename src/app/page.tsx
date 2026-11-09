import Link from "next/link";

const steps = [
  {
    title: "Describe the project",
    body: "The AI scopes it into milestones with checkable criteria, and asks questions when the brief is too vague to price.",
  },
  {
    title: "See a fair, explained price",
    body: "Same work earns the same base pay. Extra pay comes only from verified track record, shown line by line on a receipt.",
  },
  {
    title: "Money held, then released for verified work",
    body: "Each milestone is funded through PayPal and held, not taken. It is released only after the work is checked and the client approves.",
  },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-6">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">PayPal AI Hackathon · sandbox demo</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Pay for outcomes, not promises.</h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          MilestonePay turns a plain-language brief into milestones, prices them fairly, and holds the client&apos;s money in PayPal
          until the work is verified, whether the worker is a person or an AI agent.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/new" className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800">
            Start a project
          </Link>
          <Link
            href="/contracts"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            Your contracts
          </Link>
        </div>
        <p className="text-sm text-zinc-500">Pick a persona in the top-right corner to act as a client or a freelancer.</p>
      </section>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{i + 1}</span>
            <h2 className="mt-1 font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
