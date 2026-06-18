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
import * as schema from "../../db/schema.ts";
import type { Db } from "../../db/index.ts";
import type { DeployEventStatus, NewDeployEvent } from "../../db/schema.ts";

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

  return {
    ok: true,
    event: {
      siteId,
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
    step: event.step,
    status: event.status,
    startedAt: new Date(event.startedAt),
    durationMs: event.durationMs,
    error: event.error,
    ramAvailableMb: event.ramAvailableMb,
  };
  await db.insert(schema.deployEvents).values(row);
}
