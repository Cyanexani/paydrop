import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forms";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Reset your password · Paydrop" };

export default function ForgotPasswordPage() {
  return (
    <PageTransition>
      <AuthShell
        eyebrow="Forgot your password?"
        title={<>Reset it</>}
        subtitle="Enter the email you sign in with. We'll send a one-time link to choose a new password."
        footer={<>Remembered it? <Link href="/login" className="font-semibold text-peach hover:text-butter">Back to sign in</Link></>}
      >
        <ForgotForm />
      </AuthShell>
    </PageTransition>
  );
}
