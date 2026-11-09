import type { CurrencyCode, Minor } from "@/lib/money";

/**
 * Prices are set in INR. PayPal's REST currency list does not include INR, so the charge
 * currency is configurable: PAYPAL_CURRENCY=INR (if the sandbox accepts it) or USD,
 * converted at a fixed FX_INR_PER_USD rate that is locked into each contract at signing.
 */
export function chargeCurrency(): CurrencyCode {
  return process.env.PAYPAL_CURRENCY === "INR" ? "INR" : "USD";
}

export function inrPerUsd(): number {
  const rate = Number(process.env.FX_INR_PER_USD ?? "84");
  if (!(rate > 0)) throw new RangeError("FX_INR_PER_USD must be a positive number");
  return rate;
}

export function toChargeMinor(inrMinor: Minor, currency: CurrencyCode, rate: number): Minor {
  if (currency === "INR") return inrMinor;
  return Math.round(inrMinor / rate);
}
