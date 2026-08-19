"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, cn } from "@/components/ui";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { locales, LOCALE_COOKIE } from "@/i18n/routing";

export type DockItemId = "sites" | "users" | "settings" | "tags";
export type DockItem = { id: DockItemId; href: string; label: string };

const THEMES: Theme[] = ["light", "system", "dark"];

/**
 * The app's only navigation chrome: a floating pill dock (md+, bottom-center)
 * that becomes a full-width bottom tab bar on phones. There is no top bar —
 * pages own the whole viewport; the (app) layout pads the bottom so the dock
 * never covers the last row of content. Account utilities (email, role,
 * language, theme, sign out) live behind the avatar in a popover / sheet.
 */
export function AppDock({
  items,
  email,
  roleLabel,
  version,
}: {
  items: DockItem[];
  email: string;
  roleLabel: string;
  /** PM app version (package.json), shown in the account menu header. */
  version: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const t = useTranslations("app.nav");

  // Close the account menu on outside pointerdown / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !dockRef.current?.contains(target) &&
        !barRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
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

  // Close the menu when navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const initials = initialsFromEmail(email);

  return (
    <>
      {/* md+: floating dock, bottom-center */}
      <nav
        ref={dockRef}
        aria-label={t("label")}
        className="fixed bottom-5 left-1/2 z-40 hidden -translate-x-1/2 md:block"
      >
        {menuOpen ? (
          <div className="absolute bottom-full right-0 mb-2">
            <AccountMenu email={email} roleLabel={roleLabel} version={version} />
          </div>
        ) : null}
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface-raised/90 p-1.5 shadow-lg backdrop-blur-md">
          <Link
            href="/"
            aria-label={t("home")}
            className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static 5KB asset, no optimization needed */}
            <img src="/icon.png" alt="" width={28} height={28} className="h-7 w-7" />
          </Link>
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full px-4 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isActive(item.href)
                  ? "bg-primary-subtle font-semibold text-primary"
                  : "font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <DockIcon id={item.id} size={18} />
              {item.label}
            </Link>
          ))}
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("account")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              menuOpen
                ? "bg-primary text-primary-foreground"
                : "bg-primary-subtle text-primary hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {initials}
          </button>
        </div>
      </nav>

      {/* < md: full-width bottom tab bar */}
      <nav
        ref={barRef}
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-muted pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {menuOpen ? (
          <div className="absolute inset-x-2 bottom-full mb-2">
            <AccountMenu email={email} roleLabel={roleLabel} version={version} />
          </div>
        ) : null}
        <div className="flex h-16 items-stretch">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                isActive(item.href)
                  ? "text-primary"
                  : "text-foreground-muted",
              )}
            >
              <DockIcon id={item.id} size={20} />
              <span
                className={cn(
                  "text-[10px]",
                  isActive(item.href) ? "font-semibold" : "font-medium",
                )}
              >
                {item.label}
              </span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              menuOpen ? "text-primary" : "text-foreground-muted",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                menuOpen
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary-subtle text-primary",
              )}
            >
              {initials}
            </span>
            <span
              className={cn(
                "text-[10px]",
                menuOpen ? "font-semibold" : "font-medium",
              )}
            >
              {t("you")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

/**
 * Account popover / sheet: identity on top, then language + theme segmented
 * pills, then sign out. Replaces the old inline email + combobox + segmented
 * theme toggle + button row from the top bar.
 */
function AccountMenu({
  email,
  roleLabel,
  version,
}: {
  email: string;
  roleLabel: string;
  version: string;
}) {
  const t = useTranslations("app.nav");
  const tTheme = useTranslations("theme");
  const tLocale = useTranslations("locale");
  const tAuth = useTranslations("auth");
  const { theme, setTheme } = useTheme();
  const activeLocale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  function pickLocale(code: (typeof locales)[number]) {
    if (code === activeLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${code};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — a stale cookie is cleared on the next visit.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      role="menu"
      aria-label={t("account")}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg md:w-80"
    >
      <div className="flex items-center gap-2.5 border-b border-border bg-surface-muted px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static 5KB asset, no optimization needed */}
        <img
          src="/icon.png"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0"
        />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {t("product")}
            </span>
            <span className="font-mono text-[10px] text-foreground-muted">
              v{version}
            </span>
          </span>
          <span className="truncate text-xs text-foreground-muted">
            {t("productApp")}
          </span>
        </span>
      </div>
      <div className="flex flex-col items-start gap-1.5 border-b border-border px-4 py-3">
        <span className="max-w-full truncate text-sm font-medium text-foreground">
          {email}
        </span>
        <Badge tone="primary">{roleLabel}</Badge>
      </div>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-xs font-medium text-foreground-muted">
            {tLocale("label")}
          </span>
          <div
            role="group"
            aria-label={tLocale("label")}
            className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5"
          >
            {locales.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === activeLocale}
                onClick={() => pickLocale(code)}
                title={tLocale(code)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  code === activeLocale
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "font-medium text-foreground-muted hover:text-foreground",
                )}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-xs font-medium text-foreground-muted">
            {tTheme("label")}
          </span>
          <div
            role="group"
            aria-label={tTheme("label")}
            className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5"
          >
            {THEMES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  theme === value
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "font-medium text-foreground-muted hover:text-foreground",
                )}
              >
                {tTheme(value)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
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
        {tAuth("signOut")}
      </button>
    </div>
  );
}

/** "vali.draganescu88@…" → "VD"; single-segment locals fall back to 2 chars. */
function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const raw =
    parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`
      : local.slice(0, 2) || "?";
  return raw.toUpperCase();
}

function DockIcon({ id, size }: { id: DockItemId; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "sites":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "tags":
      return (
        <svg {...common}>
          <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
          <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
        </svg>
      );
  }
}
