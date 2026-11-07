import type { MetadataRoute } from "next";

/**
 * Web app manifest (mobile vision M0, docs/vision/WEB_AND_MOBILE.md): Banyan can
 * be added to a phone's home screen and opens straight into the app, without
 * browser chrome. There is no service worker yet, so nothing works offline and
 * nothing claims to; push notifications are milestone M2.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Banyan.ai",
    short_name: "Banyan",
    description: "Approve, pause and follow your product's distribution cycles.",
    id: "/app",
    start_url: "/app/approvals",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f5",
    theme_color: "#0e2a21",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Approvals", url: "/app/approvals", description: "Drafts and decisions waiting for you" },
      { name: "All products", url: "/app/organization", description: "Every product's cycle at a glance" },
      { name: "Activity", url: "/app/activity", description: "What the agents and publishing did" },
    ],
  };
}
