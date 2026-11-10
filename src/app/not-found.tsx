import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="text-sm font-medium text-subtle">404</span>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm leading-relaxed text-muted">No page lives at this address. Your money hasn&apos;t moved: it is exactly where the ledger says it is.</p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link href="/" className="jelly inline-flex min-h-10 items-center rounded-lg bg-butter px-4 text-sm font-semibold text-plum hover:bg-white">Back to home</Link>
        <Link href="/contracts" className="jelly inline-flex min-h-10 items-center rounded-lg border border-line bg-raised px-4 text-sm font-semibold hover:bg-well">View contracts</Link>
      </div>
    </section>
  );
}
