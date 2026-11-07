"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Switch to a product, then open a screen in it — so a link never lands in the wrong product. */
export function OpenProduct({ productId, activeId, href, children, className = "" }: { productId: string; activeId: string; href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (productId !== activeId) {
      setBusy(true);
      const res = await fetch("/api/session/product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
      setBusy(false);
      if (!res.ok) return;
    }
    router.push(href);
    router.refresh();
  }
  return (
    <button type="button" onClick={go} disabled={busy} className={`text-left underline-offset-4 hover:underline disabled:opacity-60 ${className}`}>
      {children}
    </button>
  );
}
