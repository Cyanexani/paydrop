/**
 * Money is always an integer number of minor units (paise for INR, cents for USD).
 * Floating-point rupees never cross a module boundary; that is how milestone prices
 * always add up to the contract total exactly.
 */
export type Minor = number;

export const CURRENCIES = ["INR", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export function assertMinor(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of minor units, got ${value}`);
  }
}

/** Round a (possibly fractional) minor-unit value to the nearest multiple of `step`. */
export function roundToStep(value: number, step: Minor): Minor {
  // Float noise such as 435000 * 1.1 = 478500.00000000006 disappears here.
  return Math.round(value / step) * step;
}

/** Round up to the next multiple of `step`. */
export function ceilToStep(value: number, step: Minor): Minor {
  return Math.ceil(value / step - 1e-9) * step;
}

export function majorToMinor(major: number): Minor {
  return Math.round(major * 100);
}

/** "8360.00" — the decimal string PayPal expects in `amount.value`. */
export function minorToDecimalString(minor: Minor): string {
  assertMinor(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(minor: Minor, currency: CurrencyCode = "INR"): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
