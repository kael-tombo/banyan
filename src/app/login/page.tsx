import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthForm";
import { visibleProviders } from "@/lib/auth/oauth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthShell mode="login" providers={visibleProviders()} />
    </Suspense>
  );
}
