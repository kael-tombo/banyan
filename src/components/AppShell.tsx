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

/** The signature: a fig dot appears only where something waits on a human. */
function FigDot({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${onDark ? "bg-fig-light" : "bg-fig"}`}
      aria-hidden="true"
    />
  );
}

const RAIL_ROW =
  "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors duration-150";
const RAIL_ROW_ACTIVE = "bg-white/[0.08] text-ivory shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const RAIL_ROW_IDLE = "text-rail-ink hover:bg-white/[0.05] hover:text-ivory";

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
        className={`shrink-0 transition-colors ${active ? "text-ivory" : "text-rail-muted group-hover:text-rail-ink"}`}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
      {showCount && (
        <span className="ml-auto flex items-center gap-1.5" aria-label={`${attention} waiting on you`}>
          <FigDot onDark />
          <span className="num font-mono text-xs text-rail-ink">{attention}</span>
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
        className="canopy fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-white/[0.06] px-3 pb-3 pt-4 text-ivory md:flex"
        aria-label="Main navigation"
      >
        <div className="shrink-0">
          <Link href="/app" className="flex h-8 items-center gap-2.5 px-2" aria-label="Banyan.ai command center">
            <BanyanMark size={24} variant="white" />
            <span className="font-serif text-[17px] leading-none text-ivory">
              Banyan<span className="text-rail-muted">.ai</span>
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

        <nav className="app-scroll mt-2 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Sections">
          {NAV_GROUPS.map((group) => {
            const open = !closedGroups[group.label];
            const groupHasAttention = group.items.some((i) => i.href === "/app/approvals") && attention.approvals > 0;
            return (
              <div key={group.label} className="mt-4">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={open}
                  className="mb-1 flex h-6 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-rail-muted transition-colors hover:text-rail-ink"
                >
                  {group.label}
                  {groupHasAttention && !open && <FigDot onDark />}
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

        <div className="mt-auto flex shrink-0 flex-col gap-0.5 border-t border-white/[0.08] pt-2">
          {workspace.isSelf && <GrowthRow pathname={pathname} />}
          <NavRow item={SETTINGS_ITEM} pathname={pathname} attention={attention.approvals} />
          <div className="mt-1 flex h-12 items-center gap-2.5 px-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-medium text-ivory"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-5 text-ivory">{user.name || "Signed in"}</span>
              <span className="block truncate text-xs leading-4 text-rail-muted" title={user.email}>
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-rail-muted transition-colors hover:bg-white/[0.08] hover:text-ivory"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ————— Working surface ————— */}
      <div className="md:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-bark/10 bg-ivory">
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
              {attention.approvals > 0 && (
                <Link
                  href="/app/approvals"
                  className="hidden h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-charcoal transition-colors hover:bg-bark/[0.06] sm:inline-flex"
                >
                  <FigDot />
                  <span className="num">{attention.approvals}</span>
                  <span className="text-charcoal-soft">waiting on you</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-8 w-56 items-center gap-2 rounded-lg border border-bark/15 bg-white px-2.5 text-left text-[13px] text-muted transition-colors hover:border-bark/25 sm:flex"
                aria-label="Open command palette"
              >
                <Search size={16} className="shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">Search</span>
                <kbd className="flex h-5 items-center rounded border border-bark/15 bg-ivory px-1.5 font-mono text-[11px] leading-none text-muted">
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
          <div className="border-b border-bark/10 bg-white">
            <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
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
            className="canopy absolute inset-y-0 left-0 flex w-[88%] max-w-[320px] flex-col overflow-y-auto px-3 pb-4 pt-4 text-ivory"
          >
            <div className="flex items-center gap-2.5 px-2">
              <Link href="/app" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
                <BanyanMark size={24} variant="white" />
                <span className="font-serif text-[17px] leading-none text-ivory">
                  Banyan<span className="text-rail-muted">.ai</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                data-drawer-close
                aria-label="Close navigation"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-rail-ink hover:bg-white/[0.08] hover:text-ivory"
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
                  <p className="mb-1 flex h-6 items-center px-2 text-xs font-medium text-rail-muted">{group.label}</p>
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

            <div className="mt-6 flex flex-col gap-0.5 border-t border-white/[0.08] pt-2">
              {workspace.isSelf && <GrowthRow pathname={pathname} onNavigate={() => setMenuOpen(false)} />}
              <NavRow
                item={SETTINGS_ITEM}
                pathname={pathname}
                attention={attention.approvals}
                onNavigate={() => setMenuOpen(false)}
              />
              <button type="button" onClick={logout} className={`${RAIL_ROW} ${RAIL_ROW_IDLE} w-full text-left`}>
                <LogOut size={16} className="shrink-0 text-rail-muted" aria-hidden="true" />
                <span className="truncate">Log out</span>
                <span className="ml-auto truncate text-xs text-rail-muted">{user.email}</span>
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[13px] font-medium text-ivory"
        aria-hidden="true"
      >
        {productInitial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium leading-5 text-ivory">{product || "No product yet"}</span>
        <span className="block truncate text-xs leading-4 text-rail-muted">
          {workspace.name}
          {workspace.isSelf ? " · self-distribution" : ""}
          {goal ? ` · ${goal.replace(/_/g, " ")} goal` : ""}
        </span>
      </span>
    </>
  );
  const cls = `flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-white/[0.07]`} aria-label="Open workspace profile">
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
      <Sprout size={16} className={`shrink-0 ${active ? "text-ivory" : "text-rail-muted"}`} aria-hidden="true" />
      <span className="truncate">Self-distribution</span>
    </Link>
  );
}
