import { PLATFORM, PlatformMark } from "./platforms";
import type { Card, Thumb } from "./content";

/**
 * One miniature window into the internet. Every card is a light sheet with a
 * hairline and a soft neutral shadow; the platform's own color appears only
 * in its mark and in the media it carries, so forty cards still read as one
 * composition.
 */

const TONES: Record<Thumb["tone"], [string, string, string]> = {
  // [from, to, ink] — two stops inside one family, plus a drawing color.
  dawn: ["#FFE3D3", "#FFC2B4", "#B4533C"],
  sea: ["#D5F0EE", "#A9DDE0", "#1F6F78"],
  moss: ["#E1EEDF", "#BFD9C2", "#2E5E45"],
  ink: ["#26303A", "#141B22", "#9FE0C0"],
  sand: ["#F6ECD9", "#EBD8B5", "#8A6326"],
  lilac: ["#ECE6FA", "#D6CBF3", "#5B4A9E"],
  sky: ["#DEEBFC", "#BBD4F6", "#2D5DA8"],
  clay: ["#F8E1DC", "#EDC1B8", "#93412F"],
};

function Motif({ motif, ink }: { motif: Thumb["motif"]; ink: string }) {
  switch (motif) {
    case "chart":
      return (
        <>
          <path d="M12 74 L40 62 L64 66 L92 44 L120 50 L148 26 L176 30" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 74 L40 62 L64 66 L92 44 L120 50 L148 26 L176 30 L176 92 L12 92 Z" fill={ink} opacity="0.12" />
          <circle cx="176" cy="30" r="4.5" fill={ink} />
        </>
      );
    case "terminal":
      return (
        <>
          <rect x="18" y="16" width="152" height="70" rx="8" fill="#0B1117" opacity="0.6" />
          <circle cx="30" cy="27" r="2.5" fill="#FF6B5E" />
          <circle cx="39" cy="27" r="2.5" fill="#F5C04A" />
          <circle cx="48" cy="27" r="2.5" fill="#57C478" />
          <rect x="30" y="40" width="64" height="5" rx="2.5" fill={ink} />
          <rect x="30" y="52" width="104" height="5" rx="2.5" fill="#fff" opacity="0.55" />
          <rect x="30" y="64" width="80" height="5" rx="2.5" fill="#fff" opacity="0.35" />
          <rect x="114" y="64" width="7" height="8" fill={ink} />
        </>
      );
    case "ui":
      return (
        <>
          <rect x="24" y="14" width="140" height="78" rx="8" fill="#fff" opacity="0.92" />
          <rect x="24" y="14" width="140" height="14" rx="8" fill={ink} opacity="0.14" />
          <rect x="36" y="38" width="56" height="7" rx="3.5" fill={ink} opacity="0.75" />
          <rect x="36" y="51" width="84" height="5" rx="2.5" fill={ink} opacity="0.25" />
          <rect x="36" y="61" width="70" height="5" rx="2.5" fill={ink} opacity="0.25" />
          <rect x="36" y="74" width="34" height="10" rx="5" fill={ink} />
          <rect x="124" y="38" width="28" height="46" rx="5" fill={ink} opacity="0.16" />
        </>
      );
    case "orbit":
      return (
        <>
          <ellipse cx="94" cy="53" rx="62" ry="22" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.5" />
          <ellipse cx="94" cy="53" rx="34" ry="34" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.35" />
          <circle cx="94" cy="53" r="13" fill={ink} />
          <circle cx="156" cy="53" r="5" fill={ink} opacity="0.8" />
          <circle cx="60" cy="27" r="4" fill={ink} opacity="0.6" />
        </>
      );
    case "type":
      return null;
    case "hills":
      return (
        <>
          <circle cx="140" cy="30" r="12" fill="#fff" opacity="0.8" />
          <path d="M0 80 Q40 46 80 70 T188 58 V106 H0Z" fill={ink} opacity="0.35" />
          <path d="M0 92 Q56 62 110 84 T188 78 V106 H0Z" fill={ink} opacity="0.6" />
        </>
      );
    case "grid":
      return (
        <>
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect key={`${r}${c}`} x={22 + c * 38} y={14 + r * 27} width="32" height="21" rx="4" fill={ink} opacity={0.12 + ((r + c) % 3) * 0.14} />
            ))
          )}
        </>
      );
    case "device":
      return (
        <>
          <rect x="70" y="8" width="48" height="90" rx="9" fill="#fff" opacity="0.9" />
          <rect x="76" y="18" width="36" height="22" rx="4" fill={ink} opacity="0.7" />
          <rect x="76" y="46" width="36" height="5" rx="2.5" fill={ink} opacity="0.3" />
          <rect x="76" y="56" width="26" height="5" rx="2.5" fill={ink} opacity="0.3" />
          <rect x="76" y="78" width="36" height="10" rx="5" fill={ink} />
        </>
      );
  }
}

export function ThumbArt({ thumb, aspect = "16/9", className = "" }: { thumb: Thumb; aspect?: string; className?: string }) {
  const [from, to, ink] = TONES[thumb.tone];
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: aspect, background: `linear-gradient(150deg, ${from}, ${to})` }}
    >
      <svg viewBox="0 0 188 106" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <Motif motif={thumb.motif} ink={ink} />
      </svg>
      {thumb.label && (
        <span
          className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[12px] font-semibold leading-4"
          style={{ background: "rgba(255,255,255,0.85)", color: thumb.tone === "ink" ? "#141B22" : ink }}
        >
          {thumb.label}
        </span>
      )}
    </div>
  );
}

const AVATAR_TONES = ["#E7EFE9", "#F4E9D6", "#E6ECF7", "#F3E4E6", "#ECE8F6", "#E3F1F0"];

function Avatar({ name }: { name: string }) {
  const clean = name.replace(/^[@#]/, "");
  const initials = clean.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const tone = AVATAR_TONES[clean.length % AVATAR_TONES.length];
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-charcoal"
      style={{ background: tone }}
    >
      {initials}
    </span>
  );
}

const SHEET = "rounded-[14px] border border-[#E6E8EA] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.10)]";
const META = "text-[12px] leading-4 text-[#6B7280]";

function Stats({ items }: { items: (string | undefined)[] }) {
  return (
    <p className={`num mt-3 flex gap-4 ${META}`}>
      {items.filter(Boolean).map((s) => (
        <span key={s}>{s}</span>
      ))}
    </p>
  );
}

export function ContentCard({ card }: { card: Card }) {
  switch (card.kind) {
    case "post":
      return (
        <article className={`${SHEET} p-4`}>
          <header className="flex items-center gap-2.5">
            <Avatar name={card.author} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-4 text-charcoal">{card.author}</p>
              <p className={`truncate ${META}`}>
                {card.handle} · {card.time}
              </p>
            </div>
            <PlatformMark platform={card.platform} size={18} />
          </header>
          <p className="mt-3 text-[13px] leading-5 text-charcoal">
            {card.body}
            {card.tags && <span className="text-[#2D5DA8]"> {card.tags.join(" ")}</span>}
          </p>
          {card.media && <ThumbArt thumb={card.media} className="mt-3 rounded-[10px]" />}
          <Stats
            items={[
              card.stats.replies && `${card.stats.replies} replies`,
              card.stats.reposts && `${card.stats.reposts} ${card.platform === "linkedin" ? "reposts" : card.platform === "facebook" ? "shares" : "reposts"}`,
              `${card.stats.likes} likes`,
            ]}
          />
        </article>
      );

    case "video":
      return (
        <article className={`${SHEET} overflow-hidden`}>
          <div className="relative">
            <ThumbArt thumb={card.thumb} />
            <span className="num absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[12px] leading-4 text-white">
              {card.duration}
            </span>
          </div>
          <div className="flex gap-2.5 p-3.5">
            <PlatformMark platform="youtube" size={18} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-5 text-charcoal">{card.title}</p>
              <p className={`mt-1 ${META}`}>
                {card.channel} · {card.views} · {card.age}
              </p>
            </div>
          </div>
        </article>
      );

    case "short":
      return (
        <article className={`${SHEET} overflow-hidden`}>
          <div className="relative">
            <ThumbArt thumb={card.thumb} aspect="4/5" />
            <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-[12px] font-medium leading-4 text-charcoal">
              <PlatformMark platform={card.platform} size={16} />
              {card.format}
            </span>
            <span className="num absolute right-2.5 top-2.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[12px] leading-4 text-white">
              {card.duration}
            </span>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-black/0 p-3 pt-10">
              <p className="text-[13px] font-medium leading-5 text-white">{card.caption}</p>
              <p className="mt-1 text-[12px] leading-4 text-white/80">
                {card.author} · {card.likes} likes
              </p>
            </div>
          </div>
        </article>
      );

    case "article":
      return (
        <article className={`${SHEET} overflow-hidden`}>
          {card.thumb && <ThumbArt thumb={card.thumb} aspect="2/1" />}
          <div className="p-4">
            <p className="flex items-center gap-2 text-[12px] font-medium leading-4 text-charcoal-soft">
              <PlatformMark platform={card.platform} size={16} />
              {card.publication}
            </p>
            <p className="mt-2.5 font-serif text-[16px] leading-[1.3] text-charcoal">{card.title}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[#4B5563]">{card.excerpt}</p>
            <p className={`mt-3 ${META}`}>
              {card.author} · {card.meta}
            </p>
          </div>
        </article>
      );

    case "thread":
      return (
        <article className={`${SHEET} p-4`}>
          <p className="flex items-center gap-2 text-[12px] font-medium leading-4 text-charcoal-soft">
            <PlatformMark platform={card.platform} size={16} />
            {card.community}
            <span className="font-normal text-[#6B7280]">· {card.time}</span>
          </p>
          {card.flair && (
            <span className="mt-2.5 inline-block rounded-md bg-[#FFF1EA] px-1.5 py-0.5 text-[12px] font-medium leading-4 text-[#B5410E]">
              {card.flair}
            </span>
          )}
          <p className="mt-2 text-[14px] font-semibold leading-5 text-charcoal">{card.title}</p>
          {card.excerpt && <p className="mt-1.5 text-[13px] leading-5 text-[#4B5563]">{card.excerpt}</p>}
          <Stats items={[card.votes, card.comments]} />
        </article>
      );

    case "email":
      return (
        <article className={`${SHEET} p-4`}>
          <header className="flex items-center gap-2.5">
            <PlatformMark platform="gmail" size={18} />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-4 text-charcoal">{card.from}</p>
            <span className={`num ${META}`}>{card.time}</span>
          </header>
          <p className="mt-3 text-[13px] font-semibold leading-5 text-charcoal">{card.subject}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#4B5563]">{card.preview}</p>
          {card.label && (
            <span className="mt-3 inline-block rounded-md bg-[#F1F3F4] px-1.5 py-0.5 text-[12px] font-medium leading-4 text-[#4B5563]">
              {card.label}
            </span>
          )}
        </article>
      );

    case "launch": {
      const [from, to, ink] = TONES[card.tone];
      return (
        <article className={`${SHEET} p-4`}>
          <header className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold"
              style={{ background: `linear-gradient(150deg, ${from}, ${to})`, color: ink }}
            >
              {card.name.replace(/^.*\//, "").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-5 text-charcoal">{card.name}</p>
              <p className="text-[13px] leading-5 text-[#4B5563]">{card.tagline}</p>
            </div>
          </header>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF0F2] pt-3">
            <span className="flex items-center gap-2 text-[12px] leading-4 text-[#6B7280]">
              <PlatformMark platform={card.platform} size={16} />
              {card.meta}
            </span>
            <span className="num shrink-0 text-right">
              <span className="block text-[15px] font-semibold leading-5" style={{ color: PLATFORM[card.platform].color }}>
                {card.metric}
              </span>
              <span className={`block ${META}`}>{card.metricLabel}</span>
            </span>
          </div>
        </article>
      );
    }

    case "board":
      return (
        <article className={`${SHEET} p-3`}>
          <div className={`grid gap-1.5 overflow-hidden rounded-[10px] ${card.tiles.length === 4 ? "grid-cols-2" : "grid-cols-[2fr_1fr]"}`}>
            {card.tiles.map((t, i) => (
              <ThumbArt
                key={i}
                thumb={t}
                aspect={card.tiles.length === 4 ? "1/1" : i === 0 ? "auto" : "3/2"}
                className={card.tiles.length === 3 && i === 0 ? "row-span-2 h-full" : ""}
              />
            ))}
          </div>
          <div className="flex items-center gap-2.5 px-1 pb-1 pt-3">
            <PlatformMark platform={card.platform} size={18} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-4 text-charcoal">{card.title}</p>
              <p className={`truncate ${META}`}>
                {card.author} · {card.saves}
              </p>
            </div>
          </div>
        </article>
      );
  }
}
