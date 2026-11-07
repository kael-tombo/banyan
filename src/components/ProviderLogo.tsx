import type { ProviderId } from "@/lib/auth/oauth/providers";

/**
 * Sign-in provider marks, drawn bare on a 24px grid in each brand's own
 * colour so they read as the familiar buttons people expect on a sign-in page.
 */
export function ProviderLogo({ provider, size = 18 }: { provider: ProviderId; size?: number }) {
  const common = { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": true as const, className: "shrink-0" };
  switch (provider) {
    case "google":
      return (
        <svg {...common}>
          <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1a11 11 0 0 0 0 9.8L5.8 14z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.6 3.3-4.6 6.2-4.6z" />
        </svg>
      );
    case "microsoft":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
          <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
          <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
          <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
        </svg>
      );
    case "github":
      return (
        <svg {...common} fill="#1F2328">
          <path d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.7.6-3.3-1.2-3.3-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.6-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.5 1 2.6 0 3.8-2.3 4.6-4.5 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="4" fill="#0A66C2" />
          <path fill="#fff" d="M7.2 9.4H4.6V19h2.6V9.4zM5.9 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19.4 13.4c0-2.6-.6-4.2-3.4-4.2-1.4 0-2.3.7-2.6 1.4V9.4h-2.5V19h2.6v-4.8c0-1.3.3-2.5 1.8-2.5s1.5 1.4 1.5 2.6V19h2.6v-5.6z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="11" fill="#1877F2" />
          <path fill="#fff" d="M13.4 23v-7.6h2.5l.4-2.9h-2.9v-1.9c0-.8.3-1.4 1.4-1.4h1.6V6.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.1H8v2.9h2.4V23h3z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="#111111">
          <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
        </svg>
      );
  }
}
