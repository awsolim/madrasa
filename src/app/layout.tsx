import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { BootScreen } from "@/components/pwa/boot-screen";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import { GlobalErrorReporter } from "@/components/monitoring/global-error-reporter";
import { iconCacheVersion, loadTenantBrandingFromHost } from "@/lib/tenant-branding";
import { iosStartupImages } from "@/lib/pwa/ios-startup-images";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);
  const v = iconCacheVersion(branding.iconUrl);

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
        { url: `/api/pwa/icon?size=32&v=${v}`, sizes: "32x32", type: "image/png" },
        { url: `/api/pwa/icon?size=192&v=${v}`, sizes: "192x192", type: "image/png" },
        { url: `/api/pwa/icon?size=512&v=${v}`, sizes: "512x512", type: "image/png" },
      ],
      shortcut: [{ url: `/api/pwa/icon?size=32&v=${v}` }],
      apple: [{ url: `/api/pwa/icon?size=180&purpose=apple&v=${v}`, sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6FB7B2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);
  const iconVersion = iconCacheVersion(branding.iconUrl);

  return (
    <html lang="en">
      <head>
        {iosStartupImages.map((image) => (
          <link key={image.media} rel="apple-touch-startup-image" href={image.url} media={image.media} />
        ))}
      </head>
      <body>
        <PwaRegistrar />
        <BootScreen name={branding.shortName} iconUrl={`/api/pwa/icon?size=192&v=${iconVersion}`} />
        <GlobalErrorReporter />
        {children}
      </body>
    </html>
  );
}
