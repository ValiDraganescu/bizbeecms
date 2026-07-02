"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ADMIN_SECTIONS, type AdminSection } from "@/components/admin-sections";
import { ChatWidget } from "@/components/chat/chat-widget";

/**
 * Collapsible admin shell — sidebar nav + scrollable content area, adapted from
 * the aicms layout to the CMS's stack: `next/navigation` (no i18n routing),
 * `ADMIN_SECTIONS` + next-intl labels (adminNav.<key>), and the CMS OKLCH
 * purpose tokens (surface / foreground / primary / border). No session client
 * here — sign-in is driven by the PM SSO handoff — so the footer is the locale
 * switcher + a "view site" link rather than a user menu.
 *
 * Layout lives entirely in this client component (the server layout just gates
 * auth and renders <SidebarShell>{children}</SidebarShell>).
 */

type IconKey =
  | "home"
  | "chat"
  | "pages"
  | "pageBuilder"
  | "components"
  | "collections"
  | "dataSources"
  | "media"
  | "settings";

function NavIcon({ name }: { name: IconKey }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  } as const;
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "pages":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
    case "pageBuilder":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      );
    case "components":
      return (
        <svg {...common}>
          <path d="m10 13-2 2 2 2" />
          <path d="m14 17 2-2-2-2" />
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "collections":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
        </svg>
      );
    case "dataSources":
      // Plug glyph (external APIs plug into the site) — same Lucide-style set.
      return (
        <svg {...common}>
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
      );
    case "media":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

/* ── Theme toggle (3-way: light / system / dark) ─────────────────────────
 * Writes `data-theme` on <html> and persists to localStorage. globals.css keys
 * the dark palette off [data-theme="dark"] and the OS preference off
 * [data-theme="system"], so this just sets the attribute. */

type ThemeMode = "light" | "system" | "dark";
const THEME_KEY = "cms-theme";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("adminNav.theme");
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? "system";
    setMode(saved);
    applyTheme(saved);
  }, []);

  const set = (next: ThemeMode) => {
    setMode(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };

  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("light"), icon: <SunIcon /> },
    { value: "system", label: t("system"), icon: <MonitorIcon /> },
    { value: "dark", label: t("dark"), icon: <MoonIcon /> },
  ];

  if (collapsed) {
    const next: Record<ThemeMode, ThemeMode> = {
      system: "light",
      light: "dark",
      dark: "system",
    };
    const current = options.find((o) => o.value === mode) ?? options[1];
    return (
      <button
        type="button"
        onClick={() => set(next[mode])}
        title={`${t("label")}: ${current.label}`}
        className="flex w-full items-center justify-center rounded-md py-2.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        {current.icon}
      </button>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => set(opt.value)}
          title={opt.label}
          aria-pressed={mode === opt.value}
          className={
            "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] transition-colors " +
            (mode === opt.value
              ? "bg-surface font-medium text-foreground"
              : "bg-surface-muted text-foreground-muted hover:text-foreground")
          }
        >
          {opt.icon}
          <span className="hidden xl:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
} as const;

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MonitorIcon = () => (
  <svg {...iconProps}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/**
 * Sign out: POST /api/auth/logout invalidates the session server-side (deletes
 * the D1 row + clears the cookie), then hard-navigate to /admin so the layout
 * re-gates and shows the login page. Hard nav (not router.push) drops all
 * client cache.
 */
function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("adminNav");
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* even if the request fails, fall through to a reload — the layout re-gates */
    }
    window.location.href = "/admin";
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      title={collapsed ? t("logout") : undefined}
      className={
        "flex w-full items-center rounded-md text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50 " +
        (collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5")
      }
    >
      <span className="shrink-0">
        <LogoutIcon />
      </span>
      {!collapsed && t("logout")}
    </button>
  );
}

/** Disclosure chevron for parent items with sub-menus; rotates down when open. */
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={"transition-transform duration-200 " + (open ? "rotate-90" : "")}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const OPEN_SECTIONS_KEY = "cms-sidebar-open-sections";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Manually-toggled open sub-menus, persisted across refresh. The active section
  // is always shown open regardless (see `isOpen`), so this only governs sections
  // you're NOT currently inside.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPEN_SECTIONS_KEY);
      if (saved) setOpenSections(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* corrupt/absent → start closed */
    }
  }, []);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const links: (AdminSection & { key: IconKey })[] = [
    { key: "home", href: "/admin" },
    ...(ADMIN_SECTIONS as (AdminSection & { key: IconKey })[]),
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // When you visit a section with sub-menus, record it as open so it STAYS open
  // after you navigate away (otherwise a section that was only expanded by being
  // active silently collapses on the next page). Toggling the chevron can still
  // close it later. Runs on pathname change.
  useEffect(() => {
    const activeParent = (ADMIN_SECTIONS as AdminSection[]).find(
      (s) =>
        s.children?.length &&
        (s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href)),
    );
    if (!activeParent) return;
    setOpenSections((prev) => {
      if (prev.has(activeParent.key)) return prev;
      const next = new Set(prev).add(activeParent.key);
      localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [pathname]);
  // A child link is exact-match (so the parent's Import/Export and its Develop
  // child don't both light up on /admin/components/develop).
  const isExact = (href: string) => pathname === href;

  return (
    <div className="fixed inset-0 flex bg-surface">
      <aside
        className={
          "flex h-full flex-col border-r border-border bg-surface-raised transition-[width] duration-200 " +
          (collapsed ? "w-[60px]" : "w-64")
        }
      >
        {/* Brand + collapse toggle */}
        <div
          className={
            "flex h-16 items-center border-b border-border " +
            (collapsed ? "justify-center px-0" : "gap-2 px-5")
          }
        >
          {!collapsed && (
            <Link href="/admin" className="font-semibold text-foreground">
              {t("brand")}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={
              "flex items-center justify-center rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground " +
              (collapsed ? "" : "ml-auto")
            }
            aria-label={collapsed ? t("expand") : t("collapse")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={
                "transition-transform duration-200 " + (collapsed ? "rotate-180" : "")
              }
            >
              <path d="M11 17l-5-5 5-5" />
              <path d="M18 17l-5-5 5-5" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 space-y-1 overflow-y-auto p-3"
          aria-label={t("brand")}
        >
          {/* View site — first, prominent, opens the public site in a new tab */}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? t("viewSite") : undefined}
            className={
              "mb-1 flex items-center rounded-md border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-surface-muted " +
              (collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5")
            }
          >
            <span className="shrink-0">
              <ExternalLinkIcon />
            </span>
            {!collapsed && t("viewSite")}
          </a>

          {links.map(({ key, href, children }) => {
            const active = isActive(href);
            const hasChildren = Boolean(children?.length);
            // Children render when the section is the current route OR the user has
            // manually expanded it. Active wins so you can always reach sibling
            // sub-pages of the page you're on, even if you'd collapsed the section.
            const open = active || openSections.has(key);
            return (
              <div key={href}>
                <div className="flex items-center">
                  <Link
                    href={href}
                    title={collapsed ? t(key) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex flex-1 items-center rounded-md text-sm transition-colors " +
                      (collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5") +
                      " " +
                      (active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-foreground-muted hover:bg-surface-muted hover:text-foreground")
                    }
                  >
                    <span className="shrink-0">
                      <NavIcon name={key} />
                    </span>
                    {!collapsed && t(key)}
                  </Link>
                  {/* Disclosure toggle — only for parents with sub-menus, expanded
                      sidebar only. Separate from the Link so the parent still
                      navigates while the chevron toggles open/close. */}
                  {!collapsed && hasChildren && (
                    <button
                      type="button"
                      onClick={() => toggleSection(key)}
                      aria-expanded={open}
                      aria-label={open ? t("collapse") : t("expand")}
                      className="ml-0.5 flex shrink-0 items-center justify-center rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                    >
                      <ChevronIcon open={open} />
                    </button>
                  )}
                </div>
                {/* Sub-pages, shown when the section is open (expanded sidebar only). */}
                {!collapsed && children && open && (
                  <div className="mt-1 ml-4 flex flex-col gap-1 border-l border-border pl-3">
                    {children.map((child) => {
                      const childActive = isExact(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={childActive ? "page" : undefined}
                          className={
                            "rounded-md px-3 py-1.5 text-sm transition-colors " +
                            (childActive
                              ? "bg-primary-subtle font-medium text-primary"
                              : "text-foreground-muted hover:bg-surface-muted hover:text-foreground")
                          }
                        >
                          {t(child.key)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer — theme toggle + locale + release version (view site moved to top of nav) */}
        <div className="space-y-2 border-t border-border p-3">
          <ThemeToggle collapsed={collapsed} />
          {!collapsed && <LocaleSwitcher />}
          <LogoutButton collapsed={collapsed} />
          {!collapsed && process.env.NEXT_PUBLIC_CMS_VERSION && (
            <p className="px-3 pt-1 text-[11px] text-foreground-muted">
              {t("version", { version: process.env.NEXT_PUBLIC_CMS_VERSION })}
            </p>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Intercom-style floating assistant on every admin page. */}
      <ChatWidget />
    </div>
  );
}
