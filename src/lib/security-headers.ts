/**
 * HTTP security headers (BOS-065 / US-066). Pure so it can be unit-tested and
 * used from next.config.ts.
 *
 * Framing: production allows no one to frame Banyan (clickjacking). Development
 * leaves framing open because Ship Studio previews the app inside an iframe.
 * HSTS is production-only (it would pin localhost to https otherwise).
 */
export type Header = { key: string; value: string };

export function securityHeaders(production: boolean): Header[] {
  const always: Header[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  if (!production) return always;
  return [
    ...always,
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}
