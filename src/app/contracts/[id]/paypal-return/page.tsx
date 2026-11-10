import { Suspense } from "react";
import { PayPalReturn } from "@/components/paypal-return";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export default function PayPalReturnPage({ params }: PageProps<"/contracts/[id]/paypal-return">) {
  return (
    <PageTransition>
      <Suspense fallback={<GooBlock label="Confirming with PayPal" />}>
        <PayPalReturn params={params} />
      </Suspense>
    </PageTransition>
  );
}
