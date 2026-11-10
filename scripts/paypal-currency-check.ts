/**
 * Day 1 check from the brief: does PayPal sandbox accept INR orders?
 * Creates one tiny AUTHORIZE order in INR and one in USD and reports what PayPal says.
 * Nothing is charged: the orders are never approved and expire on their own.
 *
 *   npm run paypal:currency-check
 */
import { PayPalError, createAuthorizeOrder, paypalConfig } from "../src/lib/paypal/client";
import type { CurrencyCode } from "../src/lib/money";

async function main() {
  const cfg = paypalConfig();
  if (!cfg) {
    console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.");
    process.exit(1);
  }
  console.log(`PayPal ${cfg.env}: creating test orders…\n`);
  const results: Record<string, boolean> = {};
  for (const currency of ["INR", "USD"] as CurrencyCode[]) {
    try {
      const order = await createAuthorizeOrder({
        milestoneId: "currency-check",
        description: "Paydrop currency check (never approved)",
        amountMinor: currency === "INR" ? 100_00 : 1_00,
        currency,
        requestId: `currency-check-${currency}-${Date.now()}`,
      });
      results[currency] = true;
      console.log(`✓ ${currency}: order ${order.id} created (status ${order.status})`);
    } catch (error) {
      results[currency] = false;
      if (error instanceof PayPalError) {
        console.log(`✗ ${currency}: ${error.issue} — ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
      } else {
        console.log(`✗ ${currency}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  console.log(
    results.INR
      ? "\nINR orders are accepted. To charge in INR, set PAYPAL_CURRENCY=INR, then approve one order in the browser to confirm authorize works too."
      : "\nINR was rejected. Keep PAYPAL_CURRENCY=USD; prices still show in ₹ and convert at FX_INR_PER_USD.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
