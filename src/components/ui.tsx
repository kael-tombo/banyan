"use client";

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";
import Link from "next/link";

// UI primitives. Honest by default: EmptyState explains, never fabricates.

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-forest text-ivory hover:bg-forest-deep disabled:opacity-40",
  secondary: "bg-ivory-deep text-forest-deep border border-forest/20 hover:border-forest/50 disabled:opacity-40",
  ghost: "bg-transparent text-forest-deep hover:bg-forest/5 disabled:opacity-40",
  danger: "bg-white text-clay border border-clay/40 hover:bg-clay/5 disabled:opacity-40",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const sizeCls = size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-sm";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium shadow-sm transition-colors disabled:cursor-not-allowed ${sizeCls} ${buttonStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  children,
  className = "",
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}) {
  const sizeCls = size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-sm";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium shadow-sm transition-colors ${sizeCls} ${buttonStyles[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full rounded-md border border-bark/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-soft/60 focus:border-forest focus:outline-none disabled:opacity-50 ${className}`}
    />
  );
});

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={`w-full rounded-md border border-bark/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-soft/60 focus:border-forest focus:outline-none ${className}`}
    />
  );
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full rounded-md border border-bark/20 bg-white px-3 py-2 text-sm text-charcoal focus:border-forest focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, required, children, htmlFor }: { label: string; hint?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-charcoal">
        {label} {required && <span className="text-clay">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-charcoal-soft">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-bark/15 bg-white p-4 ${className}`}>{children}</div>;
}

const BADGE_VARIANTS: Record<string, string> = {
  forest: "bg-forest/10 text-forest-deep border-forest/20",
  moss: "bg-moss/15 text-forest border-moss/25",
  clay: "bg-clay/10 text-clay border-clay/25",
  warm: "bg-ivory-deep text-bark border-bark/20",
  charcoal: "bg-charcoal/5 text-charcoal border-charcoal/15",
  sage: "bg-sage/40 text-forest-deep border-sage",
};

export function Badge({ variant = "warm", children, className = "" }: { variant?: keyof typeof BADGE_VARIANTS; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.warm} ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-bark/25 bg-ivory p-8">
      {icon && <div className="text-forest">{icon}</div>}
      <h3 className="font-serif text-lg text-forest-deep">{title}</h3>
      <p className="max-w-md text-sm text-charcoal-soft">{body}</p>
      {action}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-charcoal-soft" role="status" aria-live="polite">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl text-forest-deep">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-charcoal-soft">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, keyof typeof BADGE_VARIANTS> = {
    draft: "warm",
    planned: "moss",
    in_progress: "forest",
    completed: "forest",
    archived: "charcoal",
    ready_for_review: "warm",
    approved: "forest",
    scheduled: "moss",
    publishing: "moss",
    published: "forest",
    failed: "clay",
    rejected: "clay",
    blocked: "clay",
    error: "clay",
    verified: "forest",
    configured: "warm",
  };
  return <Badge variant={variantMap[status] ?? "warm"}>{status.replace(/_/g, " ")}</Badge>;
}

export function TabBar({ tabs }: { tabs: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-bark/10" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className={`rounded-t-md px-3 py-2 text-sm font-medium ${t.current ? "bg-forest/10 text-forest-deep" : "text-charcoal-soft hover:text-forest"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
