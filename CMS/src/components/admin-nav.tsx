"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ADMIN_SECTIONS } from "@/components/admin-sections";

/**
 * Persistent admin nav rendered by the (already auth-guarded) /admin/layout.tsx,
 * so every admin page gets the same chrome. Marks the active link via the
 * current pathname (client-only — hence "use client"). Pure navigation, no data.
 */
export function AdminNav() {
  const t = useTranslations("adminNav");
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const links = [{ key: "home", href: "/admin" }, ...ADMIN_SECTIONS] as const;

  return (
    <nav className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/admin" className="mr-2 font-semibold text-foreground">
          {t("brand")}
        </Link>
        <ul className="flex flex-1 flex-wrap items-center gap-1">
          {links.map(({ key, href }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-foreground"
                      : "rounded-md px-3 py-1.5 text-sm text-foreground-muted hover:bg-surface hover:text-foreground"
                  }
                >
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
        <LocaleSwitcher />
      </div>
    </nav>
  );
}
