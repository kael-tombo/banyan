"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, ErrorNote } from "@/components/ui";
import { ProviderLogo } from "@/components/ProviderLogo";
import { OAUTH_ERRORS } from "@/lib/auth/oauth/messages";
import type { ProviderId, ProviderOption } from "@/lib/auth/oauth/providers";

export type LinkedAccount = { id: string; provider: ProviderId; email: string | null; displayName: string | null; lastUsedAt: string | null };

/** Password and connected providers; connect and disconnect them. */
export function SignInMethods({ hasPassword, accounts, providers }: { hasPassword: boolean; accounts: LinkedAccount[]; providers: ProviderOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkedNotice = params.get("linked");
  const errorCode = params.get("error");
  const shownError = error ?? (errorCode ? OAUTH_ERRORS[errorCode] ?? OAUTH_ERRORS.unavailable : null);
  const total = accounts.length + (hasPassword ? 1 : 0);

  async function disconnect(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/auth/oauth/accounts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "Could not disconnect.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-medium text-charcoal">Sign-in methods</h2>
      <p className="mt-1 text-sm text-charcoal-soft">Ways you can sign in to this account. Banyan keeps only the provider&rsquo;s account id and email, never its access tokens.</p>

      {linkedNotice && !shownError && (
        <p className="mt-3 text-[13px] text-forest">Connected {providers.find((p) => p.id === linkedNotice)?.label ?? linkedNotice}.</p>
      )}
      {shownError && <div className="mt-3"><ErrorNote>{shownError}</ErrorNote></div>}

      <ul className="mt-4 divide-y divide-bark/10 text-sm">
        <li className="flex items-center justify-between gap-4 py-3">
          <span className="text-charcoal">Email and password</span>
          <span className="text-charcoal-soft">{hasPassword ? "Set" : "Not set"}</span>
        </li>
        {providers.map((p) => {
          const account = accounts.find((a) => a.provider === p.id);
          return (
            <li key={p.id} className="flex items-center justify-between gap-4 py-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <ProviderLogo provider={p.id} size={16} />
                <span className="text-charcoal">{p.label}</span>
                {account && <span className="truncate text-charcoal-soft">{account.email ?? account.displayName ?? "Connected"}</span>}
              </span>
              {account ? (
                <button
                  type="button"
                  onClick={() => disconnect(account.id)}
                  disabled={!!busy || total <= 1}
                  title={total <= 1 ? "Your only way to sign in" : undefined}
                  className="shrink-0 text-[13px] text-charcoal-soft hover:text-clay disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === account.id ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : p.configured ? (
                <a href={`/api/auth/oauth/${p.id}/start?intent=link&next=%2Fapp%2Fsettings`} className="shrink-0 text-[13px] font-medium text-forest hover:text-forest-deep">
                  Connect
                </a>
              ) : (
                <span className="shrink-0 text-[13px] text-muted">Not set up</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
