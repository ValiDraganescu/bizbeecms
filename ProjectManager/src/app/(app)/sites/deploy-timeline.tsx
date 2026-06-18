"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui";
import type { DeployEventStatus, SiteStatus } from "@/db/schema";
import { collapseDeployEvents } from "@/lib/deploy/deploy-events";

/** A deploy event as it arrives over JSON (Date columns serialize to ISO strings). */
type WireEvent = {
  id: string;
  step: string;
  status: DeployEventStatus;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
  ramAvailableMb: number | null;
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

function fmtDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Live timeline of a Site's deploy steps (deploy-audit-trail). Fetches the
 * user-authed `/api/sites/<id>/deploy-events` trail and, while the Site is
 * `deploying`, polls it every 5s until the status resolves (REST + fetch — no
 * websockets, matches the deploy-form's poll). Each row shows step, start time,
 * duration, and — for a failed step (incl. the terminal `callback` row that
 * carries the final deployer error + log tail) — the error text.
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy-events`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        status: SiteStatus;
        events: WireEvent[];
      };
      setEvents(data.events);
      setStatus(data.status);
    } catch {
      // best-effort; keep showing what we had
    } finally {
      setLoaded(true);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while the deploy is genuinely in flight.
  useEffect(() => {
    if (status !== "deploying") return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [status, load]);

  if (loaded && events.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("empty")}</p>;
  }

  // Each step emits two raw events (started + ok/failed); collapse to one row.
  const rows = collapseDeployEvents(events);

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((e) => {
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
