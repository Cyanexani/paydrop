import { Suspense } from "react";
import { DisputePack } from "@/components/contract/dispute-pack";
import { GooBlock } from "@/components/goo";

export default function DisputePackPage({ params }: PageProps<"/contracts/[id]/dispute-pack">) {
  return (
    <Suspense fallback={<GooBlock />}>
      <DisputePack params={params} />
    </Suspense>
  );
}
