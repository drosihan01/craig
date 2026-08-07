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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
