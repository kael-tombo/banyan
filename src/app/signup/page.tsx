import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthShell mode="signup" />
    </Suspense>
  );
}
