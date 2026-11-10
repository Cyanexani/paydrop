import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Sign in · Paydrop" };

export default function LoginPage() {
  return (
    <PageTransition>
      <AuthShell
        eyebrow="Welcome back"
        title={<>Sign in</>}
        subtitle="Pick up where you left off: your milestones, money held at PayPal and payouts."
        footer={<>New to Paydrop? <Link href="/signup" className="font-semibold text-peach hover:text-butter">Create an account</Link></>}
      >
        <Suspense fallback={<GooBlock label="Loading" />}>
          <LoginForm />
        </Suspense>
      </AuthShell>
    </PageTransition>
  );
}
