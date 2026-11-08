import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/AuthForm";
import { ForgotPasswordForm } from "@/components/AccountEmailForms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthFrame title="Reset your password" lede="Enter the email you sign in with. We'll send a link to choose a new password.">
        <ForgotPasswordForm />
      </AuthFrame>
    </Suspense>
  );
}
