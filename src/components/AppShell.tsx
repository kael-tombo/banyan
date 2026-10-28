"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";
import {
  LayoutDashboard, Package, Users2, Megaphone, PenLine, CheckCircle2, CalendarDays,
  Share2, LineChart, FlaskConical, Settings, LogOut, Sprout, Menu, X, Target, BookOpen, Compass, Link2,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

/**
 * Navigation is grouped by the job it does — plan, distribute, measure — so a
 * long flat list does not have to be scanned to find one page.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Plan",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/strategy", label: "Strategy", icon: Compass },
      { href: "/app/goals", label: "Goals", icon: Target },
      { href: "/app/workspace", label: "Workspace", icon: Package },
      { href: "/app/context", label: "Context", icon: BookOpen },
      { href: "/app/audience", label: "Audience", icon: Users2 },
    ],
  },
  {
    label: "Distribute",
    items: [
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/app/content", label: "Content", icon: PenLine },
      { href: "/app/approvals", label: "Approvals", icon: CheckCircle2 },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/publishing", label: "Publishing", icon: Share2 },
    ],
  },
  {
    label: "Measure",
    items: [
      { href: "/app/analytics", label: "Analytics", icon: LineChart },
      { href: "/app/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/app/connections", label: "Connections", icon: Link2 },
    ],
  },
];

export function AppShell({
  user,
  workspace,
  product,
  goal,
  onboardingComplete,
  children,
}: {
  user: { name: string; email: string };
  workspace: { id: string; name: string; isSelf: boolean };
  product: string;
  goal: string;
  onboardingComplete: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Collapse the mobile menu whenever navigation happens.
  useEffect(() => setMenuOpen(false), [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    router.push("/");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  const linkClass = (href: string, compact = false) =>
    `flex items-center gap-2 px-2 py-1.5 text-sm rounded-[3px] ${
      isActive(href)
        ? "bg-ivory/10 font-medium text-ivory"
        : "text-sage/75 hover:bg-ivory/5 hover:text-ivory"
    }`;

  return (
    <div className="flex min-h-screen bg-ivory">
      {/* Let keyboard users jump past the navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-forest focus:px-3 focus:py-2 focus:text-sm focus:text-ivory"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="canopy sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto px-3 py-4 text-ivory md:flex"
        aria-label="Main navigation"
      >
        <Link href="/app" className="mb-1 flex items-center gap-2 px-2">
          <BanyanMark size={22} />
          <span className="font-serif text-base text-ivory">
            Banyan<span className="text-fig">.ai</span>
          </span>
        </Link>
        <div className="mb-3 rounded-[3px] border border-ivory/10 bg-ivory/5 px-3 py-2">
          <p className="truncate text-sm font-medium text-ivory">{product || "No product yet"}</p>
          <p className="truncate text-xs text-sage/70">
            {workspace.name}
            {workspace.isSelf ? " · self-distribution" : ""}
          </p>
          {goal && <p className="mt-1 text-xs text-fig">{goal.replace(/_/g, " ")} goal</p>}
        </div>

        <nav className="flex flex-1 flex-col gap-3" role="list">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} role="listitem">
              <p className="serif px-2 pb-1 text-xs font-semibold tracking-wide text-fig/80">{group.label}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((n) => (
                  <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={linkClass(n.href)}>
                    <n.icon size={16} aria-hidden="true" /> {n.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-auto flex flex-col gap-0.5 border-t border-ivory/10 pt-2">
            {workspace.isSelf && (
              <Link
                href="/app/growth"
                aria-current={isActive("/app/growth") ? "page" : undefined}
                className={`flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-sm font-medium ${
                  isActive("/app/growth") ? "bg-fig/15 text-fig" : "text-fig/90 hover:bg-fig/10"
                }`}
              >
                <Sprout size={16} aria-hidden="true" /> Growth: distributing itself
              </Link>
            )}
            <Link
              href="/app/settings"
              aria-current={isActive("/app/settings") ? "page" : undefined}
              className={linkClass("/app/settings")}
            >
              <Settings size={16} aria-hidden="true" /> Settings
            </Link>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="truncate text-xs text-sage/70" title={user.email}>
                {user.email}
              </span>
              {/* ghost recolored for the dark sidebar surface */}
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out" className="text-sage/80 hover:bg-ivory/10 hover:text-ivory">
                <LogOut size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-bark/10 bg-ivory/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/app" className="flex items-center gap-2" aria-label="Banyan.ai dashboard">
            <BanyanMark size={20} />
            <span className="font-serif text-forest-deep">Banyan.ai</span>
          </Link>
          <div className="flex items-center gap-1">
            <span className="max-w-[9rem] truncate text-xs text-charcoal-soft">{product || workspace.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            >
              {menuOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="mobile-nav" className="border-b border-bark/10 bg-white px-2 py-2 md:hidden">
            <nav className="flex flex-col gap-2" aria-label="Sections">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="serif px-2 pb-1 text-xs font-semibold tracking-wide text-forest-deep">{group.label}</p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((n) => (
                      <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={linkClass(n.href, true)}>
                        <n.icon size={16} aria-hidden="true" /> {n.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-col gap-0.5 border-t border-bark/10 pt-2">
                {workspace.isSelf && (
                  <Link href="/app/growth" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-sm text-fig-deep">
                    <Sprout size={16} aria-hidden="true" /> Growth: distributing itself
                  </Link>
                )}
                <Link href="/app/settings" aria-current={isActive("/app/settings") ? "page" : undefined} className={linkClass("/app/settings")}>
                  <Settings size={16} aria-hidden="true" /> Settings
                </Link>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-charcoal-soft hover:bg-forest/5"
                >
                  <LogOut size={16} aria-hidden="true" /> Log out ({user.email})
                </button>
              </div>
            </nav>
          </div>
        )}

        {!onboardingComplete && (
          <div className="border-b border-fig/30 bg-fig/5">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-charcoal">
                <span className="font-medium">Finish setting up your workspace.</span>{" "}
                Add your product, audience and goal so generation is grounded in your real context — the rest of the app
                works either way.
              </p>
              <Link
                href="/onboarding"
                className="shrink-0 rounded-[4px] bg-forest-deep px-3 py-1.5 text-sm font-medium text-ivory transition-colors hover:bg-forest"
              >
                Finish setup
              </Link>
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
