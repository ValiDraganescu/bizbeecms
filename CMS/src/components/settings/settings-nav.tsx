"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Settings sub-sidebar — a page-builder-style second rail with GROUPED links
 * to every settings page, rendered ONCE by the settings layout (content on the
 * right). Replaces the old top tab bar. Groups: Site (locales, export/import),
 * Appearance (theme, brand, icons), AI (OpenRouter key, AI models, MCP API
 * keys — all AI integration & management), Access (users, Google sign-in).
 */
const GROUPS = [
  {
    key: "site",
    items: [
      { key: "contentLocales", href: "/admin/settings/content-locales" },
      { key: "robots", href: "/admin/settings/robots" },
      { key: "redirects", href: "/admin/settings/redirects" },
      { key: "exportImport", href: "/admin/settings/export-import" },
    ],
  },
  {
    key: "appearance",
    items: [
      { key: "theme", href: "/admin/settings/theme" },
      { key: "brand", href: "/admin/settings/brand" },
      { key: "iconSet", href: "/admin/settings/icon-set" },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "openrouterKey", href: "/admin/settings/openrouter-key" },
      { key: "media", href: "/admin/settings/media" },
      { key: "apiKeys", href: "/admin/settings/api-keys" },
    ],
  },
  {
    key: "access",
    items: [
      { key: "users", href: "/admin/settings/users" },
      { key: "google", href: "/admin/settings/google" },
    ],
  },
] as const;

export function SettingsNav() {
  const t = useTranslations("settingsNav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="flex-1 space-y-4 overflow-y-auto p-3">
      {GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <span className="mb-1 px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
            {t(`groups.${group.key}`)}
          </span>
          {group.items.map(({ key, href }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (active
                    ? "bg-primary-subtle font-medium text-foreground"
                    : "text-foreground-muted hover:bg-surface-muted hover:text-foreground")
                }
              >
                {t(key)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
