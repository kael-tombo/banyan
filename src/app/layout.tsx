import type { Metadata, Viewport } from "next";
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
    default: "Banyan.ai — The autonomous, agentic distribution operating system",
    template: "%s · Banyan.ai",
  },
  description:
    "Banyan is an autonomous, agentic distribution operating system. Its agents run a complete distribution cycle for your product end to end: research, strategy, content, publishing and measurement. Nothing goes out without your approval.",
  openGraph: {
    title: "Banyan.ai — The autonomous, agentic distribution operating system",
    description:
      "An autonomous, agentic distribution operating system for founders. Agents run research, strategy, content, publishing and measurement end to end, one approved cycle at a time.",
    siteName: "Banyan.ai",
    type: "website",
  },
};

/** Phone browsers tint their chrome with the canopy green; installed, the app opens full screen. */
export const viewport: Viewport = {
  themeColor: "#0e2a21",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
