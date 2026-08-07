import type { Metadata } from "next";
import Script from "next/script";
import { themeScript } from "@/components/ui/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Craig",
  description: "Onboarding workflows, built once and run for every new starter.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Self-hosted and used on every page, so preload rather than let the
            CSS discover it. Latin only — latin-ext loads on demand. */}
        <link
          rel="preload"
          href="/fonts/GoogleSansFlex-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full">
        {/* Sets the theme class before first paint, so a dark-mode user never
            sees a white flash.

            next/script with beforeInteractive rather than a raw <script>: React
            refuses to execute script tags it renders on the client, and warns
            about them. This one only ever needs to run from the server-rendered
            HTML, but the warning is legitimate — Next hoists this into the
            document properly instead. */}
        <Script id="craig-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
