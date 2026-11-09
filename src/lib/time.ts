/** Time-zone helpers. Everything is stored in UTC; deadlines end at 23:59:59 in the contract's zone. */

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Milliseconds the zone is ahead of UTC at `date` (IST: +5h30m). */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 23:59:59 local time on the calendar day `date` falls on in `timeZone`. */
export function endOfDayIn(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const localEnd = Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59);
  return new Date(localEnd - zoneOffsetMs(date, timeZone));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Each milestone is due at the end of the day its cumulative duration lands on, never past the deadline. */
export function milestoneDueDates(start: Date, durationsDays: readonly number[], deadlineDays: number, timeZone: string): Date[] {
  const deadline = endOfDayIn(addDays(start, deadlineDays), timeZone);
  let elapsed = 0;
  return durationsDays.map((d) => {
    elapsed += d;
    const due = endOfDayIn(addDays(start, elapsed), timeZone);
    return due < deadline ? due : deadline;
  });
}

export function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
}
