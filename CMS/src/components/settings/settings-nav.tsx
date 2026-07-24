"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Settings sub-sidebar — a page-builder-style second rail with GROUPED links
 * to every settings page, rendered ONCE by the settings layout (content on the
 * right). Replaces the old top tab bar. Groups: Site (locales, redirects, 404,
 * export/import), SEO & Crawlers (SEO audit, robots/llms.txt, verification,
 * bot rate limiting), Appearance (theme, brand, icons), AI (usage, AI models,
 * assistant chats, MCP API keys), Access (users, Google sign-in).
 */
const GROUPS = [
  {
    key: "site",
    items: [
      { key: "contentLocales", href: "/admin/settings/content-locales" },
      { key: "redirects", href: "/admin/settings/redirects" },
      { key: "notFoundPage", href: "/admin/settings/not-found-page" },
      { key: "exportImport", href: "/admin/settings/export-import" },
    ],
  },
  {
    key: "seoCrawlers",
    items: [
      { key: "seoAudit", href: "/admin/settings/seo-audit" },
      { key: "robots", href: "/admin/settings/robots" },
      { key: "llms", href: "/admin/settings/llms" },
      { key: "verification", href: "/admin/settings/verification" },
      { key: "rateLimit", href: "/admin/settings/rate-limit" },
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
      { key: "aiUsage", href: "/admin/settings/ai-usage" },
      { key: "media", href: "/admin/settings/media" },
      { key: "assistantChats", href: "/admin/settings/assistant" },
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
