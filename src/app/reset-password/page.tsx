import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/AuthForm";
import { ResetPasswordForm } from "@/components/AccountEmailForms";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthFrame title="Choose a new password" lede="Setting it signs you out everywhere, including this browser. Then sign in with the new one.">
        <ResetPasswordForm />
      </AuthFrame>
    </Suspense>
  );
}
