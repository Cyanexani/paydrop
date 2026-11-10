import { Suspense } from "react";
import { GooBlock } from "@/components/goo";
import { PageTransition } from "@/components/page-transition";
import { ProfileScreen } from "@/components/profile-screen";

export default function ProfilePage({ params }: PageProps<"/u/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<GooBlock label="Loading profile" />}>
        <ProfileScreen params={params} />
      </Suspense>
    </PageTransition>
  );
}
