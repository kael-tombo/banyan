/** Banyan tree / network brand mark. Aerial-roots motif: canopy + descending roots. */
export function BanyanMark({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15" className="fill-forest" />
      {/* canopy */}
      <ellipse cx="16" cy="10" rx="8" ry="4.5" className="fill-ivory" />
      <ellipse cx="12.5" cy="8.5" rx="4.5" ry="2.6" className="fill-moss" />
      <ellipse cx="19.5" cy="9" rx="3.6" ry="2.2" className="fill-sage" />
      {/* trunk + aerial roots network */}
      <rect x="14.9" y="13" width="2.2" height="10" rx="1" className="fill-ivory" />
      <path d="M16 15 C 12 16.5, 9.5 18.5, 8.5 22.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="stroke-ivory/80" />
      <path d="M16 16.5 C 19.5 17.5, 22.5 19.5, 23.5 23" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="stroke-ivory/80" />
      <path d="M16 18 C 14 20, 13.5 22.5, 13.8 25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="stroke-sage/80" />
      <path d="M16 18.5 C 18 20.5, 18.5 23, 18.2 25.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="stroke-sage/80" />
      {/* network nodes */}
      <circle cx="8.5" cy="22.5" r="1.3" className="fill-ivory" />
      <circle cx="23.5" cy="23" r="1.3" className="fill-ivory" />
      <circle cx="13.8" cy="25" r="1.1" className="fill-sage" />
      <circle cx="18.2" cy="25.5" r="1.1" className="fill-sage" />
      <circle cx="16" cy="14.02" r="1.2" className="fill-sage" />
    </svg>
  );
}
