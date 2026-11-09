"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api } from "./api";
import { Card, ErrorNote } from "./ui";

/** PayPal sends the payer here after approving (or cancelling) a payment link. */
export function PayPalReturn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("Confirming with PayPal…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const milestone = search.get("milestone");
    const token = search.get("token");
    if (!milestone) return;
    const done = () => router.replace(`/contracts/${id}`);
    if (search.get("cancelled")) {
      api(`/api/milestones/${milestone}/abandon`, { body: {} })
        .catch(() => undefined)
        .finally(() => {
          setMessage("Payment cancelled. Nothing was charged.");
          setTimeout(done, 1500);
        });
      return;
    }
    if (!token) return;
    api(`/api/milestones/${milestone}/authorize`, { body: { orderId: token } })
      .then(() => {
        setMessage("Funded. PayPal is holding the money until the work is verified.");
        setTimeout(done, 1500);
      })
      .catch((e: Error) => setError(e.message));
  }, [id, router, search]);

  return (
    <Card className="mx-auto max-w-lg space-y-3">
      <h1 className="text-lg font-semibold">PayPal</h1>
      <p className="text-sm">{message}</p>
      <ErrorNote error={error} />
      <Link className="text-sm text-emerald-700 underline dark:text-emerald-400" href={`/contracts/${id}`}>Back to the contract</Link>
    </Card>
  );
}
