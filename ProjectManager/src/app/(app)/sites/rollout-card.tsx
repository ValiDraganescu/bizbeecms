"use client";

import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import type { RolloutItemStatus, RolloutStatus } from "@/db/schema";
import { BREAKER_LIMIT } from "@/lib/deploy/rollout-engine";
import type { RolloutCounts } from "@/lib/deploy/rollout-engine";

/** Wire shapes from GET /api/rollouts/active (dates arrive as strings). */
export type RolloutWire = {
  id: string;
  status: RolloutStatus;
  targetVersion: string;
  parallelism: number;
  consecutiveFailures: number;
  startedAt: string;
  finishedAt: string | null;
};
export type RolloutItemWire = {
  siteId: string;
  status: RolloutItemStatus;
  position: number;
  skipReason: string | null;
  error: string | null;
};
export type RolloutData = {
  rollout: RolloutWire;
  counts: RolloutCounts;
  items: RolloutItemWire[];
};

/** A real CMS build runs ~6–7 min; used for the coarse time-left estimate. */
const BUILD_MIN_ESTIMATE = 6.5;

const statusTone = {
  running: "primary",
  paused: "warning",
  stopped: "neutral",
  finished: "success",
} as const;

/**
 * The rollout monitor above the Sites table (fleet-deploy): progress, counts,
 * the circuit-breaker notice, and the Pause/Resume/Stop/Retry/Dismiss actions.
 * Pure presentation — polling and the POSTs live in SitesTable, which owns the
 * shared rollout state the table rows also read.
 */
export function RolloutCard({
  data,
  siteNameById,
  busy,
  onPause,
  onResume,
  onStop,
  onRetryFailed,
  onDismiss,
}: {
  data: RolloutData;
  siteNameById: Map<string, string>;
  /** True while a control POST is in flight — disables all actions. */
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("sites.rollout");
  const { rollout, counts, items } = data;

  const runs =
    counts.building + counts.queued + counts.deployed + counts.failed + counts.cancelled;
  const done = counts.deployed + counts.failed + counts.cancelled;
  const remaining = counts.building + counts.queued;
  const etaMin = Math.max(
    1,
    Math.round(Math.ceil(remaining / rollout.parallelism) * BUILD_MIN_ESTIMATE),
  );
  const progressPct = runs === 0 ? 100 : Math.round((done / runs) * 100);
  const active = rollout.status === "running" || rollout.status === "paused";
  const breakerTripped =
    rollout.status === "paused" && rollout.consecutiveFailures >= BREAKER_LIMIT;
  const failedItems = items.filter((i) => i.status === "failed");

  return (
    <Card>
      <div className="flex items-center gap-3 px-5 pt-5 pb-1">
        <CardTitle>{t("cardTitle", { version: rollout.targetVersion })}</CardTitle>
        <Badge tone={statusTone[rollout.status]}>{t(`status.${rollout.status}`)}</Badge>
        <span className="flex-1" />
        {rollout.status === "paused" ? (
          <Button size="sm" disabled={busy} onClick={onResume}>
            {t("resume")}
          </Button>
        ) : null}
        {rollout.status === "running" ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onPause}>
            {t("pause")}
          </Button>
        ) : null}
        {active ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onStop}>
            {t("stop")}
          </Button>
        ) : null}
        {!active ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
            {t("dismiss")}
          </Button>
        ) : null}
      </div>
      <div className="px-5 pb-5 flex flex-col gap-3">
        <CardDescription>
          {t("summaryLine", {
            parallelism: rollout.parallelism,
            version: rollout.targetVersion,
          })}
        </CardDescription>

        {breakerTripped ? (
          <Alert tone="warning">
            <AlertTitle>{t("breakerTitle", { count: rollout.consecutiveFailures })}</AlertTitle>
            <AlertBody>{t("breakerBody")}</AlertBody>
          </Alert>
        ) : rollout.status === "paused" ? (
          <Alert tone="info">
            <AlertBody>{t("pausedBody")}</AlertBody>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">{t("progress", { done, total: runs })}</span>
          {rollout.status === "running" && remaining > 0 ? (
            <span className="text-foreground-muted">{t("etaLeft", { minutes: etaMin })}</span>
          ) : null}
        </div>
        <div
          className="h-2 rounded-full bg-surface-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={runs}
          aria-valuenow={done}
        >
          <div
            className={`h-2 rounded-full ${breakerTripped ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {counts.building > 0 ? (
            <Badge tone="primary">{t("counts.building", { count: counts.building })}</Badge>
          ) : null}
          {counts.queued > 0 ? (
            <Badge tone="info">{t("counts.queued", { count: counts.queued })}</Badge>
          ) : null}
          {counts.deployed > 0 ? (
            <Badge tone="success">{t("counts.deployed", { count: counts.deployed })}</Badge>
          ) : null}
          {counts.failed > 0 ? (
            <Badge tone="danger">{t("counts.failed", { count: counts.failed })}</Badge>
          ) : null}
          {counts.skipped > 0 ? (
            <Badge tone="neutral">{t("counts.skipped", { count: counts.skipped })}</Badge>
          ) : null}
          {counts.cancelled > 0 ? (
            <Badge tone="neutral">{t("counts.cancelled", { count: counts.cancelled })}</Badge>
          ) : null}
        </div>

        {/* Failure detail + retry once nothing more will change on its own. */}
        {!active && failedItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
              {t("failedLabel")}
            </span>
            <div className="rounded-lg border border-border">
              {failedItems.map((item) => (
                <div
                  key={item.siteId}
                  className="flex flex-col gap-1 border-b border-border px-4 py-2.5 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {siteNameById.get(item.siteId) ?? item.siteId}
                    </span>
                    <span className="flex-1" />
                    <Badge tone="danger">{t("status.failedItem")}</Badge>
                  </div>
                  {item.error ? (
                    <pre className="m-0 max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-danger-subtle p-2 font-mono text-xs text-danger">
                      {item.error}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy} onClick={onRetryFailed}>
                {t("retryFailed", { count: failedItems.length })}
              </Button>
            </div>
          </div>
        ) : null}

        {active ? (
          <p className="m-0 text-xs text-foreground-muted">
            {t("stopNote", { version: rollout.targetVersion })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
