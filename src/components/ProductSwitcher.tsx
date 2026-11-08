"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

export type SwitcherProduct = { id: string; name: string; productType: string; organization: string };

const TYPE_LABEL: Record<string, string> = {
  saas: "SaaS", web_app: "Web app", mobile_app: "Mobile app", ecommerce: "E-commerce", developer_tool: "Developer tool",
  digital_product: "Digital product", agency_service: "Agency service", personal_brand: "Personal brand", other: "Other",
};

/**
 * BOS-009/011: the active product, always visible, and the only way to change it.
 * Switching is explicit and confirmed on screen; the server re-validates the choice
 * on every request, so this component only expresses a preference.
 */
export function ProductSwitcher({
  activeId,
  activeLabel,
  detail,
  products,
  canCreate,
  className = "",
}: {
  activeId: string;
  activeLabel: string;
  detail: string;
  products: SwitcherProduct[];
  canCreate: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("saas");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const orgs = useMemo(() => [...new Set(products.map((p) => p.organization))], [products]);
  const shown = products.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function switchTo(p: SwitcherProduct) {
    if (p.id === activeId) return setOpen(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session/product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: p.id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not switch product.");
      setOpen(false);
      setNotice(`Now working in ${p.name}`);
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, productType: type }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create the product.");
      setOpen(false);
      setCreating(false);
      setName("");
      setNotice(`Created ${body.product.name}. You are now working in it.`);
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active product: ${activeLabel}. Switch product`}
        className="flex w-full items-center gap-2.5 rounded-xl border border-bark/10 bg-canvas p-2 text-left transition-colors hover:border-bark/20"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-deep text-[13px] font-medium text-white" aria-hidden="true">
          {(activeLabel || "B").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-5 text-charcoal">{activeLabel || "No product yet"}</span>
          <span className="block truncate text-xs leading-4 text-muted">{detail}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" aria-hidden="true" />
      </button>

      {notice && (
        <p role="status" className="mt-1.5 rounded-lg bg-forest/[0.07] px-2 py-1 text-xs text-forest-deep">
          {notice}
        </p>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-xl border border-bark/15 bg-white p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-lg border border-bark/10 px-2">
            <Search size={14} className="text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
          <ul role="listbox" aria-label="Products" className="mt-1.5 max-h-64 overflow-y-auto">
            {orgs.map((org) => {
              const inOrg = shown.filter((p) => p.organization === org);
              if (!inOrg.length) return null;
              return (
                <li key={org} role="presentation">
                  {orgs.length > 1 && <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-muted">{org}</p>}
                  <ul role="presentation">
                    {inOrg.map((p) => (
                      <li key={p.id} role="option" aria-selected={p.id === activeId}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => switchTo(p)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-canvas disabled:opacity-60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-charcoal">{p.name}</span>
                            <span className="block text-[11px] text-muted">{TYPE_LABEL[p.productType] ?? "Other"}</span>
                          </span>
                          {p.id === activeId && <Check size={14} className="text-forest" aria-label="Active" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-2 text-xs text-muted">No product matches “{query}”.</li>}
          </ul>

          {canCreate &&
            (creating ? (
              <form onSubmit={create} className="mt-1.5 space-y-1.5 border-t border-bark/10 pt-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Product name"
                  aria-label="Product name"
                  className="h-8 w-full rounded-lg border border-bark/15 px-2 text-sm outline-none focus:border-forest/55"
                />
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Product type" className="h-8 w-full rounded-lg border border-bark/15 px-2 text-sm">
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <button type="submit" disabled={busy || !name.trim()} className="h-8 flex-1 rounded-lg bg-forest-deep px-2 text-sm font-medium text-white disabled:opacity-50">
                    {busy ? "Creating…" : "Create product"}
                  </button>
                  <button type="button" onClick={() => setCreating(false)} className="h-8 rounded-lg px-2 text-sm text-charcoal-soft hover:bg-canvas">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="mt-1.5 flex w-full items-center gap-2 rounded-lg border-t border-bark/10 px-2 pb-1 pt-2.5 text-left text-sm text-forest hover:text-forest-deep">
                <Plus size={14} aria-hidden="true" /> New product
              </button>
            ))}
          {error && <p className="mt-1.5 px-2 text-xs text-clay">{error}</p>}
        </div>
      )}
    </div>
  );
}
