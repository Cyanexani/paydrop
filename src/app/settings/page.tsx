import type { Metadata } from "next";
import { PageTransition } from "@/components/page-transition";
import { SettingsScreen } from "@/components/settings-screen";

export const metadata: Metadata = { title: "Settings · Paydrop" };

export default function SettingsPage() {
  return (
    <PageTransition>
      <SettingsScreen />
    </PageTransition>
  );
}
