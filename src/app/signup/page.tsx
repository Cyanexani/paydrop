import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/forms";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Create an account · MilestonePay" };

export default function SignupPage() {
  return (
    <PageTransition>
      <AuthShell
        eyebrow="Create an account"
        title={<>Get started</>}
        subtitle="Hire by the milestone, or get paid for each one you deliver. It takes a minute."
        footer={<>Already have an account? <Link href="/login" className="font-semibold text-peach hover:text-butter">Sign in</Link></>}
      >
        <Suspense fallback={<GooBlock label="Loading" />}>
          <SignupForm />
        </Suspense>
      </AuthShell>
    </PageTransition>
  );
}
