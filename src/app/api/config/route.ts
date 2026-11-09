import { connection } from "next/server";
import { chargeCurrency, inrPerUsd } from "@/lib/fx";
import { paypalConfig } from "@/lib/paypal/client";
import { route } from "@/server/http";

/** Public, non-secret settings the browser needs (the PayPal client id is public by design). */
export const GET = route(async () => {
  await connection(); // read env at request time, not at build time
  const paypal = paypalConfig();
  const aiMode =
    process.env.AI_MODE === "mock" || (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && process.env.AI_MODE !== "claude")
      ? "mock"
      : "claude";
  return {
    paypalClientId: paypal?.clientId ?? null,
    paypalEnv: paypal?.env ?? null,
    chargeCurrency: chargeCurrency(),
    inrPerUsd: inrPerUsd(),
    aiMode,
  };
});
