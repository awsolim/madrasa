import { PublicAreaGate } from "@/components/auth/public-area-gate";

// Shared public navigation for both direct class links and class browsing.
// Applying still uses its existing authenticated workflow and server checks.
export function ProgramPreviewShell({ children, slug, mosqueName, mosqueLogoUrl }: {
  children: React.ReactNode; slug: string; mosqueName: string; mosqueLogoUrl: string;
}) {
  return <PublicAreaGate slug={slug} mosqueName={mosqueName} mosqueLogoUrl={mosqueLogoUrl}>{children}</PublicAreaGate>;
}
