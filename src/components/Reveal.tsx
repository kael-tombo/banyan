"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * Scroll-reveal wrapper: children rise gently once the element enters the
 * viewport. One IntersectionObserver reveals it; the moment is committed
 * once and never repeated (no flicker on scroll-back). The animation itself
 * lives in CSS (.reveal) and collapses to static reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Visual delay in ms, for staggering siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "nav" | "h1" | "h2" | "h3" | "p" | "ul";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Motion-disabled users get content immediately; also skip if IO is missing.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`reveal ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
