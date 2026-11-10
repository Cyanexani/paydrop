import { Suspense } from "react";
import { DisputePack } from "@/components/contract/dispute-pack";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export default function DisputePackPage({ params }: PageProps<"/contracts/[id]/dispute-pack">) {
  return (
    <PageTransition>
      <Suspense fallback={<GooBlock />}>
        <DisputePack params={params} />
      </Suspense>
    </PageTransition>
  );
}
