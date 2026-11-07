"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

/** "home page", "/pricing" — the short name of the page a value came from. */
export function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "" ? "home page" : u.pathname.replace(/\/$/, "");
  } catch {
    return "your site";
  }
}

/**
 * Where a value came from, in one quiet tag: read from a page, inferred by
 * Banyan (check it), needed from the founder, or the founder's own words.
 */
export function SourceTag({ source, empty, required, edited, siteRead = true }: { source?: string; empty: boolean; required?: boolean; edited?: boolean; siteRead?: boolean }) {
  if (empty) {
    return required ? (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-clay/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-clay">Needs you</span>
    ) : siteRead ? (
      <span className="text-[11px] text-muted">Not on your site</span>
    ) : null;
  }
  if (source === "inferred") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-fig/[0.12] px-1.5 py-0.5 text-[11px] font-medium text-fig-deep" title="Banyan worked this out from your pages. Check it reads right.">
        Inferred · check it
      </span>
    );
  }
  if (source) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-moss/[0.09] px-1.5 py-0.5 text-[11px] font-medium text-forest" title={source}>
        From {pageLabel(source)}
      </span>
    );
  }
  return edited ? <span className="text-[11px] font-medium text-forest">Your words</span> : null;
}

/** A labelled control with its source tag on the right of the label. */
export function ReviewField({
  label,
  tag,
  hint,
  children,
  id,
}: {
  label: string;
  tag?: ReactNode;
  hint?: string;
  children: (id: string) => ReactNode;
  id?: string;
}) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <label htmlFor={controlId} className="text-[13px] font-medium text-charcoal">{label}</label>
        {tag}
      </div>
      {children(controlId)}
      {hint && <p className="text-[12px] leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/** An editable list of short items: remove with ×, add with Enter. */
export function ListField({
  items,
  onChange,
  placeholder,
  max = 12,
  quote = false,
  label,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  max?: number;
  quote?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.length >= max || items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="rounded-lg border border-bark/15 bg-white p-2 focus-within:border-forest/55 focus-within:ring-4 focus-within:ring-forest/10">
      {items.length > 0 && (
        <ul className={quote ? "mb-1.5 space-y-1" : "mb-1.5 flex flex-wrap gap-1.5"} aria-label={label}>
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className={
                quote
                  ? "group flex items-start gap-2 rounded-md bg-ivory/70 px-2.5 py-1.5 text-[13px] leading-relaxed text-charcoal"
                  : "group inline-flex max-w-full items-center gap-1 rounded-md bg-sage/45 py-1 pl-2.5 pr-1 text-[13px] text-forest-deep"
              }
            >
              <span className={quote ? "flex-1" : "truncate"}>{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-0.5 text-charcoal-soft opacity-60 transition hover:bg-bark/10 hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${item}`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < max && (
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={add}
            placeholder={placeholder}
            aria-label={`Add to ${label}`}
            className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm text-charcoal placeholder:text-muted focus:outline-none"
          />
          <button type="button" onClick={add} disabled={!draft.trim()} className="rounded-md p-1.5 text-forest transition hover:bg-forest/[0.07] disabled:opacity-30" aria-label={`Add to ${label}`}>
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
