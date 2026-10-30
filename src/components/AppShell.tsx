"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BanyanMark } from "@/components/BanyanMark";
import { CommandPalette } from "@/components/CommandPalette";
import {
  NAV_GROUPS, SETTINGS_ITEM, findActiveDestination, type NavItem,
} from "@/components/app-nav";
import {
  ChevronDown, ChevronRight, LogOut, Menu, Search, Sprout, X,
} from "lucide-react";

/**
 * The platform shell.
 *
 * A deep canopy rail holds the brand, the workspace and the grouped routes;
 * the working surface is warm bone paper with one quiet top bar. The rail is
 * the only dark surface in the app, so the eye spends its contrast budget on
 * content. Navigation groups collapse, and the command palette (⌘K / Ctrl-K)
 * makes all 22 destinations reachable without scanning a list.
 */

type AppShellProps = {
  user: { name: string; email: string };
  workspace: { id: string; name: string; isSelf: boolean };
  product: string;
  goal: string;
  onboardingComplete: boolean;
  attention: { approvals: number };
  children: React.ReactNode;
};

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || value.slice(0, 1).toUpperCase() || "B";
}

function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  pathname,
  attention,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  attention: number;
  onNavigate?: () => void;
}) {
  const active = isActiveRoute(pathname, item.href);
  const showBadge = item.href === "/app/approvals" && attention > 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150 ${
        active
          ? "bg-ivory font-medium text-forest-deep shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
          : "text-sage/75 hover:bg-white/[0.06] hover:text-ivory"
      }`}
    >
      <Icon
        size={15}
        strokeWidth={active ? 2.1 : 1.75}
        className={active ? "shrink-0 text-forest" : "shrink-0 text-sage/55 transition-colors group-hover:text-sage"}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
      {showBadge && (
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            active ? "bg-fig/20 text-fig-deep" : "bg-fig/25 text-[#EBCB8C]"
          }`}
          aria-label={`${attention} waiting`}
        >
          {attention}
        </span>
      )}
    </Link>
  );
}

export function AppShell({
  user,
  workspace,
  product,
  goal,
  onboardingComplete,
  attention,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const active = findActiveDestination(pathname);
  const initials = initialsOf(user.name || user.email);
  const productInitial = (product || workspace.name).slice(0, 1).toUpperCase();

  // The palette is the global shortcut, from any page and any focus state.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenuOpen(false);
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  // Collapse the mobile drawer whenever navigation happens.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While the drawer is open: lock the page, close on Escape, restore focus.
  useEffect(() => {
    if (!menuOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();
    }, 30);
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    router.push("/");
    router.refresh();
  }

  const toggleGroup = (label: string) =>
    setClosedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div className="app-canvas min-h-screen text-charcoal">
      {/* Let keyboard users jump past the navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-forest focus:px-3 focus:py-2 focus:text-sm focus:text-ivory"
      >
        Skip to content
      </a>

      {/* ————— Desktop canopy rail ————— */}
      <aside
        className="canopy fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col px-3 pb-3 pt-5 text-ivory md:flex"
        aria-label="Main navigation"
      >
        <div className="shrink-0 px-1">
          <Link href="/app" className="flex items-center gap-2.5" aria-label="Banyan.ai command center">
            <BanyanMark size={26} variant="white" />
            <span className="font-serif text-[17px] tracking-[-0.01em] text-ivory">
              Banyan<span className="text-[#D6A854]">.ai</span>
            </span>
            <span className="ml-auto rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-sage/45">
              OS
            </span>
          </Link>

          <Link
            href="/app/workspace"
            className="mt-4 block rounded-xl border border-white/[0.08] bg-white/[0.045] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
            aria-label="Open workspace profile"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#7BE7A5]/15 text-[11px] font-semibold text-[#9FE8BE]"
                aria-hidden="true"
              >
                {productInitial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ivory">
                  {product || "No product yet"}
                </span>
                <span className="block truncate text-[10.5px] text-sage/55">
                  {workspace.name}
                  {workspace.isSelf ? " · self-distribution" : ""}
                </span>
              </span>
            </div>
            {goal && (
              <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#D6A854]/20 bg-[#D6A854]/10 px-2 py-0.5 text-[10px] font-medium text-[#E3BE79]">
                <span className="h-1 w-1 rounded-full bg-[#D6A854]" aria-hidden="true" />
                {goal.replace(/_/g, " ")} goal
              </span>
            )}
          </Link>
        </div>

        <nav className="app-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Sections">
          {NAV_GROUPS.map((group) => {
            const open = !closedGroups[group.label];
            const groupHasAttention = group.items.some((i) => i.href === "/app/approvals") && attention.approvals > 0;
            return (
              <div key={group.label} className="mb-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sage/40 transition-colors hover:text-sage/70"
                >
                  {group.label}
                  {groupHasAttention && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D6A854]" aria-label="Something is waiting on you" />
                  )}
                  <ChevronDown
                    size={12}
                    className={`ml-auto transition-transform ${open ? "" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <NavRow
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        attention={attention.approvals}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 border-t border-white/[0.08] pt-2">
          {workspace.isSelf && (
            <Link
              href="/app/growth"
              aria-current={isActiveRoute(pathname, "/app/growth") ? "page" : undefined}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors ${
                isActiveRoute(pathname, "/app/growth")
                  ? "bg-ivory text-forest-deep"
                  : "text-[#E3BE79] hover:bg-[#D6A854]/10"
              }`}
            >
              <Sprout size={15} aria-hidden="true" /> Growth: distributing itself
            </Link>
          )}
          <NavRow item={SETTINGS_ITEM} pathname={pathname} attention={attention.approvals} />
          <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10.5px] font-semibold text-ivory"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ivory">{user.name || "Signed in"}</span>
              <span className="block truncate text-[10.5px] text-sage/50" title={user.email}>
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="rounded-md p-1.5 text-sage/55 transition-colors hover:bg-white/10 hover:text-ivory"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ————— Working surface ————— */}
      <div className="md:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-bark/10 bg-ivory/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-2 px-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label="Open navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-bark/12 bg-white/60 text-charcoal-soft transition-colors hover:border-forest/30 hover:text-forest md:hidden"
            >
              <Menu size={17} aria-hidden="true" />
            </button>

            <Link href="/app" className="flex items-center gap-1.5 md:hidden" aria-label="Banyan.ai dashboard">
              <BanyanMark size={20} />
            </Link>

            <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-[12px] md:flex">
              <span className="text-charcoal-soft/65">{active?.group ?? "Workspace"}</span>
              <ChevronRight size={11} className="text-charcoal-soft/35" aria-hidden="true" />
              <span className="font-medium text-charcoal">{active?.label ?? "Dashboard"}</span>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {attention.approvals > 0 && (
                <Link
                  href="/app/approvals"
                  className="hidden h-8 items-center gap-1.5 rounded-full border border-fig/25 bg-fig/[0.08] px-3 text-[11.5px] font-medium text-fig-deep transition-colors hover:bg-fig/[0.14] sm:inline-flex"
                >
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fig opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-fig" />
                  </span>
                  {attention.approvals} waiting on you
                </Link>
              )}

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-8 w-[210px] items-center gap-2 rounded-lg border border-bark/15 bg-white/75 px-2.5 text-left text-[12px] text-charcoal-soft shadow-[0_1px_2px_rgba(14,42,33,0.03)] transition-colors hover:border-forest/30 hover:bg-white sm:flex"
                aria-label="Open command palette"
              >
                <Search size={13} className="shrink-0 text-charcoal-soft/70" aria-hidden="true" />
                <span className="flex-1 truncate">Jump to…</span>
                <kbd className="rounded border border-bark/15 bg-ivory px-1 py-0.5 font-mono text-[9.5px] leading-none text-charcoal-soft/70">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search pages and actions"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-bark/12 bg-white/60 text-charcoal-soft sm:hidden"
              >
                <Search size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {!onboardingComplete && (
          <div className="border-b border-fig/15 bg-fig/[0.055]">
            <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 sm:px-6 lg:px-8">
              <Sprout size={14} className="shrink-0 text-fig-deep" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-charcoal">
                <span className="font-medium">Finish setup when you&apos;re ready.</span>{" "}
                <span className="text-charcoal-soft">
                  Add your product, audience and goal so drafts are grounded in real context — every page works meanwhile.
                </span>
              </p>
              <Link
                href="/onboarding"
                className="ml-auto shrink-0 text-[12px] font-semibold text-fig-deep underline-offset-4 hover:underline"
              >
                Finish setup →
              </Link>
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
      </div>

      {/* ————— Mobile drawer ————— */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-forest-deep/55 backdrop-blur-[2px]"
          />
          <aside
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="canopy absolute inset-y-0 left-0 flex w-[88%] max-w-[324px] flex-col overflow-y-auto px-3 pb-4 pt-4 text-ivory shadow-[0_0_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center gap-2.5 px-1">
              <Link href="/app" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
                <BanyanMark size={24} variant="white" />
                <span className="font-serif text-base text-ivory">
                  Banyan<span className="text-[#D6A854]">.ai</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                data-drawer-close
                aria-label="Close navigation"
                className="ml-auto rounded-lg p-1.5 text-sage/70 hover:bg-white/10 hover:text-ivory"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
              <p className="truncate text-[13px] font-medium text-ivory">{product || "No product yet"}</p>
              <p className="truncate text-[10.5px] text-sage/55">
                {workspace.name}
                {workspace.isSelf ? " · self-distribution" : ""}
              </p>
              {goal && <p className="mt-1 text-[10.5px] text-[#E3BE79]">{goal.replace(/_/g, " ")} goal</p>}
            </div>

            <nav className="mt-3 flex flex-col gap-3" aria-label="Sections">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sage/40">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <NavRow
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        attention={attention.approvals}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto border-t border-white/[0.08] pt-2">
              {workspace.isSelf && (
                <Link
                  href="/app/growth"
                  onClick={() => setMenuOpen(false)}
                  className="mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium text-[#E3BE79] hover:bg-[#D6A854]/10"
                >
                  <Sprout size={15} aria-hidden="true" /> Growth: distributing itself
                </Link>
              )}
              <NavRow
                item={SETTINGS_ITEM}
                pathname={pathname}
                attention={attention.approvals}
                onNavigate={() => setMenuOpen(false)}
              />
              <button
                type="button"
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-sage/70 hover:bg-white/[0.06] hover:text-ivory"
              >
                <LogOut size={15} aria-hidden="true" /> Log out ({user.email})
              </button>
            </div>
          </aside>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
