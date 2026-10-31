"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { PALETTE_DESTINATIONS, QUICK_ACTIONS } from "@/components/app-nav";

/**
 * Command palette — the fast path through a 22-destination app.
 *
 * Opens with ⌘K / Ctrl-K or the top-bar button. Search matches page names,
 * groups, keywords and common verbs. Fully keyboard-driven: type to filter,
 * arrows to move, Enter to go, Escape to leave. Rendered as a modal dialog
 * with the active option announced through `aria-activedescendant`.
 */

type Row = (typeof PALETTE_DESTINATIONS)[number] & { kind: "action" | "page" };

function score(row: Row, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = row.label.toLowerCase();
  const group = row.group.toLowerCase();
  const hint = row.hint?.toLowerCase() ?? "";
  const keywords = (row.keywords ?? "").toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (keywords.includes(q) || group.includes(q) || hint.includes(q)) return 40;
  // All query tokens must appear somewhere — keeps multi-word search useful.
  const haystack = `${label} ${group} ${hint} ${keywords} ${row.href}`;
  return q.split(/\s+/).every((token) => haystack.includes(token)) ? 20 : -1;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const actions: Row[] = QUICK_ACTIONS.map((a) => ({ ...a, group: "Quick action", kind: "action" }));
    const pages: Row[] = PALETTE_DESTINATIONS.map((p) => ({ ...p, kind: "page" }));
    const all = [...actions, ...pages];
    if (!query.trim()) return all;
    return all
      .map((row) => ({ row, s: score(row, query) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.row);
  }, [query]);

  // Reset on open; remember and restore whatever had focus before.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the highlighted option visible inside a long list.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`palette-option-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, rows.length]);

  if (!open) return null;

  function choose(row: Row | undefined) {
    if (!row) return;
    onClose();
    router.push(row.href);
  }

  const optionId = (i: number) => `palette-option-${i}`;
  const activeDescendant = rows.length > 0 ? optionId(Math.min(active, rows.length - 1)) : undefined;

  return (
    <div
      className="palette-backdrop-in fixed inset-0 z-[60] flex items-start justify-center bg-charcoal/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page or action"
        className="palette-in card-shadow-lg mt-[10vh] w-full max-w-xl overflow-hidden rounded-2xl border border-bark/15 bg-paper"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "Tab") {
            // Single-control dialog: keep focus on the query input.
            e.preventDefault();
            inputRef.current?.focus();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            choose(rows[Math.min(active, Math.max(0, rows.length - 1))]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-bark/10 px-4">
          <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="palette-search" className="sr-only">
            Search pages and actions
          </label>
          <input
            ref={inputRef}
            id="palette-search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-describedby="palette-hint"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions"
            spellCheck={false}
            autoComplete="off"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-charcoal placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden h-5 items-center rounded border border-bark/15 bg-ivory px-1.5 font-mono text-[11px] leading-none text-muted sm:flex">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id="palette-results"
          role="listbox"
          aria-label={query ? "Search results" : "All pages and quick actions"}
          className="max-h-[52vh] overflow-y-auto p-2 [scrollbar-width:thin]"
        >
          {rows.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">No match for “{query.trim()}”</p>
              <p className="mt-1 text-xs text-charcoal-soft">
                Try a page name, or a verb like <span className="font-medium text-charcoal">create</span>,{" "}
                <span className="font-medium text-charcoal">review</span> or{" "}
                <span className="font-medium text-charcoal">connect</span>
              </p>
            </div>
          ) : (
            rows.map((row, i) => {
              const Icon = row.icon;
              const isActive = i === Math.min(active, rows.length - 1);
              return (
                <button
                  key={`${row.kind}-${row.href}-${row.label}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(row)}
                  className={`flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${
                    isActive ? "bg-bark/[0.06]" : "bg-transparent"
                  }`}
                >
                  <Icon
                    size={16}
                    className={`shrink-0 ${isActive ? "text-charcoal" : "text-muted"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium leading-5 text-charcoal">{row.label}</span>
                    <span className="block truncate text-xs leading-4 text-muted">
                      {"hint" in row ? row.hint : row.href}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{row.group}</span>
                  <ArrowUpRight
                    size={16}
                    className={`shrink-0 text-charcoal-soft transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })
          )}
        </div>

        <div
          id="palette-hint"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-bark/10 bg-ivory/50 px-4 py-3 text-xs text-muted"
        >
          <span>
            <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> to move
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> to open
          </span>
          <span className="ml-auto hidden sm:block">Nothing you type here is stored</span>
        </div>
      </div>
    </div>
  );
}
