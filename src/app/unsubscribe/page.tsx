import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/AuthForm";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = { title: "Unsubscribe", referrer: "no-referrer" };

export default function UnsubscribePage() {
  return (
    <Suspense>
      <AuthFrame title="Stop the weekly summary" lede="You will no longer get the weekly email about what your autopilot did. Account emails, like password resets, still arrive.">
        <UnsubscribeButton />
      </AuthFrame>
    </Suspense>
  );
}
