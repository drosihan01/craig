import type { Metadata } from "next";
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
