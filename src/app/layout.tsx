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
      template: `%s | ${branding.name}`,
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
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      shortcut: [{ url: "/favicon.ico" }],
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
