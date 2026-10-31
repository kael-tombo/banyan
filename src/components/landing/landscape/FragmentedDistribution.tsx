import { ContentCard } from "./ContentCard";
import type { Card } from "./content";

/**
 * The problem, drawn: the same week of distribution as six disconnected
 * windows. Every card is a different format, written separately, and the
 * lines between them never meet — there is no shared plan and no link back
 * to a result. Static on purpose; the landscape above is what motion is for.
 */

const SCATTERED: { card: Card; className: string }[] = [
  {
    className: "md:left-[2%] md:top-[6%] md:-rotate-2",
    card: {
      kind: "post", platform: "x", author: "You", handle: "@yourproduct", time: "Mon",
      body: "We just shipped v2! Check it out", stats: { replies: "2", reposts: "1", likes: "9" },
    },
  },
  {
    className: "md:left-[36%] md:top-[2%] md:rotate-1",
    card: {
      kind: "email", platform: "gmail", from: "Draft", subject: "Newsletter: v2 is here (rewrite 3)",
      preview: "Not sure what to lead with. Features? The story? Leaving this for tomorrow.", time: "Tue", label: "Drafts",
    },
  },
  {
    className: "md:right-[2%] md:top-[10%] md:rotate-2",
    card: {
      kind: "post", platform: "linkedin", author: "You", handle: "Founder", time: "Wed",
      body: "Excited to announce v2! Huge thanks to the team. Link in comments.", stats: { replies: "1", likes: "14" },
    },
  },
  {
    className: "md:left-[6%] md:top-[52%] md:rotate-1",
    card: {
      kind: "thread", platform: "reddit", community: "r/startups", title: "Is it okay to post my own launch here?",
      votes: "3", comments: "0", time: "Thu",
    },
  },
  {
    className: "md:left-[38%] md:top-[50%] md:-rotate-1",
    card: {
      kind: "short", platform: "tiktok", format: "TikTok", caption: "Script idea: show the dashboard? (not recorded)",
      author: "Notes", likes: "0", duration: "0:00", thumb: { tone: "sand", motif: "device" },
    },
  },
  {
    className: "md:right-[4%] md:top-[56%] md:-rotate-2",
    card: {
      kind: "post", platform: "facebook", author: "Your product", handle: "Page", time: "Fri",
      body: "v2 is out. Same post as LinkedIn, pasted in a hurry.", stats: { likes: "3" },
    },
  },
];

export function FragmentedDistribution() {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-[#E6E8EA] bg-[#F7F8F8] p-4 md:h-[560px] md:p-0"
      aria-label="Six separate posts written for six channels in one week, with no shared plan and no tracked result"
      role="img"
    >
      {/* Connections that never close: the plan that does not exist. */}
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        {[
          "M250 150 C 300 140, 330 130, 350 128",
          "M640 120 C 690 126, 710 140, 730 150",
          "M180 300 C 170 320, 168 330, 170 350",
          "M500 300 C 505 320, 500 330, 498 342",
          "M820 320 C 830 340, 834 350, 832 366",
          "M300 430 C 330 440, 350 440, 372 432",
        ].map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:block">
        {SCATTERED.map(({ card, className }, i) => (
          <div
            key={i}
            className={`md:absolute ${card.kind === "short" ? "md:w-[19%]" : "md:w-[27%]"} ${className} ${i >= 4 ? "hidden sm:block" : ""}`}
          >
            <ContentCard card={card} />
          </div>
        ))}
      </div>
    </div>
  );
}
