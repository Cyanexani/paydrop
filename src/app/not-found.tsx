import Link from "next/link";

export default function NotFound() {
  return (
    <section className="poster flex min-h-[600px] flex-col">
      <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-7 sm:px-9">
        <span>Error<br /><span className="opacity-75">404</span></span>
        <span className="text-right">Held here<br /><span className="opacity-75">Nothing</span></span>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-10 px-6 py-12 sm:px-9">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-7">
          <h1 className="cond rise text-[clamp(60px,10vw,150px)] font-extrabold leading-[0.84] tracking-[-0.045em]">
            This drop<br />
            <span className="money text-butter [font-stretch:100%]">went missing.</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed">No page lives at this address. Your money hasn&apos;t moved: it is exactly where the ledger says it is.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="jelly inline-flex min-h-[52px] items-center gap-3 rounded-full bg-butter px-7 font-bold text-plum hover:bg-white">
              Back home <span aria-hidden>→</span>
            </Link>
            <Link href="/contracts" className="jelly inline-flex min-h-[52px] items-center rounded-full border border-paper/50 px-7 font-semibold hover:border-paper">
              Your contracts
            </Link>
          </div>
        </div>
        <div aria-hidden className="relative h-72 min-w-64 flex-[1_1_320px]">
          <span className="ring left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 border-dashed" />
          <div className="goo-lg absolute inset-0">
            <span className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper" />
            <span className="lost absolute left-1/2 top-1/2 -ml-7 -mt-7 size-14 rounded-full bg-butter" />
          </div>
        </div>
      </div>
    </section>
  );
}
