"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui";
import type { DeployEventStatus, SiteStatus } from "@/db/schema";
import {
  collapseDeployEvents,
  deployProgress,
  fmtElapsed,
  selectLatestRun,
  type TimelineRow,
} from "@/lib/deploy/deploy-events";

type WireEvent = {
  id: string;
  deployId: string | null;
  step: string;
  status: DeployEventStatus;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
  ramAvailableMb: number | null;
  // Always null/absent in this view — the `?latest=1` API strips log rows — but
  // the shape must satisfy TimelineRow for collapseDeployEvents/selectLatestRun.
  logChunk: string | null;
  seq: number | null;
};

const statusTone: Record<SiteStatus, BadgeTone> = {
  draft: "neutral",
  deploying: "primary",
  deployed: "success",
  failed: "danger",
};

/**
 * Site status badge for the Sites list. For a non-deploying Site it's just the
 * static status pill. While `deploying`, it polls the deploy-events trail and
 * shows live progress as `<step> WWs/ZZs` (current-step elapsed / total elapsed),
 * a 1s clock ticking between 2s polls. WWs becomes XmZZs past a minute. When the
 * deploy resolves, it swaps to the final status without a page refresh.
 */
export function DeployStatusBadge({
  siteId,
  initialStatus,
}: {
  siteId: string;
  initialStatus: SiteStatus;
}) {
  const t = useTranslations("sites");
  const [status, setStatus] = useState<SiteStatus>(initialStatus);
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-events?latest=1`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: SiteStatus; events: WireEvent[] };
      setStatus(data.status);
      setRows(collapseDeployEvents(selectLatestRun(data.events)));
    } catch {
      // best-effort; keep the last good state
    }
  }, [siteId]);

  // Poll the trail (2s) AND tick a 1s clock — only while deploying.
  useEffect(() => {
    if (status !== "deploying") return;
    void load();
    const poll = setInterval(() => void load(), 2000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [status, load]);

  if (status !== "deploying") {
    return <Badge tone={statusTone[status]}>{t(`status.${status}`)}</Badge>;
  }

  const progress = deployProgress(rows, now);
  return (
    <Badge tone="primary">
      <span className="inline-flex items-center gap-1.5">
        {t("status.deploying")}
        {progress ? (
          <span className="tabular-nums font-normal opacity-80">
            {progress.currentStep} {fmtElapsed(progress.currentMs)}/
            {fmtElapsed(progress.totalMs)}
          </span>
        ) : null}
      </span>
    </Badge>
  );
}
