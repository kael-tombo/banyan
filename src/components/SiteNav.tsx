"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#philosophy", label: "Philosophy" },
];

export function SiteNav({ cta = "Start distributing", ctaHref = "/signup" }: { cta?: string; ctaHref?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-forest/10 bg-ivory/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="Banyan.ai home">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="15" className="fill-forest" />
            <ellipse cx="16" cy="10" rx="8" ry="4.5" className="fill-ivory" />
            <ellipse cx="12.5" cy="8.5" rx="4.5" ry="2.6" className="fill-moss" />
            <ellipse cx="19.5" cy="9" rx="3.6" ry="2.2" className="fill-sage" />
            <rect x="14.9" y="13" width="2.2" height="10" rx="1" className="fill-ivory" />
            <path d="M16 15 C 12 16.5, 9.5 18.5, 8.5 22.5" stroke="#faf7f0" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
            <path d="M16 16.5 C 19.5 17.5, 22.5 19.5, 23.5 23" stroke="#faf7f0" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
            <path d="M16 18 C 14 20, 13.5 22.5, 13.8 25" stroke="#cfe0d4" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
            <path d="M16 18.5 C 18 20.5, 18.5 23, 18.2 25.5" stroke="#cfe0d4" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
          </svg>
          <span className="font-serif text-lg font-semibold text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-charcoal-soft hover:text-forest-deep">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm font-medium text-charcoal-soft hover:text-forest-deep">
            Sign in
          </Link>
          <Link href={ctaHref} className="rounded-md bg-forest px-3.5 py-2 text-sm font-medium text-ivory shadow-sm hover:bg-forest-deep">
            {cta}
          </Link>
        </nav>

        <button
          className="rounded-md p-2 text-forest-deep md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-forest/10 bg-ivory px-4 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-2 py-2 text-sm font-medium text-charcoal hover:bg-forest/5" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="rounded-md px-2 py-2 text-sm font-medium text-charcoal hover:bg-forest/5" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href={ctaHref} className="mt-1 rounded-md bg-forest px-3 py-2 text-center text-sm font-medium text-ivory" onClick={() => setOpen(false)}>
              {cta}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
