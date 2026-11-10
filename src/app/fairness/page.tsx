import { FairnessGrid } from "@/components/grid/fairness-grid";
import { PageTransition } from "@/components/page-transition";

export default function FairnessPage() {
  return (
    <PageTransition>
      <FairnessGrid />
    </PageTransition>
  );
}
