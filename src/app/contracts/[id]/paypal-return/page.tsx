import { Suspense } from "react";
import { PayPalReturn } from "@/components/paypal-return";
import { GooBlock } from "@/components/goo";

export default function PayPalReturnPage({ params }: PageProps<"/contracts/[id]/paypal-return">) {
  return (
    <Suspense fallback={<GooBlock label="Confirming with PayPal" />}>
      <PayPalReturn params={params} />
    </Suspense>
  );
}
