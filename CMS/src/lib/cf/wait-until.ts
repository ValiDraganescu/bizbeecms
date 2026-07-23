/**
 * Run best-effort background work SAFELY on Cloudflare Workers.
 *
 * A promise merely left dangling (`.catch(() => {})`) is cancelled when the
 * response settles — on Workers "fire-and-forget" silently becomes
 * "fire-and-maybe-never" for anything that outlives the request (usage
 * metering, cache purges, notifications). `ctx.waitUntil` keeps the isolate
 * alive until the work settles; without a CF context (local dev, node tests)
 * the promise is simply left to settle on its own.
 *
 * Callers own their error handling — pass work that never rejects, or accept
 * that a rejection is swallowed only in the no-context branch.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Run `work` after the response flushes when a CF ctx exists; else inline. */
export function waitUntilOrInline(work: Promise<unknown>): void {
  try {
    const { ctx } = getCloudflareContext();
    (ctx as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(work);
  } catch {
    void work; // no CF context (local dev / tests) — let it settle; errors are the caller's.
  }
}
