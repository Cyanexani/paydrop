import { LedgerGrid } from "@/components/grid/ledger-grid";
import { PageTransition } from "@/components/page-transition";

export default function LedgerPage() {
  return (
    <PageTransition>
      <LedgerGrid />
    </PageTransition>
  );
}
