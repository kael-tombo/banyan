import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthForm";
import { visibleProviders } from "@/lib/auth/oauth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthShell mode="signup" providers={visibleProviders()} />
    </Suspense>
  );
}
