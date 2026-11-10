import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/forms";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Choose a new password · MilestonePay", referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return (
    <PageTransition>
      <AuthShell
        eyebrow="Reset password"
        title={<>New password</>}
        subtitle="Choose a new password. This signs you out on every other device."
        footer={<Link href="/login" className="font-semibold text-peach hover:text-butter">Back to sign in</Link>}
      >
        <Suspense fallback={<GooBlock label="Loading" />}>
          <ResetForm />
        </Suspense>
      </AuthShell>
    </PageTransition>
  );
}
