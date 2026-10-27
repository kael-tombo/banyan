import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthShell mode="login" />
    </Suspense>
  );
}
