"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { SiteStatus } from "@/db/schema";
import type { CmsRelease } from "@/lib/deploy/cms-releases";
import {
  cmpSemverDesc,
  isUpdateAvailable,
  refForVersion,
} from "@/lib/deploy/cms-releases";
import { displayCmsVersion, parseCmsTag } from "@/lib/deploy/cms-version";
import { MAX_PARALLELISM, clampParallelism } from "@/lib/deploy/rollout-engine";
import type { RolloutPlanAction } from "@/lib/deploy/rollout-plan";
import { DeployStatusBadge } from "./deploy-status-badge";
import { RolloutCard, type RolloutData } from "./rollout-card";

/** Serializable row the server page passes down. */
export type SiteRow = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  status: SiteStatus;
  deployedCmsVersion: string | null;
  url: string | null;
};

type PreviewRow = {
  siteId: string;
  name: string;
  slug: string;
  from: string | null;
  action: RolloutPlanAction;
};

/** localStorage key hiding a finished/stopped rollout card after Dismiss. */
const DISMISSED_KEY = "bb_dismissed_rollout";
/** Matches the card's per-build estimate for the confirm dialog's total. */
const BUILD_MIN_ESTIMATE = 6.5;

/**
 * The Sites list table + fleet deploy (rollout) controls: per-row version
 * picker with Deploy/Redeploy, row selection with a bulk bar, the preflight
 * confirm modal, and the rollout monitor card. Server page stays the data
 * source; this component owns only interaction state and the rollout poll.
 */
export function SitesTable({
  sites,
  releases,
  latestVersion,
}: {
  sites: SiteRow[];
  releases: CmsRelease[];
  latestVersion: string | null;
}) {
  const t = useTranslations("sites");
  const tr = useTranslations("sites.rollout");
  const router = useRouter();

  // ---- selection ----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const headerCbRef = useRef<HTMLInputElement>(null);
  const allSelected = sites.length > 0 && selected.size === sites.length;
  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = selected.size > 0 && !allSelected;
    }
  }, [selected, allSelected]);

  const outdatedIds = useMemo(
    () =>
      sites
        .filter((s) => isUpdateAvailable(s.deployedCmsVersion, latestVersion))
        .map((s) => s.id),
    [sites, latestVersion],
  );

  // ---- fleet bar inputs ----
  const [version, setVersion] = useState(latestVersion ?? releases[0]?.version ?? "");
  const [parallelismInput, setParallelismInput] = useState("2");

  // ---- per-row version picks (default: latest) ----
  const [rowVersion, setRowVersion] = useState<Record<string, string>>({});
  const [rowPending, setRowPending] = useState<string | null>(null);

  // ---- error surface (deploy-route or rollout-route error keys) ----
  const [error, setError] = useState<{ ns: "deploy" | "rollout"; key: string } | null>(null);

  // ---- rollout state (shared by the card and the table rows) ----
  const [rolloutData, setRolloutData] = useState<RolloutData | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(DISMISSED_KEY),
  );
  const [controlBusy, setControlBusy] = useState(false);

  const loadRollout = useCallback(async () => {
    try {
      const res = await fetch("/api/rollouts/active");
      if (!res.ok) return;
      const data = (await res.json()) as { rollout: RolloutData["rollout"] | null } & Partial<RolloutData>;
      if (data.rollout && data.counts && data.items) {
        setRolloutData({ rollout: data.rollout, counts: data.counts, items: data.items });
      } else {
        setRolloutData(null);
      }
    } catch {
      // best-effort; keep the last good state
    }
  }, []);

  const rolloutActive =
    rolloutData !== null &&
    (rolloutData.rollout.status === "running" || rolloutData.rollout.status === "paused");

  useEffect(() => {
    void loadRollout();
  }, [loadRollout]);
  useEffect(() => {
    if (!rolloutActive) return;
    const id = setInterval(() => void loadRollout(), 3000);
    return () => clearInterval(id);
  }, [rolloutActive, loadRollout]);

  // A finishing rollout changed site statuses/versions server-side — refresh
  // the server snapshot once when the poll sees it leave the active states.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !rolloutActive) router.refresh();
    wasActive.current = rolloutActive;
  }, [rolloutActive, router]);

  const itemBySite = useMemo(() => {
    const map = new Map<string, RolloutData["items"][number]>();
    if (rolloutData && rolloutActive) {
      for (const item of rolloutData.items) map.set(item.siteId, item);
    }
    return map;
  }, [rolloutData, rolloutActive]);

  const siteNameById = useMemo(
    () => new Map(sites.map((s) => [s.id, s.name])),
    [sites],
  );

  // ---- preflight confirm modal ----
  const [preview, setPreview] = useState<{ version: string; rows: PreviewRow[] } | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [startPending, setStartPending] = useState(false);

  async function openPreview() {
    setError(null);
    setPreviewPending(true);
    try {
      const res = await fetch("/api/rollouts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteIds: [...selected], version }),
      });
      const data = (await res.json()) as { error?: string; version?: string; rows?: PreviewRow[] };
      if (res.ok && data.rows && data.version) {
        setPreview({ version: data.version, rows: data.rows });
      } else {
        setError({ ns: "rollout", key: data.error ?? "unknown" });
      }
    } catch {
      setError({ ns: "rollout", key: "unknown" });
    } finally {
      setPreviewPending(false);
    }
  }

  const startRollout = useCallback(
    async (siteIds: string[], targetVersion: string, parallelism: number) => {
      setError(null);
      setStartPending(true);
      try {
        const res = await fetch("/api/rollouts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteIds, version: targetVersion, parallelism }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError({ ns: "rollout", key: data.error ?? "unknown" });
          return false;
        }
        await loadRollout();
        router.refresh();
        return true;
      } catch {
        setError({ ns: "rollout", key: "unknown" });
        return false;
      } finally {
        setStartPending(false);
      }
    },
    [loadRollout, router],
  );

  async function confirmStart() {
    if (!preview) return;
    const parallelism = clampParallelism(parallelismInput) ?? 2;
    const ok = await startRollout(
      preview.rows.map((r) => r.siteId),
      preview.version,
      parallelism,
    );
    if (ok) {
      setPreview(null);
      setSelected(new Set());
    }
  }

  // ---- rollout card controls ----
  async function control(action: "pause" | "resume" | "stop") {
    if (!rolloutData) return;
    setControlBusy(true);
    try {
      await fetch(`/api/rollouts/${rolloutData.rollout.id}/${action}`, { method: "POST" });
      await loadRollout();
      if (action === "stop") router.refresh();
    } catch {
      setError({ ns: "rollout", key: "unknown" });
    } finally {
      setControlBusy(false);
    }
  }

  async function retryFailed() {
    if (!rolloutData) return;
    const failedIds = rolloutData.items
      .filter((i) => i.status === "failed")
      .map((i) => i.siteId);
    if (failedIds.length === 0) return;
    setControlBusy(true);
    try {
      const ok = await startRollout(
        failedIds,
        rolloutData.rollout.targetVersion,
        rolloutData.rollout.parallelism,
      );
      if (ok) dismissCard();
    } finally {
      setControlBusy(false);
    }
  }

  function dismissCard() {
    if (!rolloutData) return;
    localStorage.setItem(DISMISSED_KEY, rolloutData.rollout.id);
    setDismissedId(rolloutData.rollout.id);
  }

  // ---- per-row deploy ----
  async function deployRow(site: SiteRow) {
    setError(null);
    setRowPending(site.id);
    try {
      const chosen = rowVersion[site.id] ?? latestVersion ?? "";
      const res = await fetch(`/api/sites/${site.id}/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chosen ? { ref: refForVersion(chosen) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; accepted?: boolean };
      if (res.ok && data.accepted) {
        router.refresh();
      } else {
        setError({ ns: "deploy", key: data.error ?? "unknown" });
      }
    } catch {
      setError({ ns: "deploy", key: "unknown" });
    } finally {
      setRowPending(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showCard =
    rolloutData !== null &&
    (rolloutActive || rolloutData.rollout.id !== dismissedId);

  const deployableCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      {showCard && rolloutData ? (
        <RolloutCard
          data={rolloutData}
          siteNameById={siteNameById}
          busy={controlBusy || startPending}
          onPause={() => void control("pause")}
          onResume={() => void control("resume")}
          onStop={() => void control("stop")}
          onRetryFailed={() => void retryFailed()}
          onDismiss={dismissCard}
        />
      ) : null}
      {error ? (
        <Alert tone="danger">
          <AlertBody>
            {error.ns === "deploy" ? t(`deploy.errors.${error.key}`) : tr(`errors.${error.key}`)}
          </AlertBody>
        </Alert>
      ) : null}

      {/* Fleet bar — appears with a selection. */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <span className="text-sm font-semibold whitespace-nowrap">
            {tr("selected", { count: selected.size })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {tr("clear")}
          </Button>
          {outdatedIds.length > 0 ? (
            <button
              type="button"
              className="rounded-md text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSelected(new Set(outdatedIds))}
            >
              {tr("selectOutdated", { count: outdatedIds.length })}
            </button>
          ) : null}
          <span className="flex-1" />
          <label
            htmlFor="rollout-version"
            className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted"
          >
            {tr("versionLabel")}
          </label>
          <select
            id="rollout-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {releases.map((r) => (
              <option key={r.version} value={r.version}>
                {r.version}
              </option>
            ))}
          </select>
          <label
            htmlFor="rollout-parallelism"
            className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted"
          >
            {tr("parallelLabel")}
          </label>
          <input
            id="rollout-parallelism"
            type="number"
            min={1}
            max={MAX_PARALLELISM}
            value={parallelismInput}
            onChange={(e) => setParallelismInput(e.target.value)}
            className="h-8 w-14 rounded-md border border-border bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-[11px] text-foreground-muted whitespace-nowrap">
            {tr("maxParallel", { max: MAX_PARALLELISM })}
          </span>
          <Button
            size="sm"
            loading={previewPending}
            disabled={rolloutActive || releases.length === 0}
            title={rolloutActive ? tr("errors.alreadyRunning") : undefined}
            onClick={() => void openPreview()}
          >
            {tr("deployCount", { count: deployableCount })}
          </Button>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-9 pr-0">
              <input
                ref={headerCbRef}
                type="checkbox"
                aria-label={tr("selectAll")}
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(sites.map((s) => s.id)))
                }
                className="h-4 w-4 accent-[var(--color-primary)] align-middle"
              />
            </TableHead>
            <TableHead>{t("list.name")}</TableHead>
            <TableHead>{t("list.slug")}</TableHead>
            <TableHead>{t("list.country")}</TableHead>
            <TableHead>{t("list.status")}</TableHead>
            <TableHead>{t("list.cmsVersion")}</TableHead>
            <TableHead>{tr("deployColumn")}</TableHead>
            <TableHead className="text-right">{t("list.open")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            const item = itemBySite.get(site.id);
            const inRollout = item?.status === "queued" || item?.status === "building";
            const currentTag = parseCmsTag(site.deployedCmsVersion ?? "");
            const display = displayCmsVersion(site.deployedCmsVersion);
            const rowBusy =
              rowPending === site.id || site.status === "deploying" || inRollout;
            return (
              <TableRow
                key={site.id}
                className={selected.has(site.id) ? "bg-primary-subtle/40" : undefined}
              >
                <TableCell className="pr-0">
                  <input
                    type="checkbox"
                    aria-label={site.name}
                    checked={selected.has(site.id)}
                    onChange={() => toggle(site.id)}
                    className="h-4 w-4 accent-[var(--color-primary)] align-middle"
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/sites/${site.id}`}
                    className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {site.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-foreground-muted">
                  {site.slug}
                </TableCell>
                <TableCell>{site.country ?? t("list.global")}</TableCell>
                <TableCell>
                  {item?.status === "queued" ? (
                    <Badge tone="info">{tr("queuedBadge")}</Badge>
                  ) : (
                    <DeployStatusBadge siteId={site.id} initialStatus={site.status} />
                  )}
                </TableCell>
                <TableCell>
                  {display ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-xs tabular-nums">{display}</span>
                      {isUpdateAvailable(site.deployedCmsVersion, latestVersion) ? (
                        <Badge tone="warning" dot title={t("list.cmsUpdateAvailable")}>
                          {t("list.cmsUpdateAvailable")}
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-muted">
                      {t("list.cmsVersionNone")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {releases.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={tr("versionLabel")}
                        value={rowVersion[site.id] ?? latestVersion ?? ""}
                        onChange={(e) =>
                          setRowVersion((prev) => ({ ...prev, [site.id]: e.target.value }))
                        }
                        disabled={rowBusy}
                        className="h-8 rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {releases.map((r) => (
                          <option
                            key={r.version}
                            value={r.version}
                            // Per-row upgrade rule: strictly older than the
                            // site's current tag is not offered (equal = rebuild).
                            disabled={
                              currentTag !== null &&
                              cmpSemverDesc(r.version, currentTag) > 0
                            }
                          >
                            {r.version}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={rowPending === site.id}
                        disabled={rowBusy}
                        onClick={() => void deployRow(site)}
                      >
                        {site.deployedCmsVersion || site.status !== "draft"
                          ? tr("rowRedeploy")
                          : tr("rowDeploy")}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-foreground-muted">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {site.url ? (
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("list.open")}
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-foreground-muted">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {preview ? (
        <ConfirmRolloutModal
          version={preview.version}
          rows={preview.rows}
          parallelism={clampParallelism(parallelismInput) ?? 2}
          pending={startPending}
          onCancel={() => setPreview(null)}
          onConfirm={() => void confirmStart()}
        />
      ) : null}
    </div>
  );
}

/**
 * Preflight confirm — the per-Site plan before anything runs. Same in-app
 * modal pattern as the release-notes modal (never a native dialog).
 */
function ConfirmRolloutModal({
  version,
  rows,
  parallelism,
  pending,
  onCancel,
  onConfirm,
}: {
  version: string;
  rows: PreviewRow[];
  parallelism: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tr = useTranslations("sites.rollout");

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
    [onCancel],
  );
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const deployRows = rows.filter(
    (r) => r.action === "install" || r.action === "upgrade" || r.action === "move_to_tag",
  );
  const etaMin = Math.max(
    1,
    Math.round(Math.ceil(deployRows.length / parallelism) * BUILD_MIN_ESTIMATE),
  );

  const actionBadge = (row: PreviewRow) => {
    switch (row.action) {
      case "install":
        return <Badge tone="info">{tr("action.install")}</Badge>;
      case "upgrade":
        return <Badge tone="neutral">{tr("action.upgrade")}</Badge>;
      case "move_to_tag":
        return <Badge tone="info">{tr("action.move_to_tag")}</Badge>;
      case "skip_up_to_date":
        return <Badge tone="neutral">{tr("action.skip_up_to_date")}</Badge>;
      case "skip_newer":
        return <Badge tone="warning">{tr("action.skip_newer", { version })}</Badge>;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr("confirmTitle", { version })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold leading-tight">
            {tr("confirmTitle", { version })}
          </h2>
          <p className="text-sm text-foreground-muted">
            {tr("confirmSummary", {
              total: rows.length,
              deploy: deployRows.length,
              skip: rows.length - deployRows.length,
              parallelism,
              minutes: etaMin,
            })}
          </p>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          <div className="rounded-lg border border-border">
            {rows.map((row) => {
              const skipped = row.action.startsWith("skip");
              return (
                <div
                  key={row.siteId}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm font-medium ${skipped ? "text-foreground-muted" : ""}`}
                    >
                      {row.name}
                    </div>
                    <div className="font-mono text-xs text-foreground-muted">{row.slug}</div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-xs text-foreground-muted">
                    {skipped
                      ? tr("alreadyOn", { version: row.from ?? version })
                      : `${row.from ?? tr("fromNotDeployed")} → ${version}`}
                  </span>
                  {actionBadge(row)}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[13px] text-foreground-muted">
            {tr("confirmQueueNote", { parallelism })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {tr("cancel")}
          </Button>
          <Button
            loading={pending}
            disabled={deployRows.length === 0}
            onClick={onConfirm}
          >
            {tr("start", { count: deployRows.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
