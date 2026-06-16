"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Combobox, type DefaultOption } from "@/components/ui";
import { localeNames, locales, LOCALE_COOKIE } from "@/i18n/routing";

/**
 * Locale switcher for the PM admin UI (fixed set EN/FI/ET). Cookie-based: it
 * writes the chosen locale to the NEXT_LOCALE cookie and refreshes so the server
 * re-renders with the new messages. URLs stay locale-agnostic.
 *
 * (When/if the app moves to /[locale] path routing, swap this for the
 * locale-aware router's `replace(pathname, { locale })` — see i18n/routing.ts.)
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const options: DefaultOption[] = locales.map((code) => ({
    id: code,
    label: localeNames[code],
  }));
  const value = options.find((o) => o.id === activeLocale) ?? null;

  return (
    <div className="w-36">
      <Combobox
        aria-labelledby="locale-switcher-label"
        options={options}
        value={value}
        searchable={false}
        disabled={isPending}
        onChange={(next) => {
          if (!next || next.id === activeLocale) return;
          // Persist for ~1 year; refresh re-renders the tree server-side.
          document.cookie = `${LOCALE_COOKIE}=${next.id};path=/;max-age=31536000;samesite=lax`;
          startTransition(() => {
            router.refresh();
          });
        }}
        placeholder={t("label")}
      />
      <span id="locale-switcher-label" className="sr-only">
        {t("label")}
      </span>
    </div>
  );
}
