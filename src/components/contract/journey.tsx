const STEPS = ["Agreed", "Funded", "Delivered", "Checked", "Paid"] as const;

/** `done` is the last finished step (-1 = none); `live` means the step after it is under way. */
function progress(status: string): { done: number; live: boolean } {
  switch (status) {
    case "accepted":
    case "release_failed":
      return { done: 0, live: false };
    case "funding":
      return { done: 0, live: true };
    case "funded":
    case "changes_requested":
      return { done: 1, live: false };
    case "submitted":
      return { done: 2, live: true };
    case "needs_review":
    case "verified":
    case "disputed":
      return { done: 3, live: false };
    case "releasing":
    case "release_pending":
      return { done: 3, live: true };
    case "released":
    case "payout_pending":
    case "paid_out":
      return { done: 4, live: false };
    default:
      return { done: -1, live: false };
  }
}

/**
 * A milestone's journey as a liquid track: the fill and the finished dots melt into one shape
 * (goo filter), and a pulsing dot reaches for the step that is under way.
 */
export function Journey({ status, color }: { status: string; color: string }) {
  const { done, live } = progress(status);
  const now = STEPS[done] ?? "Offered";
  return (
    <div className="px-3" role="img" aria-label={`Progress: ${now}${live ? `, ${STEPS[done + 1]} under way` : ""} (step ${done + 1} of ${STEPS.length})`}>
      <div className="relative h-8">
        <span className="absolute inset-x-0 top-[13px] h-1.5 rounded-full bg-line" />
        {STEPS.map((s, i) => (
          <span key={s} className="absolute top-[9px] size-3.5 -translate-x-1/2 rounded-full bg-line" style={{ left: `${i * 25}%` }} />
        ))}
        <div className="goo-sm absolute inset-x-[-14px] inset-y-0">
          <div className="absolute inset-x-[14px] inset-y-0">
            <span className="track-fill absolute left-0 top-[9px] h-3.5 rounded-full" style={{ width: `${Math.max(0, done) * 25}%`, background: color }} />
            {STEPS.map((s, i) => (
              <span
                key={s}
                className="track-dot absolute top-[5px] size-[22px] -translate-x-1/2 rounded-full"
                style={{ left: `${i * 25}%`, background: color, scale: i <= done ? 1 : 0 }}
              />
            ))}
            {live && <span className="track-now absolute top-[7px] size-[18px] -translate-x-1/2 rounded-full bg-peach" style={{ left: `${(done + 1) * 25 - 9}%` }} />}
          </div>
        </div>
      </div>
      <div className="label relative mt-1 h-4 text-[10px]">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`absolute ${i === 0 ? "left-0 -ml-3" : i === 4 ? "right-0 -mr-3" : "-translate-x-1/2"} ${i <= done ? "text-paper" : live && i === done + 1 ? "text-peach" : "text-subtle/70"}`}
            style={i > 0 && i < 4 ? { left: `${i * 25}%` } : undefined}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
