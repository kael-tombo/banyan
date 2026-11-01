import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, Bot, CalendarDays, CheckCircle2, ClipboardList, Compass, FlaskConical,
  LayoutDashboard, Lightbulb, LineChart, Link2, Megaphone, Package, PenLine, Receipt, RefreshCw,
  Settings, Share2, Target, Users2,
} from "lucide-react";

/**
 * The app's information architecture, in one place.
 *
 * Grouped by the job it does — plan, understand the context, distribute,
 * measure, operate. Both the sidebar and the command palette read from here,
 * so a route can never exist in one and be missing from the other.
 */

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Plan",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard, keywords: "home command center overview" },
      { href: "/app/cycles", label: "Cycles", icon: RefreshCw, keywords: "complete cycle intake product url distribution run" },
      { href: "/app/goals", label: "Goals", icon: Target, keywords: "objective plan target" },
      { href: "/app/strategy", label: "Strategy", icon: Compass, keywords: "positioning messaging recommendation" },
      { href: "/app/opportunities", label: "Opportunities", icon: Lightbulb, keywords: "ideas plays growth" },
    ],
  },
  {
    label: "Context",
    items: [
      { href: "/app/brief", label: "Product & Audience", icon: ClipboardList, keywords: "brief profile positioning" },
      { href: "/app/audience", label: "Audience", icon: Users2, keywords: "segments people personas" },
      { href: "/app/workspace", label: "Workspace", icon: Package, keywords: "product channels profile" },
      { href: "/app/context", label: "Context", icon: BookOpen, keywords: "facts learning memory" },
    ],
  },
  {
    label: "Distribute",
    items: [
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone, keywords: "launch campaign plan" },
      { href: "/app/content", label: "Content", icon: PenLine, keywords: "drafts posts copy" },
      { href: "/app/approvals", label: "Approvals", icon: CheckCircle2, keywords: "review queue gate waiting" },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule publishing" },
      { href: "/app/publishing", label: "Publishing", icon: Share2, keywords: "channels publish schedule" },
    ],
  },
  {
    label: "Measure",
    items: [
      { href: "/app/results", label: "Results", icon: BarChart3, keywords: "outcomes metrics evidence" },
      { href: "/app/analytics", label: "Analytics", icon: LineChart, keywords: "funnel visits signups" },
      { href: "/app/experiments", label: "Experiments", icon: FlaskConical, keywords: "test hypothesis learn" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/app/connections", label: "Connections", icon: Link2, keywords: "integrations socialflow credentials" },
      { href: "/app/activity", label: "Agent activity", icon: Bot, keywords: "tasks runs audit log agents" },
      { href: "/app/usage", label: "Model usage", icon: Receipt, keywords: "cost tokens billing" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/app/settings",
  label: "Settings",
  icon: Settings,
  keywords: "account workspace preferences",
};

export type PaletteAction = NavItem & { group: string; hint?: string };

/** Every destination, flattened for search. */
export const PALETTE_DESTINATIONS: PaletteAction[] = [
  ...NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label }))
  ),
  { ...SETTINGS_ITEM, group: "System" },
];

export type QuickAction = NavItem & { hint: string };

/** The verbs that usually bring someone to the palette. */
export const QUICK_ACTIONS: QuickAction[] = [
  { href: "/app/cycles/new", label: "Start a complete cycle", icon: RefreshCw, hint: "Product URL → plan → publish", keywords: "cycle intake distribution product" },
  { href: "/app/goals", label: "Set a new goal", icon: Target, hint: "One sentence is enough", keywords: "create objective" },
  { href: "/app/content/new", label: "Create content", icon: PenLine, hint: "Draft for a channel", keywords: "write new post" },
  { href: "/app/campaigns/new", label: "New campaign", icon: Megaphone, hint: "Plan a coordinated push", keywords: "create launch" },
  { href: "/app/approvals", label: "Review approvals", icon: CheckCircle2, hint: "What is waiting on you", keywords: "queue gate decisions" },
  { href: "/app/experiments", label: "Start an experiment", icon: FlaskConical, hint: "One variable at a time", keywords: "test hypothesis" },
  { href: "/app/connections", label: "Connect a channel", icon: Link2, hint: "Verify publishing access", keywords: "integrate socialflow" },
];

/** The destination that owns the current URL (longest matching route). */
export function findActiveDestination(pathname: string): PaletteAction | undefined {
  const matches = PALETTE_DESTINATIONS.filter((d) =>
    d.href === "/app" ? pathname === "/app" : pathname === d.href || pathname.startsWith(`${d.href}/`)
  );
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}

/** The group that owns the current URL, for the sidebar's open state. */
export function findActiveGroup(pathname: string): string | undefined {
  return findActiveDestination(pathname)?.group;
}
