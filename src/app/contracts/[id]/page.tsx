import { Suspense } from "react";
import { ContractScreen } from "@/components/contract-screen";
import { GooBlock } from "@/components/goo";

export default function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  return (
    <Suspense fallback={<GooBlock label="Loading contract" />}>
      <ContractScreen params={params} />
    </Suspense>
  );
}
