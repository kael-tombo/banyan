"use client";

import {
  ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes,
  forwardRef, isValidElement, cloneElement, useId,
} from "react";
import Link from "next/link";

// UI primitives. Honest by default: EmptyState explains, never fabricates.
// Surfaces are quiet and rounded; hierarchy comes from type scale and space.

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-forest-deep text-ivory shadow-[0_1px_2px_rgba(14,42,33,0.28)] hover:bg-forest active:bg-forest-deep",
  secondary:
    "border border-bark/15 bg-white text-forest-deep shadow-[0_1px_2px_rgba(14,42,33,0.04)] hover:border-forest/35 hover:bg-white",
  ghost: "bg-transparent text-charcoal-soft hover:bg-forest/[0.06] hover:text-forest-deep",
  danger: "border border-clay/25 bg-white text-clay hover:bg-clay/[0.05]",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const sizeCls = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]";
  return (
    <button {...rest} className={`${BUTTON_BASE} ${sizeCls} ${buttonStyles[variant]} ${className}`}>
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
  const sizeCls = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]";
  return (
    <Link href={href} className={`${BUTTON_BASE} ${sizeCls} ${buttonStyles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const FIELD_SURFACE =
  "w-full rounded-lg border border-bark/15 bg-white text-sm text-charcoal shadow-[inset_0_1px_0_rgba(14,42,33,0.02)] placeholder:text-charcoal-soft/55 transition-colors focus:border-forest/55 focus:outline-none focus:ring-4 focus:ring-forest/10 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref
) {
  return <input ref={ref} {...rest} className={`h-10 px-3 ${FIELD_SURFACE} ${className}`} />;
});

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`px-3 py-2.5 leading-relaxed ${FIELD_SURFACE} ${className}`} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`h-10 px-3 ${FIELD_SURFACE} ${className}`}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  // Associate the label with its control (and carry `required`) so clicking the
  // label focuses the field and screen readers announce it, without every call
  // site having to hand-wire ids. Non-element children are left untouched.
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: controlId,
        ...(required ? { required: true } : {}),
      })
    : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-[13px] font-medium text-charcoal">
        {label} {required && <span className="text-clay" aria-hidden="true">*</span>}
      </label>
      {control}
      {hint && <p className="text-xs leading-relaxed text-charcoal-soft">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  // A raised sheet of paper: one hairline, a generous radius, and a shadow that
  // reads as depth rather than decoration. No left rules — the old grammar.
  return (
    <div id={id} className={`card-shadow rounded-2xl border border-bark/12 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

const BADGE_VARIANTS: Record<string, string> = {
  forest: "border-forest/15 bg-forest/[0.08] text-forest",
  moss: "border-moss/20 bg-moss/10 text-forest",
  clay: "border-clay/20 bg-clay/[0.08] text-clay",
  warm: "border-bark/12 bg-ivory-deep/60 text-charcoal-soft",
  charcoal: "border-charcoal/10 bg-charcoal/5 text-charcoal",
  sage: "border-sage bg-sage/45 text-forest-deep",
};

export function Badge({
  variant = "warm",
  children,
  className = "",
}: {
  variant?: keyof typeof BADGE_VARIANTS;
  children: ReactNode;
  className?: string;
}) {
  // Rounded chips read as recorded state, not garnish.
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none ${BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.warm} ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  // An empty state is an invitation to act: it gets a clear question and a
  // door, not decoration.
  return (
    <div className="rounded-2xl border border-dashed border-bark/20 bg-white/70 p-8">
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-forest/[0.07] text-forest">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-charcoal-soft">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-charcoal-soft" role="status" aria-live="polite">
      <span
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest border-t-transparent"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-lg border border-clay/25 bg-clay/[0.06] px-3 py-2 text-[13px] leading-relaxed text-clay">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal-soft/70">
            {eyebrow}
          </p>
        )}
        <h1 className="font-serif text-[30px] leading-[1.08] tracking-[-0.02em] text-forest-deep sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-charcoal-soft">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
  className = "",
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 ${className}`}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-charcoal">{title}</h2>
      {hint && <p className="text-[11px] text-charcoal-soft">{hint}</p>}
      {action}
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
    <nav
      className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-bark/10 bg-white/70 p-1"
      aria-label="Sections"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            t.current
              ? "bg-forest-deep text-ivory shadow-[0_1px_2px_rgba(14,42,33,0.2)]"
              : "text-charcoal-soft hover:bg-forest/5 hover:text-forest-deep"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
