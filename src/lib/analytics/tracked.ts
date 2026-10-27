import { env } from "@/lib/env";

/** Build a social-shared destination URL with consistent UTM parameters. */
export function buildTrackedUrl(input: {
  target: string;
  slug: string;
  channel: string;
  campaignSlug: string;
  contentId?: string | null;
}): { url: string; utm: Record<string, string> } {
  const target = new URL(input.target);
  const utm: Record<string, string> = {
    utm_source: input.channel,
    utm_medium: "social",
    utm_campaign: input.campaignSlug,
    utm_content: input.contentId ?? input.slug,
  };
  for (const [k, v] of Object.entries(utm)) target.searchParams.set(k, v);
  return { url: target.toString(), utm };
}

/** Public redirect URL served by /t/[slug]. */
export function trackedLinkUrl(slug: string): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/t/${slug}`;
}
