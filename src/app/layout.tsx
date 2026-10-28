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
    default: "Banyan.ai — Build. Distribute. Grow.",
    template: "%s · Banyan.ai",
  },
  description:
    "Banyan.ai coordinates AI-powered research, content creation, publishing, and learning into one distribution workflow — helping founders reach the people who need their products.",
  openGraph: {
    title: "Banyan.ai — Build. Distribute. Grow.",
    description:
      "The Agentic Operating System for Product Distribution. Build your product. Let it find its people.",
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
