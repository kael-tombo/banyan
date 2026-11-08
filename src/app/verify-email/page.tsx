import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/AuthForm";
import { VerifyEmailResult } from "@/components/AccountEmailForms";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

export default async function VerifyEmailPage() {
  const user = await getSessionUser(await readSessionToken());
  return (
    <Suspense>
      <AuthFrame title="Confirm your email" lede="Banyan publishes only for confirmed addresses, so a post can never go out under a name nobody checked.">
        <VerifyEmailResult signedIn={Boolean(user)} />
      </AuthFrame>
    </Suspense>
  );
}
