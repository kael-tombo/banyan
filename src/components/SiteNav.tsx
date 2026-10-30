"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BanyanMark } from "@/components/BanyanMark";

const links = [
  { href: "/#problem", label: "Why Banyan" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#result", label: "The result" },
  { href: "/#trust", label: "Trust" },
];

/**
 * The site nav passes through two tones on the landing page.
 *
 * `variant="night"` (the descent): the page opens on the night stage — hero
 * plus marquee — and returns to night for the closing act (dusk CTA plus
 * footer). Every element of either night world is marked
 * `data-night-stage`; the nav floats transparent with light ink while the
 * probe point sits inside any of them, and settles into the daylight glass
 * across the day sections between. Positions are measured from the actual
 * stage elements, not magic scroll offsets.
 *
 * `variant="day"` (default, everywhere else): today's light glass from the
 * first paint. */
export function SiteNav({
  cta = "Run a cycle",
  ctaHref = "/signup",
  variant = "day",
}: {
  cta?: string;
  ctaHref?: string;
  variant?: "day" | "night";
}) {
  const [open, setOpen] = useState(false);
  // Night variant only: is the header currently over a night stage?
  const [nightTone, setNightTone] = useState(variant === "night");
  const stageRanges = useRef<{ top: number; bottom: number }[]>([]);

  useEffect(() => {
    if (variant !== "night") return;
    let raf = 0;
    const measure = () => {
      const ranges: { top: number; bottom: number }[] = [];
      document.querySelectorAll("[data-night-stage]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        ranges.push({ top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY });
      });
      // Transitional stages (the dusk grove): night begins partway down,
      // where the gradient has actually gone dark.
      document.querySelectorAll("[data-night-stage-partial]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        ranges.push({
          top: rect.top + window.scrollY + rect.height * 0.55,
          bottom: rect.bottom + window.scrollY,
        });
      });
      stageRanges.current = ranges;
      update();
    };
    const update = () => {
      // A point inside the header band decides the tone — the nav reflects
      // what is actually behind it.
      const probe = window.scrollY + 32;
      setNightTone(stageRanges.current.some((r) => probe >= r.top && probe <= r.bottom));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    measure();
    // Layout settles once fonts and the hero canvas load — re-measure.
    const t = window.setTimeout(measure, 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [variant]);

  const night = variant === "night" && nightTone;

  return (
    <header
      className={`site-nav-night sticky top-0 z-40 ${
        night ? "border-b border-transparent" : "border-b border-bark/10"
      }`}
      style={
        night
          ? // A scrim that fades downward: readable when content scrolls
            // beneath the transparent nav, invisible over the dark stage.
            { background: "linear-gradient(180deg, rgba(7,17,13,0.72), rgba(7,17,13,0))" }
          : { background: "rgba(255, 255, 255, 0.72)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)" }
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Banyan.ai home">
          <BanyanMark size={28} variant={night ? "white" : "color"} />
          <span
            className={`text-lg font-semibold tracking-tight ${
              night ? "text-[#F2F8F3]" : "text-forest-deep"
            }`}
          >
            Banyan<span className={night ? "text-[#7BE7A5]" : "text-moss"}>.ai</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                night
                  ? "text-[#A9C3B2] hover:bg-white/5 hover:text-[#F2F8F3]"
                  : "text-charcoal-soft hover:bg-forest/5 hover:text-forest-deep"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              night
                ? "text-[#A9C3B2] hover:bg-white/5 hover:text-[#F2F8F3]"
                : "text-charcoal-soft hover:bg-forest/5 hover:text-forest-deep"
            }`}
          >
            Sign in
          </Link>
          <Link
            href={ctaHref}
            className={`ml-2 rounded-full px-4.5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px ${
              night
                ? "bg-[#2FA36B] shadow-[0_8px_24px_-10px_rgba(53,184,117,0.7)] hover:bg-[#37B878]"
                : "bg-forest-deep shadow-[0_8px_20px_-10px_rgba(18,48,40,0.6)] hover:bg-forest"
            }`}
          >
            {cta}
          </Link>
        </nav>

        <button
          className={`rounded-full p-2 transition-colors md:hidden ${
            night ? "text-[#F2F8F3] hover:bg-white/10" : "text-forest-deep hover:bg-forest/5"
          }`}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav
          className={`border-t px-4 py-3 md:hidden ${
            night ? "border-white/10 bg-[#0b1c13]/95 backdrop-blur" : "border-bark/10 bg-white/95 backdrop-blur"
          }`}
          aria-label="Mobile"
        >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  night ? "text-[#DCEDE1] hover:bg-white/5" : "text-charcoal transition-colors hover:bg-forest/5"
                }`}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                night ? "text-[#DCEDE1] hover:bg-white/5" : "text-charcoal transition-colors hover:bg-forest/5"
              }`}
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href={ctaHref}
              className={`mt-1 rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white ${
                night ? "bg-[#2FA36B]" : "bg-forest-deep"
              }`}
              onClick={() => setOpen(false)}
            >
              {cta}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
