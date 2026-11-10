import { ContractList } from "@/components/contract-list";
import { PageTransition } from "@/components/page-transition";

export default function ContractsPage() {
  return (
    <PageTransition>
      <ContractList />
    </PageTransition>
  );
}
