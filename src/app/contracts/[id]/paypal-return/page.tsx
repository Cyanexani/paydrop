import { Suspense } from "react";
import { PayPalReturn } from "@/components/paypal-return";

export default function PayPalReturnPage({ params }: PageProps<"/contracts/[id]/paypal-return">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Confirming with PayPal…</p>}>
      <PayPalReturn params={params} />
    </Suspense>
  );
}
