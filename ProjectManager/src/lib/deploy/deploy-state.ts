import type { Site, SiteStatus } from "@/db/schema";

/**
 * Pure deploy state-machine predicates — NO drizzle / env / Cloudflare imports,
 * so they're unit-testable under `node --test` (like worker-name.ts). The
 * stateful orchestration that uses them lives in deploy.ts.
 */

/** Statuses from which a deploy may be (re)started. */
const DEPLOYABLE_FROM: SiteStatus[] = ["draft", "deployed", "failed"];

/**
 * A deploy stuck in `deploying` longer than this is treated as dead — the
 * container almost certainly died (or its callback never fired), since a real
 * build is ~3 min. Past this the UI flags it stuck and a restart is allowed.
 * ponytail: a fixed threshold, not per-site config — bump the constant if real
 * builds ever approach it.
 */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

/** Whether a `deploying` Site has been in-flight long enough to be considered stuck. */
export function isDeployStuck(
  site: Pick<Site, "status" | "deployStartedAt">,
  now: number = Date.now(),
): boolean {
  if (site.status !== "deploying") return false;
  // No start stamp = a pre-instrumentation deploy; treat as stuck so it's recoverable.
  if (!site.deployStartedAt) return true;
  return now - site.deployStartedAt.getTime() > STUCK_AFTER_MS;
}

/**
 * Grace on top of the effective build timeout before PM force-fails a
 * `deploying` row (deploy-timeout-reaper). The container self-reports ~15s
 * BEFORE its hard cap (watchdog in the deployer build script); if PM has still
 * heard nothing this long AFTER the cap, the callback is lost (SIGKILLed
 * container, dropped POST — there are no retries), so the row can never
 * resolve on its own and the server should fail it.
 */
export const REAP_GRACE_MS = 2 * 60 * 1000;

/**
 * Whether a `deploying` Site has outlived its own build timeout + grace and
 * should be force-failed by the server (not just badged "stuck" in the UI).
 * `effectiveTimeoutMin` = effectiveBuildTimeoutMin(global, per-site override) —
 * passed in so this stays pure. A missing start stamp is NOT reaped (age
 * unknown); isDeployStuck already lets a human restart those.
 */
export function shouldReapDeploy(
  site: Pick<Site, "status" | "deployStartedAt">,
  effectiveTimeoutMin: number,
  now: number = Date.now(),
): boolean {
  if (site.status !== "deploying" || !site.deployStartedAt) return false;
  return (
    now - site.deployStartedAt.getTime() >
    effectiveTimeoutMin * 60_000 + REAP_GRACE_MS
  );
}

/**
 * Whether a Site is in a state a deploy can start from. A clean `draft`/
 * `deployed`/`failed` always can; a `deploying` site can too once it's stale
 * (the original deploy is dead), so a stuck deploy can be restarted instead of
 * being wedged forever by the concurrent-deploy guard.
 */
export function canStartDeploy(
  site: Pick<Site, "status" | "deployStartedAt">,
  now: number = Date.now(),
): boolean {
  if (DEPLOYABLE_FROM.includes(site.status)) return true;
  return isDeployStuck(site, now);
}
