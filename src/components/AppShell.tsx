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
 * A light sidebar on white, the same paper as the landing and sign-in pages,
 * so the product reads as one place. The working surface is a near-white
 * canvas where white cards sit; colour is spent on content and on the one
 * signal that matters, the fig dot for what waits on a human.
 *
 * Navigation leads with "Today" (dashboard and approvals). Set-up pages
 * (Context, System) start collapsed unless you are in one, and the command
 * palette (⌘K / Ctrl-K) reaches every destination without scanning a list.
 */

type AppShellProps = {
  user: { name: string; email: string };
  workspace: { id: string; name: string; isSelf: boolean };
  product: string;
  goal: string;
  onboardingComplete: boolean;
  attention: { approvals: number };
  /** Available credits (US-063), null when unknown. */
  credits?: number | null;
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

/** The signature: a fig dot appears only where something waits on a human. */
function FigDot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fig" aria-hidden="true" />;
}

const RAIL_ROW =
  "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-forest";
const RAIL_ROW_ACTIVE = "bg-forest/[0.07] font-medium text-forest-deep";
const RAIL_ROW_IDLE = "text-charcoal-soft hover:bg-bark/[0.05] hover:text-charcoal";

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
  const showCount = item.href === "/app/approvals" && attention > 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`${RAIL_ROW} ${active ? RAIL_ROW_ACTIVE : RAIL_ROW_IDLE}`}
    >
      <Icon
        size={16}
        className={`shrink-0 transition-colors ${active ? "text-forest" : "text-muted group-hover:text-charcoal-soft"}`}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
      {showCount && (
        <span className="ml-auto flex items-center gap-1.5" aria-label={`${attention} waiting on you`}>
          <FigDot />
          <span className="num font-mono text-xs text-charcoal-soft">{attention}</span>
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
  credits = null,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({});
  // Show the shortcut the viewer's keyboard actually has.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
  }, []);

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

  // Collapsed groups start closed unless they hold the current page.
  const isGroupOpen = (group: (typeof NAV_GROUPS)[number]) =>
    groupOverrides[group.label] ??
    (!group.collapsed || group.items.some((i) => isActiveRoute(pathname, i.href)));
  const toggleGroup = (group: (typeof NAV_GROUPS)[number]) =>
    setGroupOverrides((prev) => ({ ...prev, [group.label]: !isGroupOpen(group) }));

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
        className="fixed inset-y-0 left-0 z-40 hidden w-[256px] flex-col border-r border-bark/10 bg-white px-3 pb-3 pt-4 md:flex"
        aria-label="Main navigation"
      >
        <div className="shrink-0">
          <Link href="/app" className="flex h-8 items-center gap-2 px-2" aria-label="Banyan.ai command center">
            <BanyanMark size={24} />
            <span className="text-[16px] font-medium leading-none tracking-[-0.01em] text-forest-deep">
              Banyan<span className="text-forest">.ai</span>
            </span>
          </Link>

          <WorkspaceCard
            product={product}
            workspace={workspace}
            goal={goal}
            productInitial={productInitial}
            className="mt-4"
            href="/app/workspace"
          />
        </div>

        <nav className="app-light-scroll mt-1 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Sections">
          {NAV_GROUPS.map((group) => {
            const open = isGroupOpen(group);
            const groupHasAttention = group.items.some((i) => i.href === "/app/approvals") && attention.approvals > 0;
            return (
              <div key={group.label} className="mt-4">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={open}
                  className="mb-1 flex h-6 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:text-charcoal-soft"
                >
                  {group.label}
                  {groupHasAttention && !open && <FigDot />}
                  <ChevronDown
                    size={14}
                    className={`ml-auto transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <NavRow key={item.href} item={item} pathname={pathname} attention={attention.approvals} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex shrink-0 flex-col gap-0.5 border-t border-bark/10 pt-2">
          {workspace.isSelf && <GrowthRow pathname={pathname} />}
          <NavRow item={SETTINGS_ITEM} pathname={pathname} attention={attention.approvals} />
          <div className="mt-1 flex h-12 items-center gap-2.5 px-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage text-[11px] font-medium text-forest-deep"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-5 text-charcoal">{user.name || "Signed in"}</span>
              <span className="block truncate text-xs leading-4 text-muted" title={user.email}>
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bark/[0.06] hover:text-charcoal"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ————— Working surface ————— */}
      <div className="min-w-0 md:pl-[256px]">
        <header className="sticky top-0 z-30 border-b border-bark/10 bg-white">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label="Open navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-bark/15 bg-white text-charcoal-soft transition-colors hover:text-charcoal md:hidden"
            >
              <Menu size={16} aria-hidden="true" />
            </button>

            <Link href="/app" className="flex items-center md:hidden" aria-label="Banyan.ai dashboard">
              <BanyanMark size={24} />
            </Link>

            <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-[13px] md:flex">
              <span className="text-muted">{active?.group ?? "Workspace"}</span>
              <ChevronRight size={14} className="text-muted" aria-hidden="true" />
              <span className="font-medium text-charcoal">{active?.label ?? "Dashboard"}</span>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {credits !== null && (
                <Link
                  href="/app/credits"
                  className={`hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-bark/[0.06] sm:inline-flex ${credits < 5 ? "text-clay" : "text-charcoal-soft"}`}
                  title="Available credits"
                >
                  <span className="num font-medium text-charcoal">{credits}</span> credits
                </Link>
              )}
              {attention.approvals > 0 && (
                <Link
                  href="/app/approvals"
                  className="hidden h-8 items-center gap-2 rounded-lg border border-fig/30 bg-fig/[0.06] px-2.5 text-[13px] text-charcoal transition-colors hover:bg-fig/[0.1] sm:inline-flex"
                >
                  <FigDot />
                  <span className="num">{attention.approvals}</span>
                  <span className="text-charcoal-soft">waiting on you</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-8 w-64 items-center gap-2 rounded-lg border border-bark/12 bg-canvas px-2.5 text-left text-[13px] text-muted transition-colors hover:border-bark/25 sm:flex"
                aria-label="Open command palette"
              >
                <Search size={16} className="shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">Search</span>
                <kbd className="flex h-5 items-center rounded border border-bark/15 bg-white px-1.5 font-mono text-[11px] leading-none text-muted">
                  {shortcut}
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search pages and actions"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-bark/15 bg-white text-charcoal-soft sm:hidden"
              >
                <Search size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {!onboardingComplete && (
          <div className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-bark/10 bg-white px-4 py-3">
              <Sprout size={16} className="shrink-0 text-muted" aria-hidden="true" />
              <p className="text-[13px] leading-5 text-charcoal">
                <span className="font-medium">Finish setup when you&apos;re ready</span>{" "}
                <span className="text-charcoal-soft">
                  Add your product, audience and goal so drafts are grounded in real context. Every page works meanwhile.
                </span>
              </p>
              <Link
                href="/onboarding"
                className="ml-auto shrink-0 text-[13px] font-medium text-forest underline-offset-4 hover:underline"
              >
                Finish setup
              </Link>
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
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
            className="absolute inset-0 bg-charcoal/40"
          />
          <aside
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 flex w-[88%] max-w-[320px] flex-col overflow-y-auto bg-white px-3 pb-4 pt-4"
          >
            <div className="flex items-center gap-2.5 px-2">
              <Link href="/app" onClick={() => setMenuOpen(false)} className="flex items-center gap-2">
                <BanyanMark size={24} />
                <span className="text-[16px] font-medium leading-none tracking-[-0.01em] text-forest-deep">
                  Banyan<span className="text-forest">.ai</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                data-drawer-close
                aria-label="Close navigation"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-charcoal-soft hover:bg-bark/[0.06] hover:text-charcoal"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <WorkspaceCard
              product={product}
              workspace={workspace}
              goal={goal}
              productInitial={productInitial}
              className="mt-4"
            />

            <nav className="mt-2 flex flex-col" aria-label="Sections">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mt-4">
                  <p className="mb-1 flex h-6 items-center px-2 text-xs font-medium text-muted">{group.label}</p>
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

            <div className="mt-6 flex flex-col gap-0.5 border-t border-bark/10 pt-2">
              {workspace.isSelf && <GrowthRow pathname={pathname} onNavigate={() => setMenuOpen(false)} />}
              <NavRow
                item={SETTINGS_ITEM}
                pathname={pathname}
                attention={attention.approvals}
                onNavigate={() => setMenuOpen(false)}
              />
              <button type="button" onClick={logout} className={`${RAIL_ROW} ${RAIL_ROW_IDLE} w-full text-left`}>
                <LogOut size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">Log out</span>
                <span className="ml-auto truncate text-xs text-muted">{user.email}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Product, workspace and goal: who this rail is working for. */
function WorkspaceCard({
  product,
  workspace,
  goal,
  productInitial,
  href,
  className = "",
}: {
  product: string;
  workspace: { name: string; isSelf: boolean };
  goal: string;
  productInitial: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-deep text-[13px] font-medium text-white"
        aria-hidden="true"
      >
        {productInitial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium leading-5 text-charcoal">{product || "No product yet"}</span>
        <span className="block truncate text-xs leading-4 text-muted">
          {workspace.name}
          {workspace.isSelf ? " · self-distribution" : ""}
          {goal ? ` · ${goal.replace(/_/g, " ")} goal` : ""}
        </span>
      </span>
    </>
  );
  const cls = `flex items-center gap-2.5 rounded-xl border border-bark/10 bg-canvas p-2 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-bark/20`} aria-label="Open workspace profile">
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Banyan's own workspace: the product distributing itself. */
function GrowthRow({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const active = isActiveRoute(pathname, "/app/growth");
  return (
    <Link
      href="/app/growth"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`${RAIL_ROW} ${active ? RAIL_ROW_ACTIVE : RAIL_ROW_IDLE}`}
    >
      <Sprout size={16} className={`shrink-0 ${active ? "text-forest" : "text-muted"}`} aria-hidden="true" />
      <span className="truncate">Self-distribution</span>
    </Link>
  );
}
