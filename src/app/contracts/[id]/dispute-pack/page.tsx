import { Suspense } from "react";
import { DisputePack } from "@/components/contract/dispute-pack";

export default function DisputePackPage({ params }: PageProps<"/contracts/[id]/dispute-pack">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <DisputePack params={params} />
    </Suspense>
  );
}
