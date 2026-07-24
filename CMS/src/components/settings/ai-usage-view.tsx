"use client";

/**
 * AI credits & usage view (ai-usage-settings-page) — renders everything from
 * the ONE `GET /api/ai-usage/summary` call:
 *
 *  - credits hero: allocated / used / remaining when a quota exists, a clear
 *    "no quota allocated" state otherwise — month-to-date spend shows either way,
 *  - all-time billable total,
 *  - last-30-days bar chart (today highlighted) + today's spend figure,
 *  - current month per-purpose breakdown,
 *  - a note that daily/per-purpose history accrues from this release.
 *
 * Read-only: no mutations, so a failed section just shows its "unavailable"
 * line (the route degrades per-section, never 500s). Copy via next-intl
 * (EN/FI/ET); purpose-token Tailwind utilities only.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AiPurpose } from "@/lib/ai-config/types";
import { formatUsdAmount } from "@/lib/ai-usage/summary";
import { formatUsd } from "@/lib/public-chat/core";

interface Summary {
  quotaUsd: number | null;
  month: { month: string; billableUsd: number };
  allTimeUsd: number | null;
  days: Array<{ day: string; usd: number }> | null;
  purposes: Array<{ purpose: AiPurpose; usd: number }> | null;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-foreground-muted">{label}</span>
      <span className="text-xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function AiUsageView() {
  const t = useTranslations("aiUsage");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-usage/summary");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Summary;
        if (!cancelled) setSummary(j);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-foreground-muted">{t("loading")}</p>;
  if (error || !summary) {
    return (
      <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
        {t("error")}
      </p>
    );
  }

  const { quotaUsd, month, allTimeUsd, days, purposes } = summary;
  const today = days?.[days.length - 1] ?? null;
  const maxDayUsd = days ? Math.max(...days.map((d) => d.usd), 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Credits hero — the same numbers the quota gate enforces on. */}
      <Card title={t("hero.title", { month: month.month })}>
        {quotaUsd === null ? (
          <div className="flex flex-col gap-2">
            <Figure label={t("hero.used")} value={`$${formatUsd(month.billableUsd)}`} />
            <p className="text-sm text-foreground-muted">{t("hero.noQuota")}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-8">
            <Figure label={t("hero.allocated")} value={`$${formatUsd(quotaUsd)}`} />
            <Figure label={t("hero.used")} value={`$${formatUsd(month.billableUsd)}`} />
            {/* Never negative: an overshooting in-flight turn reads as "$0 left". */}
            <Figure
              label={t("hero.remaining")}
              value={`$${formatUsd(Math.max(0, Math.round((quotaUsd - month.billableUsd) * 100) / 100))}`}
            />
          </div>
        )}
      </Card>

      {/* All-time billable total across every metered month. */}
      <Card title={t("allTime.title")}>
        {allTimeUsd === null ? (
          <p className="text-sm text-foreground-muted">{t("unavailable")}</p>
        ) : (
          <span className="text-xl font-semibold text-foreground">
            {formatUsdAmount(allTimeUsd)}
          </span>
        )}
      </Card>

      {/* Last 30 days, oldest first, today highlighted. */}
      <Card title={t("daily.title")}>
        {!days || !today ? (
          <p className="text-sm text-foreground-muted">{t("unavailable")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Figure label={t("daily.today")} value={formatUsdAmount(today.usd)} />
            <div className="flex h-24 items-end gap-px" role="img" aria-label={t("daily.chartLabel")}>
              {days.map((d, i) => (
                <div
                  key={d.day}
                  title={`${d.day} — ${formatUsdAmount(d.usd)}`}
                  className={
                    "flex-1 rounded-t-sm " +
                    (i === days.length - 1 ? "bg-primary" : "bg-primary-subtle")
                  }
                  style={{
                    // A metered day always shows at least a sliver; 0 stays flat.
                    height:
                      maxDayUsd > 0 && d.usd > 0
                        ? `${Math.max(4, (d.usd / maxDayUsd) * 100)}%`
                        : "2px",
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-foreground-muted">
              <span>{days[0].day}</span>
              <span>{today.day}</span>
            </div>
          </div>
        )}
      </Card>

      {/* This month, per purpose. */}
      <Card title={t("purposes.title", { month: month.month })}>
        {!purposes ? (
          <p className="text-sm text-foreground-muted">{t("unavailable")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {purposes.map(({ purpose, usd }) => (
              <li key={purpose} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-foreground">{t(`purposes.${purpose}`)}</span>
                <span className="font-medium text-foreground">{formatUsdAmount(usd)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-foreground-muted">{t("accrualNote")}</p>
    </div>
  );
}
