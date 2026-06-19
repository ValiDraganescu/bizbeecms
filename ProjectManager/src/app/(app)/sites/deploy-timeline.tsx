"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone, Button } from "@/components/ui";
import type { DeployEventStatus, SiteStatus } from "@/db/schema";
import {
  groupRunsByDeployId,
  runTotalDurationMs,
  fmtElapsed,
  type DeployRun,
} from "@/lib/deploy/deploy-events";

/** A deploy event as it arrives over JSON (Date columns serialize to ISO strings). */
type WireEvent = {
  id: string;
  deployId: string | null;
  step: string;
  status: DeployEventStatus;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
  ramAvailableMb: number | null;
};

type PageResponse = {
  status: SiteStatus;
  events: WireEvent[];
  nextCursor: number | null;
};

const statusTone: Record<DeployEventStatus, BadgeTone> = {
  started: "primary",
  ok: "success",
  failed: "danger",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

function fmtTimeMs(ms: number): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function fmtDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** One deploy run's collapsed steps, rendered as a vertical list. */
function RunSteps({
  steps,
  t,
}: {
  steps: DeployRun["steps"];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((e) => {
        const duration = fmtDuration(e.durationMs);
        return (
          <li
            key={e.id}
            className="flex flex-col gap-1 border-l-2 border-border pl-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.step}</span>
              <Badge tone={statusTone[e.status]}>{t(`status.${e.status}`)}</Badge>
              <span className="text-xs tabular-nums text-foreground-muted">
                {fmtTime(e.startedAt)}
              </span>
              {duration ? (
                <span className="text-xs tabular-nums text-foreground-muted">
                  · {duration}
                </span>
              ) : null}
              {e.ramAvailableMb !== null ? (
                <span className="text-xs tabular-nums text-foreground-muted">
                  · {t("ram", { mb: e.ramAvailableMb })}
                </span>
              ) : null}
            </div>
            {e.status === "failed" && e.error ? (
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-danger-subtle p-2 font-mono text-xs text-danger">
                {e.error}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Live timeline of a Site's deploy steps (deploy-audit-trail). The CURRENT run
 * (page 1) polls every 5s while the Site is `deploying`. Below it, a "Show
 * previous deployments" pager walks backward through the paged events API
 * (`?before=<cursor>`), grouping each older run by deployId so the full deploy
 * history is browseable on demand without ever shipping it all at once.
 */
export function DeployTimeline({
  siteId,
  initialStatus,
}: {
  siteId: string;
  initialStatus: SiteStatus;
}) {
  const t = useTranslations("sites.timeline");
  const [events, setEvents] = useState<WireEvent[]>([]);
  const [status, setStatus] = useState<SiteStatus>(initialStatus);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null); // next-older page cursor
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Page 1: newest run(s). Re-fetched on poll while deploying.
  const loadFirst = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-events`);
      if (!res.ok) return;
      const data = (await res.json()) as PageResponse;
      setStatus(data.status);
      // Keep any older pages already loaded; replace only the first page's range
      // by merging on id (first page is always the newest events).
      setEvents((prev) => mergeById(data.events, prev));
      // Only seed the cursor the first time so "show previous" continues correctly.
      setCursor((c) => (c === null && !exhausted ? data.nextCursor : c));
    } catch {
      // best-effort; keep showing what we had
    } finally {
      setLoaded(true);
    }
  }, [siteId, exhausted]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  // Poll only while the deploy is genuinely in flight.
  useEffect(() => {
    if (status !== "deploying") return;
    const id = setInterval(() => void loadFirst(), 5000);
    return () => clearInterval(id);
  }, [status, loadFirst]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/deploy-events?before=${cursor}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as PageResponse;
      setEvents((prev) => mergeById(prev, data.events));
      setCursor(data.nextCursor);
      if (data.nextCursor === null) setExhausted(true);
    } catch {
      // best-effort
    } finally {
      setLoadingMore(false);
    }
  }, [siteId, cursor, loadingMore]);

  if (loaded && events.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("empty")}</p>;
  }

  const runs = groupRunsByDeployId(events);
  const [current, ...previous] = runs;
  const currentTotal = current ? runTotalDurationMs(current.steps) : null;

  return (
    <div className="flex flex-col gap-6">
      {current ? (
        <div className="flex flex-col gap-3">
          {currentTotal !== null ? (
            <p className="text-xs tabular-nums text-foreground-muted">
              {t("total", { duration: fmtElapsed(currentTotal) })}
            </p>
          ) : null}
          <RunSteps steps={current.steps} t={t} />
        </div>
      ) : null}

      {previous.length > 0 ? (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          {previous.map((run) => (
            <details
              key={run.deployId ?? `legacy-${run.startedAt}`}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-foreground-muted">
                <span className="transition-transform group-open:rotate-90">›</span>
                {t("runAt", { time: fmtTimeMs(run.startedAt) })}
                <Badge tone={statusTone[runStatus(run)]}>
                  {t(`status.${runStatus(run)}`)}
                </Badge>
                {runTotalDurationMs(run.steps) !== null ? (
                  <span className="tabular-nums">
                    · {fmtElapsed(runTotalDurationMs(run.steps)!)}
                  </span>
                ) : null}
              </summary>
              <div className="mt-3 pl-4">
                <RunSteps steps={run.steps} t={t} />
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {!exhausted && cursor !== null ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadMore()}
          loading={loadingMore}
          className="self-start"
        >
          {t("showPrevious")}
        </Button>
      ) : exhausted ? (
        <p className="text-xs text-foreground-muted">{t("noMore")}</p>
      ) : null}
    </div>
  );
}

/** The overall status of a run: failed if any step failed, started if any still
 * running, else ok. */
function runStatus(run: DeployRun): DeployEventStatus {
  if (run.steps.some((s) => s.status === "failed")) return "failed";
  if (run.steps.some((s) => s.status === "started")) return "started";
  return "ok";
}

/** Merge two event lists by id, keeping `a` first (newer) then `b`'s unseen. */
function mergeById(a: WireEvent[], b: WireEvent[]): WireEvent[] {
  const seen = new Set(a.map((e) => e.id));
  return [...a, ...b.filter((e) => !seen.has(e.id))];
}
