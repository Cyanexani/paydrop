import { Suspense } from "react";
import { ContractScreen } from "@/components/contract-screen";

export default function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <ContractScreen params={params} />
    </Suspense>
  );
}
