"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  formatUsd,
  formatUsdFromNano,
  isDriftSignificant,
  usageRatio,
  type FleetSiteUsage,
  type FleetTotals,
} from "@/lib/ai/usage";

type FleetUsageResponse = {
  sites: FleetSiteUsage[];
  totals: FleetTotals;
  poolUsd: number | null;
};

/**
 * Per-site billable spend vs quota, the fleet total vs the credit pool, and the
 * metered-vs-OpenRouter drift (the tripwire for a metering bug). Polls
 * /api/settings/ai-usage ONCE on mount — this is an operator report, not a live
 * meter, and each load fans out to every Site's Worker.
 *
 * All arithmetic and formatting come from @/lib/ai/usage; this component only
 * decides what to render.
 */
export function FleetUsageTable() {
  const t = useTranslations("settings.aiUsage");
  const [data, setData] = useState<FleetUsageResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/ai-usage");
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const body = (await res.json()) as FleetUsageResponse;
        if (!cancelled) {
          setData(body);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <p className="text-sm text-foreground-muted">{t("loading")}</p>;
  }
  if (state === "error" || !data) {
    return (
      <Alert tone="danger">
        <AlertBody>{t("loadError")}</AlertBody>
      </Alert>
    );
  }
  if (data.sites.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("empty")}</p>;
  }

  const { totals, poolUsd } = data;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Summary label={t("totals.billable")} value={formatUsdFromNano(totals.billableNanoUsd)} />
        <Summary
          label={t("totals.pool")}
          value={poolUsd == null ? t("noPool") : formatUsd(poolUsd)}
          hint={
            totals.poolRatio == null
              ? undefined
              : t("totals.poolUsed", { percent: percent(totals.poolRatio) })
          }
        />
        <Summary label={t("totals.quotas")} value={formatUsd(totals.quotaUsd)} />
        <Summary
          label={t("totals.reporting")}
          value={String(totals.reporting)}
          hint={
            totals.unreachable > 0
              ? t("totals.unreachableCount", { count: totals.unreachable })
              : undefined
          }
        />
      </dl>

      {totals.poolRatio != null && totals.poolRatio >= 1 ? (
        <Alert tone="warning">
          <AlertBody>{t("poolExceeded")}</AlertBody>
        </Alert>
      ) : null}

      {totals.driftAlerts > 0 ? (
        <Alert tone="warning">
          <AlertBody>{t("driftAlert", { count: totals.driftAlerts })}</AlertBody>
        </Alert>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.site")}</TableHead>
            <TableHead>{t("columns.month")}</TableHead>
            <TableHead>{t("columns.billable")}</TableHead>
            <TableHead>{t("columns.quota")}</TableHead>
            <TableHead>{t("columns.raw")}</TableHead>
            <TableHead>{t("columns.openRouter")}</TableHead>
            <TableHead>{t("columns.drift")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.sites.map((site) => (
            <TableRow key={site.siteId}>
              <TableCell>
                <span className="font-medium">{site.name}</span>
                <span className="ml-2 font-mono text-xs text-foreground-muted">{site.slug}</span>
              </TableCell>
              {site.state === "unreachable" ? (
                <TableCell colSpan={6}>
                  <Badge tone="warning" dot>
                    {t("unreachable")}
                  </Badge>
                </TableCell>
              ) : (
                <SiteCells site={site} t={t} />
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations>;

function SiteCells({
  site,
  t,
}: {
  site: Extract<FleetSiteUsage, { state: "ok" }>;
  t: Translate;
}) {
  const ratio = usageRatio(site.usage.billableNanoUsd, site.usage.quotaUsd);
  const { drift } = site;

  return (
    <>
      <TableCell className="font-mono text-xs text-foreground-muted">
        {site.usage.month || "—"}
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          {formatUsdFromNano(site.usage.billableNanoUsd)}
          {ratio != null && ratio >= 1 ? (
            <Badge tone="danger" dot>
              {t("overQuota")}
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        {site.usage.quotaUsd == null ? (
          <span className="text-foreground-muted">{t("noQuota")}</span>
        ) : (
          <>
            {formatUsd(site.usage.quotaUsd)}
            {ratio != null ? (
              <span className="ml-1.5 text-foreground-muted">({percent(ratio)}%)</span>
            ) : null}
          </>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        {formatUsdFromNano(site.usage.rawNanoUsd)}
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        {drift ? (
          formatUsdFromNano(drift.openRouterNanoUsd)
        ) : (
          <span className="text-foreground-muted">{t("noKey")}</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">
        {drift ? (
          <span className="inline-flex items-center gap-1.5">
            {signedUsdFromNano(drift.driftNanoUsd)}
            {isDriftSignificant(drift) ? (
              <Badge tone="warning" dot>
                {t("driftFlag")}
              </Badge>
            ) : null}
          </span>
        ) : (
          <span className="text-foreground-muted">—</span>
        )}
      </TableCell>
    </>
  );
}

function Summary({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-foreground-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-foreground">{value}</dd>
      {hint ? <p className="text-xs text-foreground-muted">{hint}</p> : null}
    </div>
  );
}

/** Drift is signed — an explicit `+` keeps "they billed more" readable at a glance. */
function signedUsdFromNano(nanoUsd: number): string {
  const magnitude = formatUsdFromNano(Math.abs(nanoUsd));
  if (nanoUsd === 0) return magnitude;
  return `${nanoUsd > 0 ? "+" : "−"}${magnitude}`;
}

function percent(ratio: number): string {
  return (ratio * 100).toFixed(1);
}
