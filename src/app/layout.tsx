import type { Metadata, Viewport } from "next";
import { BootScreen } from "@/components/pwa/boot-screen";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Madrasa",
  title: {
    default: "Madrasa",
    template: "%s | Madrasa",
  },
  description: "Masjid class registration and management portal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Madrasa",
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
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

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
