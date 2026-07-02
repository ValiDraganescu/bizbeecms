"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Tab bar linking the Settings sub-pages (content-locales / theme / brand). The
 * sidebar's single "Settings" link only lands on content-locales, so without
 * this the theme + brand pages were unreachable from the UI. Rendered at the top
 * of every settings page.
 */
const TABS = [
  { key: "contentLocales", href: "/admin/settings/content-locales" },
  { key: "theme", href: "/admin/settings/theme" },
  { key: "brand", href: "/admin/settings/brand" },
  { key: "apiKeys", href: "/admin/settings/api-keys" },
  { key: "users", href: "/admin/settings/users" },
  { key: "google", href: "/admin/settings/google" },
  { key: "openrouterKey", href: "/admin/settings/openrouter-key" },
  { key: "media", href: "/admin/settings/media" },
  { key: "iconSet", href: "/admin/settings/icon-set" },
  { key: "exportImport", href: "/admin/settings/export-import" },
] as const;

export function SettingsNav() {
  const t = useTranslations("settingsNav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={t("label")}>
      {TABS.map(({ key, href }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-t-md px-3 py-2 text-sm transition-colors " +
              (active
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-foreground-muted hover:text-foreground")
            }
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
