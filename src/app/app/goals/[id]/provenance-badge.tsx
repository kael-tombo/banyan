import { Badge } from "@/components/ui";

/** Visual language for fact provenance — verified facts never look like guesses. */
const VARIANTS: Record<string, { variant: "forest" | "moss" | "warm" | "charcoal"; label: string }> = {
  verified: { variant: "forest", label: "verified" },
  user_provided: { variant: "moss", label: "user-provided" },
  external_observation: { variant: "warm", label: "external" },
  hypothesis: { variant: "charcoal", label: "hypothesis" },
};

export default function ProvenanceBadge({ kind }: { kind: string }) {
  const v = VARIANTS[kind] ?? { variant: "warm" as const, label: kind.replace(/_/g, " ") };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}
