import type { Metadata } from "next";
import { Suspense } from "react";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";
import { VerifyEmail } from "@/components/verify-email";

export const metadata: Metadata = { title: "Verify your email · Paydrop" };

export default function VerifyEmailPage() {
  return (
    <PageTransition>
      <Suspense fallback={<GooBlock label="Checking your link" />}>
        <VerifyEmail />
      </Suspense>
    </PageTransition>
  );
}
