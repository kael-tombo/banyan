/**
 * Platform marks for the distribution landscape.
 *
 * Simplified, flat glyphs on each platform's own color: recognizable at a
 * glance, drawn here so the page needs no icon dependency and every mark
 * shares one geometry (24px grid, solid fills). These are visual references
 * to places products get discovered, not claims of an active integration —
 * the page states what Banyan actually connects today elsewhere.
 */

export type Platform =
  | "facebook" | "instagram" | "youtube" | "tiktok" | "x" | "linkedin" | "reddit" | "threads"
  | "pinterest" | "medium" | "quora" | "discord" | "telegram" | "whatsapp" | "gmail"
  | "producthunt" | "github" | "substack" | "blog";

export const PLATFORM: Record<Platform, { name: string; color: string }> = {
  facebook: { name: "Facebook", color: "#1877F2" },
  instagram: { name: "Instagram", color: "#E1306C" },
  youtube: { name: "YouTube", color: "#FF0033" },
  tiktok: { name: "TikTok", color: "#111111" },
  x: { name: "X", color: "#111111" },
  linkedin: { name: "LinkedIn", color: "#0A66C2" },
  reddit: { name: "Reddit", color: "#FF4500" },
  threads: { name: "Threads", color: "#111111" },
  pinterest: { name: "Pinterest", color: "#E60023" },
  medium: { name: "Medium", color: "#111111" },
  quora: { name: "Quora", color: "#B92B27" },
  discord: { name: "Discord", color: "#5865F2" },
  telegram: { name: "Telegram", color: "#229ED9" },
  whatsapp: { name: "WhatsApp", color: "#25D366" },
  gmail: { name: "Gmail", color: "#EA4335" },
  producthunt: { name: "Product Hunt", color: "#DA552F" },
  github: { name: "GitHub", color: "#1F2328" },
  substack: { name: "Substack", color: "#FF6719" },
  blog: { name: "Blog", color: "#23523F" },
};

/** White glyph, drawn on a 24×24 grid. */
function Glyph({ platform }: { platform: Platform }) {
  switch (platform) {
    case "facebook":
      return <path d="M13.4 21v-7.3h2.5l.4-2.9h-2.9V9c0-.8.3-1.4 1.4-1.4h1.6V5.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2H8v2.9h2.4V21h3z" />;
    case "instagram":
      return (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.4" fill="none" stroke="#fff" strokeWidth="1.9" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.9" />
          <circle cx="16.4" cy="7.6" r="1.1" />
        </>
      );
    case "youtube":
      return <path d="M10 8.6v6.8l5.6-3.4L10 8.6z" />;
    case "tiktok":
      return <path d="M14.6 4h-2.7v10.6a2.3 2.3 0 1 1-2.3-2.3c.2 0 .4 0 .6.1V9.6a5 5 0 1 0 4.4 5V9.3a6 6 0 0 0 3.4 1.1V7.7c-1.9 0-3.4-1.6-3.4-3.7z" />;
    case "x":
      return <path d="M16.9 4.5h2.5l-5.5 6.3 6.4 8.7h-5l-3.9-5.2-4.5 5.2H4.4l5.9-6.8-6.1-8.2h5.1l3.6 4.8 4-4.8zm-.9 13.5h1.4L8.1 5.9H6.6L16 18z" />;
    case "linkedin":
      return <path d="M7.2 9.4H4.6V19h2.6V9.4zM5.9 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19.4 13.4c0-2.6-.6-4.2-3.4-4.2-1.4 0-2.3.7-2.6 1.4V9.4h-2.5V19h2.6v-4.8c0-1.3.3-2.5 1.8-2.5s1.5 1.4 1.5 2.6V19h2.6v-5.6z" />;
    case "reddit":
      return (
        <>
          <ellipse cx="12" cy="13.6" rx="6.4" ry="4.6" />
          <circle cx="17.6" cy="9.6" r="1.6" />
          <circle cx="6.4" cy="9.6" r="1.6" />
          <circle cx="15.4" cy="5.4" r="1.3" />
          <path d="M12 9V5.6l3.3.7" fill="none" stroke="#fff" strokeWidth="1.2" />
          <circle cx="9.6" cy="13.2" r="1" fill="#FF4500" />
          <circle cx="14.4" cy="13.2" r="1" fill="#FF4500" />
        </>
      );
    case "threads":
      return (
        <path
          d="M15.6 11.3c-.4-2-1.8-3-3.7-3-1.4 0-2.5.6-3.1 1.6l1.4.9c.4-.6 1-.9 1.7-.9 1 0 1.6.5 1.8 1.4a8 8 0 0 0-1.9-.1c-2 .1-3.3 1.3-3.2 2.9.1 1.6 1.5 2.6 3.2 2.5 2.1-.1 3.2-1.6 3.4-3.7.6.4 1 1 1.2 1.6.4 1.1.3 2.8-1 4.1-1.2 1.1-2.6 1.6-4.6 1.6-2.2 0-3.9-.7-5-2.1-1-1.3-1.6-3.1-1.6-5.4 0-2.3.5-4.1 1.6-5.4C6.9 6 8.6 5.3 10.8 5.3c2.2 0 3.9.7 5 2.1.5.7.9 1.5 1.2 2.4l1.6-.4c-.3-1.1-.8-2.1-1.5-3-1.4-1.8-3.5-2.7-6.3-2.7-2.7 0-4.8.9-6.2 2.7C3.4 8 2.7 10.2 2.7 13s.7 5 2 6.6c1.4 1.8 3.5 2.7 6.2 2.7 2.4 0 4.1-.6 5.6-2 1.9-1.9 1.9-4.3 1.3-5.8-.4-1.2-1.2-2.1-2.2-2.7v-.5zm-3.7 3.9c-.9 0-1.6-.4-1.6-1.1 0-.5.4-1.2 1.8-1.3h.5c.5 0 1 0 1.4.1-.2 1.8-1.1 2.3-2.1 2.3z"
          transform="translate(1.4 -1.2) scale(0.92)"
        />
      );
    case "pinterest":
      return <path d="M12.3 4C8 4 5.6 6.9 5.6 10c0 1.5.8 3.3 2 3.9.2.1.3 0 .3-.1l.3-1.2c0-.1 0-.2-.1-.3-.4-.5-.7-1.3-.7-2.1 0-2.1 1.6-4.1 4.3-4.1 2.3 0 4 1.6 4 3.9 0 2.6-1.3 4.4-3 4.4-.9 0-1.6-.8-1.4-1.7.3-1.1.8-2.4.8-3.2 0-.7-.4-1.4-1.2-1.4-1 0-1.7 1-1.7 2.3 0 .8.3 1.4.3 1.4l-1.1 4.7c-.3 1.3 0 3.2.1 3.4 0 .1.2.1.2 0 .1-.2 1.3-1.9 1.6-3.1l.6-2.3c.3.6 1.3 1.1 2.3 1.1 3 0 5.1-2.7 5.1-6.1C18.4 6.5 15.9 4 12.3 4z" />;
    case "medium":
      return (
        <>
          <ellipse cx="7.6" cy="12" rx="4.2" ry="4.4" />
          <ellipse cx="15.2" cy="12" rx="2.1" ry="4.1" />
          <ellipse cx="19.2" cy="12" rx="0.8" ry="3.7" />
        </>
      );
    case "quora":
      return <path d="M12.1 4.5a6.9 6.9 0 0 0-1 13.8c.4.8 1.2 1.7 2.6 1.7 1.6 0 2.4-1 2.6-2.3h-1.1c-.1.5-.4.9-1 .9-.6 0-1-.4-1.3-1A6.9 6.9 0 0 0 12.1 4.5zm0 11.9c-.3 0-.6 0-.9-.1-.5-1-1.2-1.9-2.6-1.9-.5 0-1 .1-1.3.4l.4.8c.2-.1.4-.1.6-.1.7 0 1.1.5 1.5 1.1A4.9 4.9 0 0 1 12.1 6.5a4.9 4.9 0 0 1 0 9.9z" />;
    case "discord":
      return <path d="M18.2 6.6A14 14 0 0 0 14.8 5.5l-.4.9a13 13 0 0 0-4.8 0l-.4-.9a14 14 0 0 0-3.4 1.1C3.6 9.9 3 13.1 3.3 16.2a14 14 0 0 0 4.2 2.1l.9-1.4c-.5-.2-1-.4-1.4-.7l.3-.3a10 10 0 0 0 9.4 0l.3.3c-.5.3-.9.5-1.4.7l.9 1.4a14 14 0 0 0 4.2-2.1c.4-3.6-.6-6.8-2.5-9.6zM9.3 14.3c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7zm5.4 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7z" />;
    case "telegram":
      return <path d="M19.7 5.2 3.9 11.3c-1.1.4-1.1 1 0 1.3l4 1.3 1.6 4.8c.2.5.1.7.6.7.4 0 .6-.2.8-.4l1.9-1.9 4 3c.7.4 1.3.2 1.4-.7l2.6-12.4c.3-1.1-.4-1.6-1.1-1.3zm-2.4 2.9-7.2 6.5-.3 3-1.4-4.4 8.4-5.3c.4-.2.7.1.5.2z" />;
    case "whatsapp":
      return (
        <>
          <path d="M12 4a8 8 0 0 0-6.9 12l-1.1 4 4.1-1.1A8 8 0 1 0 12 4z" fill="none" stroke="#fff" strokeWidth="1.8" />
          <path d="M9.4 8.6c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.8 2.2.8 2.6.7 3.1.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.3-1.6-.8c-.2-.1-.4-.1-.6.1l-.7.9c-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.7-1.8c-.2-.5-.4-.4-.6-.4h-.5z" />
        </>
      );
    case "gmail":
      return <path d="M4 7.2V17c0 .6.4 1 1 1h2.4v-6.3L12 15l4.6-3.3V18H19c.6 0 1-.4 1-1V7.2c0-1-1.1-1.5-1.9-1L12 10.5 5.9 6.2C5.1 5.7 4 6.2 4 7.2z" />;
    case "producthunt":
      return <path d="M10.2 12.6h2.6a1.7 1.7 0 0 0 0-3.4h-2.6v3.4zM8 6.9h4.8a3.9 3.9 0 0 1 0 7.9h-2.6V18H8V6.9z" />;
    case "github":
      return <path d="M12 3.8a8.2 8.2 0 0 0-2.6 16c.4.1.6-.2.6-.4v-1.5c-2.3.5-2.8-1-2.8-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.3.9 1.3.9.7 1.3 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4.1 0-.9.3-1.6.9-2.2-.1-.2-.4-1.1.1-2.2 0 0 .7-.2 2.3.8a7.8 7.8 0 0 1 4.1 0c1.6-1.1 2.3-.8 2.3-.8.5 1.1.2 2 .1 2.2.5.6.9 1.3.9 2.2 0 3.2-1.9 3.9-3.7 4.1.3.3.6.8.6 1.5v2.2c0 .2.2.5.6.4A8.2 8.2 0 0 0 12 3.8z" />;
    case "substack":
      return (
        <>
          <rect x="6" y="5.5" width="12" height="1.8" />
          <rect x="6" y="8.8" width="12" height="1.8" />
          <path d="M6 12.2h12v7.3l-6-3.4-6 3.4z" />
        </>
      );
    case "blog":
      return <path d="M6 5h9l3 3v11H6zM8.5 10.5h7M8.5 13.5h7M8.5 16.5h4.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />;
  }
}

export function PlatformMark({
  platform,
  size = 20,
  className = "",
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  const { color, name } = PLATFORM[platform];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={name}
      fill="#fff"
    >
      <rect width="24" height="24" rx={platform === "producthunt" ? 12 : 6} fill={color} />
      <Glyph platform={platform} />
    </svg>
  );
}
