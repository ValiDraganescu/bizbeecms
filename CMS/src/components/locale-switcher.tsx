"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localeNames, locales, LOCALE_COOKIE } from "@/i18n/routing";

/**
 * Admin-UI locale switcher for the CMS (fixed set EN/FI/ET). Cookie-based: it
 * writes the chosen locale to the NEXT_LOCALE cookie and refreshes so the server
 * re-renders with the new messages. URLs stay locale-agnostic.
 *
 * ponytail: native <select> — the CMS is the default Next install with no UI
 * component library; add a styled Combobox if/when the CMS grows a design system.
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
      <span style={{ fontSize: "0.85rem", color: "#666" }}>{t("label")}</span>
      <select
        aria-label={t("label")}
        value={activeLocale}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          if (next === activeLocale) return;
          // Persist for ~1 year; refresh re-renders the tree server-side.
          document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
