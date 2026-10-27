import type { Metadata } from "next";
import "./globals.css";
import { env } from "@/lib/env";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
