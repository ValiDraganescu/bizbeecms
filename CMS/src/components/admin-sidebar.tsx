"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ADMIN_SECTIONS, type AdminSection } from "@/components/admin-sections";
import { ChatWidget } from "@/components/chat/chat-widget";
import { localeNames, locales, LOCALE_COOKIE } from "@/i18n/routing";

/**
 * Collapsible admin shell — sidebar nav + scrollable content area ("Option A ·
 * Grouped" redesign, 2026-08-20). One visual shape for everything:
 *
 * - Brand header: bee + BizBeeCMS + release version.
 * - Nav rows grouped under uppercase labels (Content / Structure / AI);
 *   sub-pages are ALWAYS visible as quiet indented rows — no disclosure
 *   chevrons to manage.
 * - Settings + View site sit at the bottom of the nav.
 * - Footer: ONE account row whose popover carries the identity, the language
 *   disclosure list (scales past 4 locales), the theme pills, and sign out —
 *   the same account-menu pattern as the PM dock.
 *
 * Layout lives entirely in this client component (the server layout gates auth
 * and passes the signed-in account down).
 */

export type SidebarAccount = { email: string; role: string | null };

type IconKey =
  | "home"
  | "pageBuilder"
  | "components"
  | "collections"
  | "dataSources"
  | "chatAgents"
  | "media"
  | "settings";

function NavIcon({ name }: { name: IconKey }) {
  const common = {
    width: 17,
    height: 17,
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
      return (
        <svg {...common}>
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
      );
    case "chatAgents":
      return (
        <svg {...common}>
          <path d="M12 8V4H8" />
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
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

const ExternalLinkIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/* ── Theme (3-way: light / system / dark) ─────────────────────────────────
 * Writes `data-theme` on <html> and persists to localStorage. globals.css keys
 * the dark palette off [data-theme="dark"] and the OS preference off
 * [data-theme="system"], so this just sets the attribute. */

type ThemeMode = "light" | "system" | "dark";
const THEME_KEY = "cms-theme";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

/** Label + compact pill group, rendered inside the account menu. */
function ThemePillsRow() {
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

  const options: ThemeMode[] = ["light", "system", "dark"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <span className="text-xs font-medium text-foreground-muted">{t("label")}</span>
      <div
        role="group"
        aria-label={t("label")}
        className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5"
      >
        {options.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => set(value)}
            className={
              "rounded-md px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
              (mode === value
                ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium text-foreground-muted hover:text-foreground")
            }
          >
            {t(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Language disclosure row + radio list — scales to any number of locales. */
function LanguageRow() {
  const t = useTranslations("locale");
  const activeLocale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function pick(code: (typeof locales)[number]) {
    setOpen(false);
    if (code === activeLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${code};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-1 flex items-center justify-between gap-3 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-xs font-medium text-foreground-muted">{t("label")}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          {localeNames[activeLocale as (typeof locales)[number]]}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={
              "text-foreground-muted transition-transform " + (open ? "rotate-180" : "")
            }
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          role="radiogroup"
          aria-label={t("label")}
          className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border bg-surface"
        >
          {locales.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={code === activeLocale}
              onClick={() => pick(code)}
              className={
                "flex shrink-0 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " +
                (code === activeLocale
                  ? "bg-primary-subtle font-semibold text-primary"
                  : "font-medium text-foreground hover:bg-surface-muted")
              }
            >
              {localeNames[code]}
              {code === activeLocale ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Account popover: identity, language, theme, sign out. Sign out POSTs
 * /api/auth/logout (deletes the D1 session row + clears the cookie) then
 * hard-navigates to /admin so the layout re-gates; hard nav drops client cache.
 */
function AccountMenu({ account }: { account: SidebarAccount }) {
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
    <div
      role="menu"
      aria-label={t("account")}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg"
    >
      <div className="flex flex-col items-start gap-1.5 border-b border-border px-4 py-3">
        <span className="max-w-full truncate text-sm font-medium text-foreground">
          {account.email}
        </span>
        {account.role ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {account.role}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
        <LanguageRow />
        <ThemePillsRow />
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-danger outline-none transition-colors hover:bg-danger-subtle focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        {t("logout")}
      </button>
    </div>
  );
}

/** "vali.draganescu88@…" → "VD"; single-segment locals fall back to 2 chars. */
function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const raw =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : local.slice(0, 2) || "?";
  return raw.toUpperCase();
}

/** Nav groups: label key (adminNav.groups.<label>) + section keys, in order. */
const NAV_GROUPS: { label: string | null; keys: string[] }[] = [
  { label: null, keys: ["home"] },
  { label: "content", keys: ["pageBuilder", "media"] },
  { label: "structure", keys: ["components", "collections", "dataSources"] },
  { label: "ai", keys: ["chatAgents"] },
];

const HOME_SECTION: AdminSection = { key: "home", href: "/admin" };

export function SidebarShell({
  account,
  children,
}: {
  account: SidebarAccount;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside pointerdown / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!footerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const sectionByKey = new Map<string, AdminSection>([
    [HOME_SECTION.key, HOME_SECTION],
    ...ADMIN_SECTIONS.map((s) => [s.key, s] as const),
  ]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  // A child link is exact-match (so the parent's Import/Export and its Develop
  // child don't both light up on /admin/components/develop).
  const isExact = (href: string) => pathname === href;

  const settings = ADMIN_SECTIONS.find((s) => s.key === "settings")!;

  function navRow(section: AdminSection) {
    const active = isActive(section.href);
    return (
      <div key={section.href}>
        <Link
          href={section.href}
          title={collapsed ? t(section.key) : undefined}
          aria-current={active ? "page" : undefined}
          className={
            "flex items-center rounded-md text-sm transition-colors " +
            (collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2") +
            " " +
            (active
              ? "bg-primary-subtle font-medium text-primary"
              : "text-foreground-muted hover:bg-surface-muted hover:text-foreground")
          }
        >
          <span className="shrink-0">
            <NavIcon name={section.key as IconKey} />
          </span>
          {!collapsed && t(section.key)}
        </Link>
        {/* Sub-pages: always visible (expanded sidebar only) — no chevrons. */}
        {!collapsed && section.children ? (
          <div className="mt-0.5 mb-1 ml-[19px] flex flex-col gap-0.5 border-l border-border pl-3">
            {section.children.map((child) => {
              const childActive = isExact(child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={
                    "rounded-md px-2.5 py-1.5 text-[13px] transition-colors " +
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
        ) : null}
      </div>
    );
  }

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
            "flex h-14 shrink-0 items-center border-b border-border " +
            (collapsed ? "justify-center px-0" : "gap-2.5 px-4")
          }
        >
          {!collapsed && (
            <Link href="/admin" className="flex min-w-0 flex-1 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static 5KB asset */}
              <img src="/icon.png" alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0" />
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {t("brand")}
                </span>
                {process.env.NEXT_PUBLIC_CMS_VERSION && (
                  <span className="font-mono text-[10px] text-foreground-muted">
                    v{process.env.NEXT_PUBLIC_CMS_VERSION}
                  </span>
                )}
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center justify-center rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
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

        {/* Nav: grouped rows; Settings + View site pinned at the bottom. */}
        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
          aria-label={t("brand")}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? "top"} className="flex flex-col gap-0.5">
              {group.label && !collapsed ? (
                <div className="px-2.5 pt-3.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-foreground-muted uppercase">
                  {t(`groups.${group.label}`)}
                </div>
              ) : null}
              {group.label && collapsed ? (
                <div aria-hidden="true" className="mx-3 my-2 h-px bg-border" />
              ) : null}
              {group.keys.map((key) => {
                const section = sectionByKey.get(key);
                return section ? navRow(section) : null;
              })}
            </div>
          ))}

          <div className="mt-auto flex flex-col gap-0.5 pt-3">
            {navRow(settings)}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? t("viewSite") : undefined}
              className={
                "flex items-center rounded-md text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground " +
                (collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2")
              }
            >
              <span className="shrink-0">
                <ExternalLinkIcon />
              </span>
              {!collapsed && t("viewSite")}
            </a>
          </div>
        </nav>

        {/* Footer: one account row; the popover carries language/theme/logout. */}
        <div ref={footerRef} className="relative shrink-0 border-t border-border p-3">
          {menuOpen ? (
            <div
              className={
                "absolute z-20 " +
                (collapsed
                  ? "bottom-2 left-full ml-2 w-72"
                  : "bottom-full left-3 right-3 mb-2")
              }
            >
              <AccountMenu account={account} />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("account")}
            className={
              "flex w-full items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
              (collapsed
                ? "justify-center px-0 py-1.5 hover:bg-surface-muted"
                : "gap-2.5 border border-border bg-surface px-2.5 py-2 hover:bg-surface-muted")
            }
          >
            <span
              className={
                "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                (menuOpen
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary-subtle text-primary")
              }
            >
              {initialsFromEmail(account.email)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left text-xs text-foreground">
                  {account.email}
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className={
                    "shrink-0 text-foreground-muted transition-transform " +
                    (menuOpen ? "rotate-180" : "")
                  }
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Intercom-style floating assistant on every admin page. */}
      <ChatWidget />
    </div>
  );
}
