"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BanyanMark } from "@/components/BanyanMark";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#philosophy", label: "Philosophy" },
];

export function SiteNav({ cta = "Start distributing", ctaHref = "/signup" }: { cta?: string; ctaHref?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-40 border-b border-bark/10"
      style={{ background: "rgba(255, 255, 255, 0.72)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)" }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Banyan.ai home">
          <BanyanMark size={28} />
          <span className="text-lg font-semibold tracking-tight text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-charcoal-soft transition-colors hover:bg-forest/5 hover:text-forest-deep"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-charcoal-soft transition-colors hover:bg-forest/5 hover:text-forest-deep"
          >
            Sign in
          </Link>
          <Link
            href={ctaHref}
            className="ml-2 rounded-full bg-forest-deep px-4.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(18,48,40,0.6)] transition-all duration-200 hover:-translate-y-px hover:bg-forest"
          >
            {cta}
          </Link>
        </nav>

        <button
          className="rounded-full p-2 text-forest-deep transition-colors hover:bg-forest/5 md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-bark/10 bg-white/95 px-4 py-3 backdrop-blur md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-xl px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-forest/5" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="rounded-xl px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-forest/5" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href={ctaHref} className="mt-1 rounded-full bg-forest-deep px-4 py-2.5 text-center text-sm font-semibold text-white" onClick={() => setOpen(false)}>
              {cta}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
