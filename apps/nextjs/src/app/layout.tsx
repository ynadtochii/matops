import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@matops/ui";
import { ThemeProvider, ThemeToggle } from "@matops/ui/theme";
import { Toaster } from "@matops/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://turbo.t3.gg"
      : "http://localhost:3004",
  ),
  title: "matops",
  description: "Schedule, roster, and attendance for grappling academies.",
  openGraph: {
    title: "matops",
    description: "Schedule, roster, and attendance for grappling academies.",
    siteName: "matops",
  },
  twitter: {
    card: "summary_large_image",
  },
  // PWA install (ADR 42). `manifest.ts` supplies the web manifest; these add the
  // iOS home-screen bits (Safari ignores the manifest for add-to-home-screen).
  applicationName: "matops",
  appleWebApp: {
    capable: true,
    title: "matops",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  // Extend under the notch / home indicator so the installed app can honour the
  // safe-area insets in the mobile shell (see AppShell).
  viewportFit: "cover",
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <div className="absolute right-4 bottom-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
