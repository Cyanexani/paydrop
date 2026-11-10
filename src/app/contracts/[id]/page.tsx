import { Suspense } from "react";
import { ContractScreen } from "@/components/contract-screen";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export default function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<GooBlock label="Loading contract" />}>
        <ContractScreen params={params} />
      </Suspense>
    </PageTransition>
  );
}
