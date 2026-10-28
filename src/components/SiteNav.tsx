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
      style={{ background: "rgba(255, 255, 255, 0.82)", backdropFilter: "blur(10px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Banyan.ai home">
          <BanyanMark size={26} />
          <span className="font-serif text-lg font-semibold text-forest-deep">Banyan<span className="text-moss">.ai</span></span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-charcoal-soft hover:text-forest-deep">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm font-medium text-charcoal-soft hover:text-forest-deep">
            Sign in
          </Link>
          <Link
            href={ctaHref}
            className="rounded-[4px] bg-forest-deep px-3.5 py-2 text-sm font-medium text-ivory shadow-[0_6px_16px_-8px_rgba(18,48,40,0.5)] transition-all duration-200 hover:-translate-y-px hover:bg-forest"
          >
            {cta}
          </Link>
        </nav>

        <button
          className="rounded-[4px] p-2 text-forest-deep md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-bark/10 bg-white px-4 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-[4px] px-2 py-2 text-sm font-medium text-charcoal hover:bg-forest/5" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="rounded-[4px] px-2 py-2 text-sm font-medium text-charcoal hover:bg-forest/5" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href={ctaHref} className="mt-1 rounded-[4px] bg-forest-deep px-3 py-2 text-center text-sm font-medium text-ivory" onClick={() => setOpen(false)}>
              {cta}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
