import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";

/**
 * Inter — the landing page's modern grotesque. Loaded once at the root with a
 * CSS variable so the marketing surfaces can opt in (`.landing` in globals.css)
 * while the app interior keeps its existing stack untouched.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: "Banyan.ai — You build it. Banyan gets it out.",
    template: "%s · Banyan.ai",
  },
  description:
    "One product update becomes a complete distribution cycle — strategy, three channel-native assets, your approval, real publishing, and measured results. The product distribution OS for founders.",
  openGraph: {
    title: "Banyan.ai — You build it. Banyan gets it out.",
    description:
      "The product distribution OS for founders. One complete distribution cycle at a time — strategy, three channel-native assets, your approval, real publishing, measured results, and the next move.",
    siteName: "Banyan.ai",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
