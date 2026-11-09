import { assertMinor, type Minor } from "@/lib/money";

export interface SplitShare {
  payeeId: string;
  /** Basis points; all shares must total 10,000 (100%). */
  bps: number;
  /** The lead freelancer receives any rounding remainder. Exactly one share is the lead. */
  lead?: boolean;
}

export interface Allocation {
  payeeId: string;
  amountMinor: Minor;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

export function validateSplit(shares: readonly SplitShare[]): void {
  if (shares.length === 0) throw new SplitError("A split needs at least one payee");
  const ids = new Set(shares.map((s) => s.payeeId));
  if (ids.size !== shares.length) throw new SplitError("Each payee may appear once");
  if (!shares.every((s) => Number.isInteger(s.bps) && s.bps > 0)) {
    throw new SplitError("Shares must be positive whole basis points");
  }
  const total = shares.reduce((a, s) => a + s.bps, 0);
  if (total !== 10_000) throw new SplitError(`Shares must total 100%, got ${total / 100}%`);
  const leads = shares.filter((s) => s.lead).length;
  if (leads !== 1) throw new SplitError("Exactly one share must be the lead freelancer");
}

/** Split an amount in minor units; the parts always add up to the amount exactly. */
export function allocateSplit(amountMinor: Minor, shares: readonly SplitShare[]): Allocation[] {
  assertMinor(amountMinor);
  if (amountMinor < 0) throw new SplitError("Cannot split a negative amount");
  validateSplit(shares);
  const parts = shares.map((s) => ({ payeeId: s.payeeId, amountMinor: Math.floor((amountMinor * s.bps) / 10_000) }));
  const remainder = amountMinor - parts.reduce((a, p) => a + p.amountMinor, 0);
  const leadIndex = shares.findIndex((s) => s.lead);
  parts[leadIndex].amountMinor += remainder;
  return parts;
}
