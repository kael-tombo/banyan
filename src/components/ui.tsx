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
  primary: "bg-forest-deep text-ivory hover:bg-forest",
  secondary: "border border-bark/15 bg-white text-charcoal hover:border-bark/25 hover:bg-ivory",
  ghost: "bg-transparent text-charcoal-soft hover:bg-bark/[0.06] hover:text-charcoal",
  danger: "border border-clay/25 bg-white text-clay hover:bg-clay/[0.05]",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const sizeCls = size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm";
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
  const sizeCls = size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm";
  return (
    <Link href={href} className={`${BUTTON_BASE} ${sizeCls} ${buttonStyles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const FIELD_SURFACE =
  "w-full rounded-lg border border-bark/15 bg-white text-sm text-charcoal placeholder:text-muted transition-colors focus:border-forest/55 focus:outline-none focus:ring-4 focus:ring-forest/10 disabled:opacity-50";

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
      {hint && <p className="text-[13px] leading-5 text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  // A raised sheet of paper: one hairline, a 16px radius, a neutral 1px shadow.
  return (
    <div id={id} className={`card-shadow rounded-2xl border border-bark/10 bg-white p-6 ${className}`}>
      {children}
    </div>
  );
}

const BADGE_VARIANTS: Record<string, string> = {
  forest: "bg-forest/[0.08] text-forest",
  moss: "bg-moss/[0.08] text-forest",
  clay: "bg-clay/[0.08] text-clay",
  warm: "bg-bark/[0.07] text-charcoal-soft",
  charcoal: "bg-charcoal/[0.06] text-charcoal",
  sage: "bg-sage/50 text-forest-deep",
  fig: "bg-fig/[0.12] text-fig-deep",
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
  // A quiet tag for recorded state: small radius, no border, no glow.
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-xs font-medium leading-none ${BADGE_VARIANTS[variant] ?? BADGE_VARIANTS.warm} ${className}`}
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
      {icon && <div className="mb-4 text-muted [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <h3 className="font-serif text-xl text-forest-deep">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-charcoal-soft">{body}</p>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 flex items-center gap-2 text-[13px] text-muted">{eyebrow}</p>}
        <h1 className="font-serif text-[28px] leading-[1.15] text-forest-deep sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-charcoal-soft">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
      <h2 className="flex items-center gap-2 text-base font-medium text-charcoal">{title}</h2>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
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
    active: "forest",
    revoked: "charcoal",
    configured: "warm",
    removed: "charcoal",
  };
  return <Badge variant={variantMap[status] ?? "warm"}>{status.replace(/_/g, " ")}</Badge>;
}

export function TabBar({ tabs }: { tabs: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav
      className="mb-6 inline-flex flex-wrap gap-1 rounded-[10px] bg-bark/[0.07] p-1"
      aria-label="Sections"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.current ? "page" : undefined}
          className={`flex h-8 items-center rounded-md px-3 text-[13px] font-medium transition-colors ${
            t.current
              ? "bg-white text-charcoal shadow-[0_1px_2px_rgba(22,33,27,0.08)]"
              : "text-charcoal-soft hover:text-charcoal"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
