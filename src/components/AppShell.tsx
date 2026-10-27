"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";
import {
  LayoutDashboard, Package, Users2, Megaphone, PenLine, CheckCircle2, CalendarDays,
  Share2, LineChart, FlaskConical, Settings, LogOut, Sprout,
} from "lucide-react";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/workspace", label: "Workspace", icon: Package },
  { href: "/app/audience", label: "Audience", icon: Users2 },
  { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/app/content", label: "Content", icon: PenLine },
  { href: "/app/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/publishing", label: "Publishing", icon: Share2 },
  { href: "/app/analytics", label: "Analytics", icon: LineChart },
  { href: "/app/experiments", label: "Experiments", icon: FlaskConical },
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    router.push("/");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen bg-ivory">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-bark/10 bg-white px-3 py-4 md:flex" aria-label="Main navigation">
        <Link href="/app" className="mb-1 flex items-center gap-2 px-2">
          <BanyanMark size={22} />
          <span className="font-serif text-base text-forest-deep">
            Banyan<span className="text-moss">.ai</span>
          </span>
        </Link>
        <div className="mb-2 rounded-md bg-ivory px-3 py-2">
          <p className="truncate text-sm font-medium text-charcoal">{product || "No product yet"}</p>
          <p className="truncate text-xs text-charcoal-soft">{workspace.name}{workspace.isSelf ? " · self-distribution" : ""}</p>
          {goal && <p className="mt-1 text-xs text-moss">{goal.replace(/_/g, " ")} goal</p>}
        </div>
        {workspace.isSelf && (
          <Link
            href="/app/growth"
            className={`mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium ${isActive("/app/growth") ? "bg-forest/10 text-forest-deep" : "text-clay hover:bg-clay/5"}`}
          >
            <Sprout size={16} aria-hidden={true} /> Growth: distributing itself
          </Link>
        )}
        <nav className="flex flex-1 flex-col gap-0.5" role="list">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                isActive(n.href) ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:bg-forest/5 hover:text-forest-deep"
              }`}
            >
              <n.icon size={16} aria-hidden="true" /> {n.label}
            </Link>
          ))}
          <div className="mt-auto flex flex-col gap-0.5 border-t border-bark/10 pt-2">
            <Link
              href="/app/settings"
              aria-current={isActive("/app/settings") ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isActive("/app/settings") ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft hover:bg-forest/5 hover:text-forest-deep"}`}
            >
              <Settings size={16} aria-hidden="true" /> Settings
            </Link>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="truncate text-xs text-charcoal-soft" title={user.email}>{user.email}</span>
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out">
                <LogOut size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-bark/10 bg-ivory/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/app" className="flex items-center gap-2">
            <BanyanMark size={20} />
            <span className="font-serif text-forest-deep">Banyan.ai</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-charcoal-soft">{product || workspace.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out"><LogOut size={14} aria-hidden="true" /></Button>
          </div>
        </div>
        <div className="overflow-x-auto border-b border-bark/10 bg-white md:hidden" role="navigation" aria-label="Sections">
          <nav className="flex gap-1 px-2 py-2">
            {[...NAV, { href: "/app/settings", label: "Settings", icon: Settings }].map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive(n.href) ? "bg-forest/10 font-medium text-forest-deep" : "text-charcoal-soft"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        {!onboardingComplete && (
          <div className="border-b border-clay/25 bg-clay/5">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-charcoal">
                <span className="font-medium">Finish setting up your workspace.</span>{" "}
                Add your product, audience and goal so generation is grounded in your real context — the rest of the app
                works either way.
              </p>
              <Link
                href="/onboarding"
                className="shrink-0 rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-ivory transition-colors hover:bg-forest-deep"
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
