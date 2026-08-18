"use client";

import { useRouter } from "next/navigation";
import { ChildrenManager } from "@/components/data/children-manager";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { FlatButton } from "@/components/ui/flat-button";

export function FamilyOnboardingPage({ slug, returnTo }: { slug: string; returnTo?: string }) {
  const router = useRouter();

  function continueOnward() {
    router.push(returnTo ?? `/m/${slug}/portal`);
  }

  return (
    <main className="min-h-screen bg-white">
      <PageTitleBar title="Set Up Your Family" subtitle="Add your children now, or skip and do this later." tone="teal" />
      <div className="relative z-10 min-h-[calc(100vh-260px)]" style={{ marginTop: "-172px" }}>
        <div className="min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px] bg-[var(--workspace)]">
          <section className="space-y-6 bg-white p-4 md:p-6">
            <ChildrenManager slug={slug} />
            <FlatButton type="button" variant="primary" className="w-full" onClick={continueOnward}>
              Continue to Portal
            </FlatButton>
          </section>
        </div>
      </div>
    </main>
  );
}
