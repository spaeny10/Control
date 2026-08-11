import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BIGVIEW Control",
    template: "%s | BIGVIEW Control",
  },
  description:
    "CRM, quoting, rental and subscription management for BIGVIEW security trailers.",
  applicationName: "BIGVIEW Control",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BIGVIEW",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2b3245",
  width: "device-width",
  initialScale: 1,
  // Let the app fill the notch area when installed on iOS.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors />
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
