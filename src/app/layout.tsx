import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { BootScreen } from "@/components/pwa/boot-screen";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import { loadTenantBrandingFromHost } from "@/lib/tenant-branding";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);

  return {
    applicationName: branding.name,
    title: {
      default: branding.name,
      template: "%s",
    },
    description: "Masjid class registration and management portal",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.shortName,
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/api/pwa/icon?size=32", sizes: "32x32", type: "image/png" },
        { url: "/api/pwa/icon?size=192", sizes: "192x192", type: "image/png" },
        { url: "/api/pwa/icon?size=512", sizes: "512x512", type: "image/png" },
      ],
      shortcut: [{ url: "/api/pwa/icon?size=32" }],
      apple: [{ url: "/api/pwa/icon?size=180&purpose=apple", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6FB7B2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistrar />
        <BootScreen />
        {children}
      </body>
    </html>
  );
}
