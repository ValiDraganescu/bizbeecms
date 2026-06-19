/**
 * deploy-audit-trail: ingest of per-step deploy events.
 *
 * The detached deployer bash script POSTs one event at the start and end of
 * each deploy step. This module holds the dep-free validation + the DB insert
 * behind an injected-Db seam (mirrors the CMS binding-adapters store pattern),
 * so the insert is unit-testable against a fake D1 without a Cloudflare binding.
 * The route handler (`/api/deploy-events`) does auth + wiring only.
 */
// Relative .ts paths (not the `@/` alias) so the dep-free `node --test` suite
// can type-strip and import this module without a bundler resolving aliases.
// Import schema from schema.ts directly (db/index.ts pulls in
// @opennextjs/cloudflare and has extensionless re-exports node can't resolve).
import { and, asc, desc, eq, lt } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import type { Db } from "../../db/index.ts";
import type {
  DeployEvent,
  DeployEventStatus,
  NewDeployEvent,
} from "../../db/schema.ts";

const STATUSES: readonly DeployEventStatus[] = ["started", "ok", "failed"];

/**
 * Service-to-service auth check, identical semantics to deploy-callback: the
 * `DEPLOYER_SECRET` env must be a non-empty string and exactly match the bearer
 * token. Pure, so the reject path is node-testable without a request.
 */
export function isAuthorized(secret: unknown, bearer: string): boolean {
  return typeof secret === "string" && secret.length > 0 && bearer === secret;
}

/** A validated event ready to insert (sans id/createdAt, which we fill in). */
export type ParsedDeployEvent = {
  siteId: string;
  // One id per deploy run (the deployer mints a UUID per invocation). Null only
  // for pre-0004 rows / a deployer that doesn't send one.
  deployId: string | null;
  step: string;
  status: DeployEventStatus;
  startedAt: number;
  durationMs: number | null;
  error: string | null;
  ramAvailableMb: number | null;
};

function asNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Validate an untrusted request body into a ParsedDeployEvent, or return a
 * reason string if it's invalid. Pure — no I/O — so it's node-testable.
 * Required: non-empty siteId, step, a valid status, and a finite startedAt (ms).
 */
export function parseDeployEvent(
  body: unknown,
): { ok: true; event: ParsedDeployEvent } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  const siteId = typeof b.siteId === "string" ? b.siteId.trim() : "";
  if (!siteId) return { ok: false, reason: "siteId required" };

  const step = typeof b.step === "string" ? b.step.trim() : "";
  if (!step) return { ok: false, reason: "step required" };

  const status = b.status;
  if (typeof status !== "string" || !STATUSES.includes(status as DeployEventStatus)) {
    return { ok: false, reason: "status must be started|ok|failed" };
  }

  const startedAt = Number(b.startedAt);
  if (!Number.isFinite(startedAt)) {
    return { ok: false, reason: "startedAt required (ms)" };
  }

  const error =
    typeof b.error === "string" && b.error.length > 0 ? b.error : null;

  const deployId =
    typeof b.deployId === "string" && b.deployId.trim().length > 0
      ? b.deployId.trim()
      : null;

  return {
    ok: true,
    event: {
      siteId,
      deployId,
      step,
      status: status as DeployEventStatus,
      startedAt: Math.trunc(startedAt),
      durationMs: asNullableInt(b.durationMs),
      error,
      ramAvailableMb: asNullableInt(b.ramAvailableMb),
    },
  };
}

/**
 * Build the terminal "callback" failed event the deploy-callback persists when
 * the deployer reports an overall `failed`. The per-step trail already captures
 * each step's short error (slice 2); this is the FINAL deployer-reported error +
 * build-log tail, persisted so the UI can read it instead of it living only in
 * `wrangler tail`. Pure (caller passes `now`) so it's node-testable.
 * `step: "callback"` distinguishes it from the per-step rows in the trail.
 */
export function buildFailedCallbackEvent(
  siteId: string,
  error: unknown,
  log: unknown,
  now: number,
  deployId: unknown,
): ParsedDeployEvent {
  const errText = typeof error === "string" && error.length > 0 ? error : "(no error)";
  const logText = typeof log === "string" && log.length > 0 ? log : null;
  const combined = logText ? `${errText}\n--- log tail ---\n${logText}` : errText;
  return {
    siteId,
    deployId:
      typeof deployId === "string" && deployId.trim().length > 0
        ? deployId.trim()
        : null,
    step: "callback",
    status: "failed",
    startedAt: now,
    durationMs: null,
    error: combined,
    ramAvailableMb: null,
  };
}

/**
 * One collapsed timeline row: the per-step pair (started + ok/failed) folded
 * into a single entry the UI renders once. `status` is the latest seen for the
 * step (started → still Running; ok/failed → finished). `durationMs` comes from
 * the terminal event if it carried one, else falls back to the started event's.
 */
export type TimelineRow = {
  id: string;
  deployId: string | null;
  step: string;
  status: DeployEventStatus;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
  ramAvailableMb: number | null;
};

/**
 * Keep only the LATEST deploy run's events, fixing the bug where a fresh deploy
 * rendered interleaved with the previous (failed) run's rows. The latest run is
 * the `deployId` of the event with the greatest `startedAt`; ties keep the
 * later position (events arrive oldest-first). Events sharing that deployId are
 * returned in their original order. Pure — no I/O — so it's node-testable.
 *
 * Pre-0004 rows have `deployId: null`; they all share the same null group, so a
 * site whose only events predate the migration still shows them as one run.
 */
export function selectLatestRun(events: readonly TimelineRow[]): TimelineRow[] {
  if (events.length === 0) return [];
  // Find the run id of the most-recently-started event. Iterate forward so a
  // tie on startedAt resolves to the later (last-wins) event's run.
  let latestId = events[0].deployId;
  let latestAt = Date.parse(events[0].startedAt);
  for (const e of events) {
    const at = Date.parse(e.startedAt);
    // NaN-safe: an unparseable date never wins over a real one.
    if (!Number.isNaN(at) && (Number.isNaN(latestAt) || at >= latestAt)) {
      latestAt = at;
      latestId = e.deployId;
    }
  }
  return events.filter((e) => e.deployId === latestId);
}

/**
 * Collapse the raw chronological event trail (two rows per step: a `started`
 * then an `ok`/`failed`) into one row per `step`, fixing the bug where the
 * timeline rendered each step twice. Pure — no I/O — so it's node-testable.
 *
 * - Events MUST arrive oldest-first (the read API orders by startedAt,createdAt).
 * - Step order is preserved by first-seen.
 * - Within a step, later events overwrite status/duration/error/ram, but a null
 *   value never clobbers a previously-set one (the `started` row's startedAt/ram
 *   survives when the terminal row omits them).
 * - `id` is the first event's id (stable React key across polls).
 */
export function collapseDeployEvents(events: readonly TimelineRow[]): TimelineRow[] {
  const byStep = new Map<string, TimelineRow>();
  for (const e of events) {
    const prev = byStep.get(e.step);
    if (!prev) {
      byStep.set(e.step, { ...e });
      continue;
    }
    byStep.set(e.step, {
      id: prev.id,
      deployId: prev.deployId,
      step: prev.step,
      startedAt: prev.startedAt,
      status: e.status,
      durationMs: e.durationMs ?? prev.durationMs,
      error: e.error ?? prev.error,
      ramAvailableMb: e.ramAvailableMb ?? prev.ramAvailableMb,
    });
  }
  return [...byStep.values()];
}

/**
 * Format an elapsed millisecond span as a compact `WWs` / `XmZZs` string for the
 * deploy progress badge: under a minute → whole seconds (`8s`); a minute or more
 * → `<m>m<ss>s` zero-padded (`1m05s`). Negative/NaN clamps to `0s`.
 */
export function fmtElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

export type DeployProgress = {
  /** Current (still-running) step's name, or null if none is in flight. */
  currentStep: string | null;
  /** Elapsed ms of the current step (now − its startedAt). */
  currentMs: number;
  /** Elapsed ms of the whole run (now − the first step's startedAt). */
  totalMs: number;
};

/**
 * Compute live deploy progress from the LATEST run's collapsed step rows and a
 * `now` timestamp. `currentMs` ticks the in-flight (`started`) step; `totalMs`
 * spans from the run's first step. Returns null when there's nothing in flight
 * (no rows, or every step already resolved). Pure — `now` is injected so it's
 * node-testable and resume-safe.
 */
export function deployProgress(
  collapsedRows: readonly TimelineRow[],
  now: number,
): DeployProgress | null {
  if (collapsedRows.length === 0) return null;

  const firstStart = collapsedRows.reduce((min, r) => {
    const at = Date.parse(r.startedAt);
    return Number.isNaN(at) ? min : Math.min(min, at);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(firstStart)) return null;

  // The in-flight step is the last one still in `started` (steps arrive ordered).
  const running = [...collapsedRows].reverse().find((r) => r.status === "started");
  if (!running) return null;

  const stepStart = Date.parse(running.startedAt);
  return {
    currentStep: running.step,
    currentMs: Number.isNaN(stepStart) ? 0 : Math.max(0, now - stepStart),
    totalMs: Math.max(0, now - firstStart),
  };
}

/**
 * Insert one validated deploy event. `injectedDb` is the test seam; production
 * callers omit it and get the live D1-bound drizzle client.
 */
export async function insertDeployEvent(
  event: ParsedDeployEvent,
  injectedDb?: Db,
): Promise<void> {
  // Lazy-resolve the live client only when no test db is injected, so the
  // unit test path never loads `@opennextjs/cloudflare`.
  const db = injectedDb ?? (await (await import("../../db/index.ts")).getDb());
  const row: NewDeployEvent = {
    id: crypto.randomUUID(),
    siteId: event.siteId,
    deployId: event.deployId,
    step: event.step,
    status: event.status,
    startedAt: new Date(event.startedAt),
    durationMs: event.durationMs,
    error: event.error,
    ramAvailableMb: event.ramAvailableMb,
  };
  await db.insert(schema.deployEvents).values(row);
}

/**
 * List a Site's deploy events in chronological order (oldest first) so the UI
 * can render them as a top-to-bottom timeline. `injectedDb` is the test seam;
 * production callers omit it and get the live D1-bound drizzle client.
 */
export async function listDeployEventsForSite(
  siteId: string,
  injectedDb?: Db,
): Promise<DeployEvent[]> {
  const db = injectedDb ?? (await (await import("../../db/index.ts")).getDb());
  return db
    .select()
    .from(schema.deployEvents)
    .where(eq(schema.deployEvents.siteId, siteId))
    .orderBy(asc(schema.deployEvents.startedAt), asc(schema.deployEvents.createdAt));
}

/** Default + max page size for the deploy-events trail. A run is ~12 rows, so 50
 * comfortably holds the latest run on the first page; 200 caps a hostile limit. */
export const DEPLOY_EVENTS_PAGE_DEFAULT = 50;
export const DEPLOY_EVENTS_PAGE_MAX = 200;

/** Clamp a caller-supplied `limit` into [1, MAX], defaulting when absent/invalid. */
export function clampPageLimit(raw: number | null): number {
  if (raw === null || !Number.isFinite(raw) || raw < 1) {
    return DEPLOY_EVENTS_PAGE_DEFAULT;
  }
  return Math.min(Math.floor(raw), DEPLOY_EVENTS_PAGE_MAX);
}

export type DeployEventsPage = {
  /** The page's events in chronological (oldest-first) order for the timeline. */
  events: DeployEvent[];
  /**
   * Cursor for the NEXT (older) page — the `createdAt` epoch (ms) of the oldest
   * row returned; pass it back as `before`. Null when no older rows remain.
   */
  nextCursor: number | null;
};

/**
 * One page of a Site's deploy events, newest deploys first. We fetch newest-first
 * (so the freshest run is always on page 1), `limit + 1` to detect whether older
 * rows exist, then return the page re-sorted oldest-first for top-to-bottom
 * rendering. `before` (a `createdAt` ms epoch) walks backward in time.
 *
 * `createdAt` is the cursor key — monotonic insert order, stable under ties on
 * `startedAt`. `injectedDb` is the test seam.
 */
export async function listDeployEventsPaged(
  siteId: string,
  opts: { limit?: number | null; before?: number | null } = {},
  injectedDb?: Db,
): Promise<DeployEventsPage> {
  const db = injectedDb ?? (await (await import("../../db/index.ts")).getDb());
  const limit = clampPageLimit(opts.limit ?? null);
  const before = opts.before ?? null;

  const where =
    before !== null
      ? and(
          eq(schema.deployEvents.siteId, siteId),
          lt(schema.deployEvents.createdAt, new Date(before)),
        )
      : eq(schema.deployEvents.siteId, siteId);

  const rows = await db
    .select()
    .from(schema.deployEvents)
    .where(where)
    // Newest first for paging; +1 row tells us if another page follows.
    .orderBy(desc(schema.deployEvents.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  // Oldest row of THIS page is the cursor for the next (older) page.
  const nextCursor =
    hasMore && page.length > 0
      ? page[page.length - 1].createdAt.getTime()
      : null;

  // Return oldest-first so the timeline renders top-to-bottom.
  page.reverse();
  return { events: page, nextCursor };
}
