"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Bot, Check, Link2, Lock, Pencil } from "lucide-react";
import { PlatformMark } from "@/components/landing/landscape/platforms";

/**
 * How it works — one cycle, walked through stage by stage.
 *
 * Each of the seven stages shows the thing it actually produces, for one
 * fictional product (Ledgerline, shipping offline mode — the same launch
 * that appears in the landscape above). Every state shown exists in the
 * product today; no performance numbers are invented, because the product
 * never invents them either.
 *
 * Interaction: a tablist. Click or arrow keys move between stages. While the
 * section is in view it advances on its own, and stops for good the moment
 * someone takes control. Reduced motion never auto-advances.
 */

type Stage = {
  title: string;
  short: string;
  you?: boolean;
  /** Who carries the stage: you, or the named agents that run it. */
  owner: string;
  summary: string;
  produces: string;
  artifact: ReactNode;
};

const ADVANCE_MS = 7000;

/* ————— Small shared pieces for the artifacts ————— */

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#E6E8EA] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.10)] ${className}`}>
      {children}
    </div>
  );
}

function Row({ label, children, tag }: { label: string; children: ReactNode; tag?: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 border-t border-[#EEF0F2] px-4 py-3 first:border-t-0 sm:grid-cols-[132px_minmax(0,1fr)]">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[14px] text-charcoal">
        <span>{children}</span>
        {tag}
      </dd>
    </div>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "forest" | "fig" }) {
  const cls =
    tone === "forest" ? "bg-forest/[0.08] text-forest" : tone === "fig" ? "bg-fig/[0.12] text-fig-deep" : "bg-[#F1F3F4] text-charcoal-soft";
  return <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/* ————— The seven stages ————— */

const STAGES: Stage[] = [
  {
    title: "Product URL or idea",
    short: "Intake",
    you: true,
    owner: "You decide",
    summary: "Paste one public page. Banyan reads it into a snapshot, and you correct anything it got wrong before it is stored.",
    produces: "A reviewed product snapshot and one objective",
    artifact: (
      <div className="flex flex-col gap-3">
        <Panel className="flex items-center gap-3 px-4 py-3">
          <Link2 size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-charcoal">https://ledgerline.app</span>
          <Tag tone="forest"><Check size={12} aria-hidden="true" /> Read 1 page</Tag>
        </Panel>
        <Panel>
          <dl>
            <Row label="Product">Ledgerline</Row>
            <Row label="What it does">Invoicing and bookkeeping for freelancers</Row>
            <Row label="Audience" tag={<Tag tone="fig"><Pencil size={12} aria-hidden="true" /> Corrected by you</Tag>}>
              Freelance designers and developers
            </Row>
            <Row label="The update">Offline mode, on every plan</Row>
            <Row label="Objective">Trial signups</Row>
          </dl>
        </Panel>
      </div>
    ),
  },
  {
    title: "Product and audience research",
    short: "Research",
    owner: "Research Agent",
    summary: "The Research Agent gathers evidence about the audience and the alternatives, and every finding keeps its source.",
    produces: "Cited findings the strategy has to stand on",
    artifact: (
      <div className="flex flex-col gap-3">
        {[
          { platform: "reddit" as const, source: "r/freelance", finding: "Invoicing without signal comes up again and again: trains, flights, client sites with no Wi-Fi.", kind: "Community thread" },
          { platform: "blog" as const, source: "Two competitor pricing pages", finding: "Both alternatives keep offline access on their paid tiers only.", kind: "Pricing" },
          { platform: "blog" as const, source: "ledgerline.app/changelog", finding: "Offline mode ships to every plan, including free.", kind: "Your product" },
        ].map((e) => (
          <Panel key={e.source} className="p-4">
            <p className="flex items-center gap-2 text-[13px] text-charcoal-soft">
              <PlatformMark platform={e.platform} size={16} />
              {e.source}
              <span className="ml-auto text-xs text-muted">{e.kind}</span>
            </p>
            <p className="mt-2 text-[14px] leading-5 text-charcoal">{e.finding}</p>
          </Panel>
        ))}
      </div>
    ),
  },
  {
    title: "Distribution strategy",
    short: "Strategy",
    owner: "Strategist and Planner agents",
    summary: "One objective, one metric, and the channel, angle and message to test first, each tied back to the research.",
    produces: "A plan you can read in a minute",
    artifact: (
      <Panel>
        <div className="border-b border-[#EEF0F2] px-4 py-4">
          <p className="text-[13px] text-muted">Angle</p>
          <p className="mt-1 font-serif text-[22px] leading-snug text-forest-deep">Send the invoice before the train reaches the station</p>
        </div>
        <dl>
          <Row label="Objective">Trial signups</Row>
          <Row label="Metric">Signups from tracked links</Row>
          <Row label="Window">14 days</Row>
          <Row label="Channels">
            <span className="inline-flex items-center gap-2">
              <PlatformMark platform="x" size={16} />
              <PlatformMark platform="linkedin" size={16} />
              <PlatformMark platform="youtube" size={16} />
              <span className="text-charcoal-soft">X, LinkedIn, short video</span>
            </span>
          </Row>
          <Row label="Why">Competitors charge for what Ledgerline now gives away</Row>
        </dl>
      </Panel>
    ),
  },
  {
    title: "Your approval",
    short: "Approval",
    you: true,
    owner: "You decide · the Publisher Agent holds the gate",
    summary: "Nothing moves past this point without a recorded human decision. Editing copy after approval resets the gate.",
    produces: "A recorded decision, or your changes",
    artifact: (
      <Panel className="p-5">
        <div className="flex items-center gap-2 text-[13px] text-fig-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" />
          Waiting on you
        </div>
        <p className="mt-3 text-[18px] font-medium leading-snug text-forest-deep">Strategy and three assets are ready for review</p>
        <ul className="mt-4 space-y-2 text-[14px] text-charcoal-soft">
          {["Angle and metric", "X thread, 4 posts", "LinkedIn post", "Short-video script, 30 seconds"].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check size={16} className="text-muted" aria-hidden="true" /> {item}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex h-9 items-center rounded-lg bg-forest-deep px-4 text-sm font-medium text-white">Approve</span>
          <span className="inline-flex h-9 items-center rounded-lg border border-[#E1E4E7] bg-white px-4 text-sm font-medium text-charcoal">Request changes</span>
        </div>
        <p className="mt-4 flex items-center gap-2 border-t border-[#EEF0F2] pt-4 text-[13px] text-muted">
          <Lock size={14} aria-hidden="true" /> Publishing stays locked until a decision is recorded
        </p>
      </Panel>
    ),
  },
  {
    title: "Content production and adaptation",
    short: "Content",
    owner: "Creator Agent",
    summary: "One idea becomes three assets, each written for its format instead of one post pasted three times.",
    produces: "An X thread, a LinkedIn post and a short-video script",
    artifact: (
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-charcoal">
            <PlatformMark platform="x" size={16} /> Thread · 1/4
          </p>
          <p className="mt-2 text-[14px] leading-5 text-charcoal">
            You finish the job on the train. No signal. The invoice waits until Monday. Not anymore: Ledgerline works offline, on every plan.
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-charcoal">
            <PlatformMark platform="linkedin" size={16} /> Post
          </p>
          <p className="mt-2 text-[14px] leading-5 text-charcoal">
            Freelancers lose days to invoices they could not send from the road. We made offline mode free, because getting paid should not need Wi-Fi.
          </p>
        </Panel>
        <Panel className="p-4 sm:col-span-2">
          <p className="flex items-center gap-2 text-[13px] font-medium text-charcoal">
            <PlatformMark platform="youtube" size={16} /> Short-video script · 30 s
          </p>
          <ol className="mt-2 grid gap-x-6 gap-y-1 text-[14px] leading-5 text-charcoal sm:grid-cols-3">
            <li><span className="font-mono text-xs text-muted">0–3 s</span> Phone, airplane mode on</li>
            <li><span className="font-mono text-xs text-muted">3–20 s</span> Invoice written and queued</li>
            <li><span className="font-mono text-xs text-muted">20–30 s</span> Lands, it sends itself</li>
          </ol>
        </Panel>
      </div>
    ),
  },
  {
    title: "Coordinated publishing",
    short: "Publishing",
    owner: "Publisher Agent",
    summary: "Today you publish each approved post yourself from its export package and record the live URL. When SocialFlow.ai's API is available, approved posts will publish through it automatically.",
    produces: "Recorded publications with their live URLs",
    artifact: (
      <Panel>
        {[
          { platform: "x" as const, name: "X thread", detail: "Exported · published by you · live URL recorded", tag: <Tag tone="forest"><Check size={12} aria-hidden="true" /> Published</Tag> },
          { platform: "linkedin" as const, name: "LinkedIn post", detail: "Exported · published by you · live URL recorded", tag: <Tag tone="forest"><Check size={12} aria-hidden="true" /> Published</Tag> },
          { platform: "youtube" as const, name: "Short-video script", detail: "Exported for you to record", tag: <Tag>Waiting on you</Tag> },
        ].map((p) => (
          <div key={p.name} className="flex items-center gap-3 border-t border-[#EEF0F2] px-4 py-4 first:border-t-0">
            <PlatformMark platform={p.platform} size={20} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-charcoal">{p.name}</p>
              <p className="text-[13px] text-muted">{p.detail}</p>
            </div>
            {p.tag}
          </div>
        ))}
        <p className="border-t border-[#EEF0F2] bg-[#F7F8F8] px-4 py-3 text-[13px] text-charcoal-soft">
          Automated publishing through SocialFlow.ai is not available yet. Nothing is marked published until a live URL is recorded.
        </p>
      </Panel>
    ),
  },
  {
    title: "Performance feedback",
    short: "Feedback",
    owner: "Analyst Agent",
    summary: "Each asset carries its own tracked link, so visits and signups trace back to the post that earned them.",
    produces: "A measured result and the next move",
    artifact: (
      <div className="flex flex-col gap-3">
        <Panel>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-[#EEF0F2] px-4 py-2 text-xs text-muted">
            <span>Tracked link</span>
            <span>Records</span>
          </div>
          {[
            { platform: "x" as const, link: "lnk.ledgerline.app/offline-x" },
            { platform: "linkedin" as const, link: "lnk.ledgerline.app/offline-li" },
            { platform: "youtube" as const, link: "lnk.ledgerline.app/offline-video" },
          ].map((l) => (
            <div key={l.link} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-[#EEF0F2] px-4 py-3 first:border-t-0">
              <span className="flex min-w-0 items-center gap-2">
                <PlatformMark platform={l.platform} size={16} />
                <span className="truncate font-mono text-[13px] text-charcoal">{l.link}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-charcoal-soft">
                Visit <ArrowRight size={14} className="text-muted" aria-hidden="true" /> Signup
              </span>
            </div>
          ))}
        </Panel>
        <div className="rounded-xl bg-forest-deep p-5 text-ivory">
          <p className="text-[13px] text-rail-muted">Next move</p>
          <p className="mt-2 text-[16px] leading-6 text-ivory">
            Proposed when the 14-day window closes, from the recorded visits and signups. Too little data is reported as too little data.
          </p>
        </div>
      </div>
    ),
  },
];

export function CycleWalkthrough() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const userTookOver = useRef(false);

  // Auto-advance only while the walkthrough is on screen, and never for
  // reduced-motion users or once someone has chosen a stage themselves.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => setAuto(entry.isIntersecting && !userTookOver.current),
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => setActive((i) => (i + 1) % STAGES.length), ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [auto, active]);

  function choose(i: number, focus = false) {
    userTookOver.current = true;
    setAuto(false);
    setActive(i);
    if (focus) tabRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = STAGES.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    choose(next, true);
  }

  const stage = STAGES[active];

  return (
    <div ref={rootRef} className="rounded-[20px] border border-[#E6E8EA] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6 lg:p-8">
      {/* The trunk: seven stages on one line. */}
      <div className="relative">
        <span aria-hidden="true" className="absolute left-4 right-4 top-4 h-px bg-[#E1E4E7]" />
        <span
          aria-hidden="true"
          className="absolute left-4 top-4 h-px bg-forest transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `calc((100% - 2rem) * ${active / (STAGES.length - 1)})` }}
        />
        <div role="tablist" aria-label="Stages of one cycle" onKeyDown={onKeyDown} className="relative grid grid-cols-7">
          {STAGES.map((s, i) => {
            const isActive = i === active;
            const done = i < active;
            return (
              <button
                key={s.title}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`cycle-tab-${i}`}
                aria-selected={isActive}
                aria-controls="cycle-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => choose(i)}
                className="group flex flex-col items-center gap-2 rounded-lg pb-1 text-center focus-visible:outline-offset-4"
              >
                <span
                  className={`num relative flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-medium transition-colors duration-150 ${
                    isActive
                      ? s.you
                        ? "border-fig bg-fig text-white"
                        : "border-forest-deep bg-forest-deep text-white"
                      : done
                        ? "border-forest/40 bg-white text-forest"
                        : s.you
                          ? "border-fig/50 bg-white text-fig-deep group-hover:border-fig"
                          : "border-[#D6DADE] bg-white text-charcoal-soft group-hover:border-[#B8BEC4]"
                  }`}
                >
                  {done ? <Check size={14} aria-hidden="true" /> : i + 1}
                  {/* Progress around the active stage while it advances on its own. */}
                  {isActive && auto && (
                    <svg className="cycle-ring absolute -inset-1 h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true" key={active}>
                      <circle cx="20" cy="20" r="18.5" fill="none" stroke={s.you ? "var(--color-fig)" : "var(--color-forest)"} strokeOpacity="0.35" strokeWidth="1.5" style={{ animationDuration: `${ADVANCE_MS}ms` }} />
                    </svg>
                  )}
                </span>
                <span
                  className={`hidden text-[13px] leading-4 lg:block ${isActive ? "font-medium text-forest-deep" : "text-charcoal-soft group-hover:text-charcoal"}`}
                >
                  {s.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The stage: what happens, and what it produces. */}
      <div
        id="cycle-panel"
        role="tabpanel"
        aria-labelledby={`cycle-tab-${active}`}
        className="mt-6 grid gap-6 rounded-2xl bg-[#F7F8F8] p-4 sm:p-6 lg:mt-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10 lg:p-8"
      >
        <div key={`copy-${active}`} className="cycle-enter flex flex-col">
          <p className="flex items-center gap-2 text-[13px]">
            <span className="num font-mono text-muted">
              {active + 1} / {STAGES.length}
            </span>
            {stage.you ? (
              <span className="inline-flex items-center gap-1.5 text-fig-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" /> {stage.owner}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-forest">
                <Bot size={14} aria-hidden="true" /> {stage.owner}
              </span>
            )}
          </p>
          <h3 className="mt-3 text-2xl font-medium leading-tight tracking-[-0.015em] text-forest-deep sm:text-[28px]">{stage.title}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-charcoal-soft">{stage.summary}</p>
          <div className="mt-6 border-t border-[#E6E8EA] pt-4">
            <p className="text-[13px] text-muted">Produces</p>
            <p className="mt-1 text-[15px] font-medium text-charcoal">{stage.produces}</p>
          </div>
          <div className="mt-6 flex gap-2 lg:mt-auto lg:pt-6">
            <button
              type="button"
              onClick={() => choose(active === 0 ? STAGES.length - 1 : active - 1)}
              className="inline-flex h-9 items-center rounded-lg border border-[#E1E4E7] bg-white px-3 text-[13px] font-medium text-charcoal transition-colors hover:border-[#C9CED3]"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => choose((active + 1) % STAGES.length)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E1E4E7] bg-white px-3 text-[13px] font-medium text-charcoal transition-colors hover:border-[#C9CED3]"
            >
              {active === STAGES.length - 1 ? "Start over" : `Next: ${STAGES[active + 1].short}`}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div key={`art-${active}`} className="cycle-enter cycle-enter-late min-w-0">
          {stage.artifact}
        </div>
      </div>

      <p className="mt-4 text-center text-[13px] text-muted">
        An illustrative cycle for a fictional product. Live cycles show only recorded states and numbers.
      </p>
    </div>
  );
}
