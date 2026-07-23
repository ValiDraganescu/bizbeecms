// Pure, dependency-free helpers for the /delete-site teardown endpoint —
// loadable by `node --test` (same convention as origin-core.ts). The stateful
// teardown that calls the Cloudflare API lives in index.ts.

// Same conservative shapes index.ts enforces for /deploy and /attach-domain.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Mirror of the WORKER_PREFIX in index.ts / the deploy build script — the
// per-Site resource names are all derived from it + the slug.
export const WORKER_PREFIX = "bizbeecms-cms-";

export type DeleteSitePlan = {
  /** The slug the per-Site resources were named after (see resource note). */
  resourceSlug: string;
  /** Cloudflare Worker script to delete. */
  workerName: string;
  /** Per-Site D1 database name (deploy script: `bizbeecms-cms-$SLUG`). */
  dbName: string;
  /** Per-Site R2 media bucket (deploy script: `bizbeecms-cms-media-$SLUG`). */
  bucketName: string;
  /** Custom hostnames to deregister (CF-for-SaaS) + drop from HOST_MAP. */
  hostnames: string[];
};

/**
 * Validate a /delete-site body and derive the full per-Site resource plan.
 *
 * Resource note: a Site's slug can be RENAMED in PM after a deploy, but the
 * deployed Worker/D1/R2 keep the names derived from the slug at deploy time.
 * `sites.workerName` records the actually-deployed Worker name, so when PM
 * sends it we strip WORKER_PREFIX and name every resource after THAT slug;
 * only a never-deployed Site falls back to the current slug.
 */
export function parseDeleteSiteBody(
  body: unknown,
):
  | { ok: true; value: DeleteSitePlan }
  | { ok: false; error: "badRequest" } {
  const bag = (body ?? {}) as Record<string, unknown>;

  const slug = String(bag.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) return { ok: false, error: "badRequest" };

  let resourceSlug = slug;
  if (bag.workerName != null && String(bag.workerName).trim() !== "") {
    const workerName = String(bag.workerName).trim();
    if (
      !workerName.startsWith(WORKER_PREFIX) ||
      !SLUG_RE.test(workerName.slice(WORKER_PREFIX.length))
    ) {
      return { ok: false, error: "badRequest" };
    }
    resourceSlug = workerName.slice(WORKER_PREFIX.length);
  }

  const rawHosts = Array.isArray(bag.hostnames) ? bag.hostnames : [];
  const hostnames: string[] = [];
  for (const h of rawHosts) {
    const hostname = String(h ?? "").trim().toLowerCase();
    if (!HOSTNAME_RE.test(hostname)) return { ok: false, error: "badRequest" };
    hostnames.push(hostname);
  }

  return {
    ok: true,
    value: {
      resourceSlug,
      // Same 63-char cap wrangler enforces on deploy (index.ts startDeploy).
      workerName: `${WORKER_PREFIX}${resourceSlug}`.slice(0, 63),
      dbName: `${WORKER_PREFIX}${resourceSlug}`,
      bucketName: `bizbeecms-cms-media-${resourceSlug}`,
      hostnames: [...new Set(hostnames)],
    },
  };
}

/** Teardown step outcomes: ok/skipped pass; partial/failed mean retry. */
export type TeardownResults = Record<string, string>;

/** A teardown succeeded iff every step is "ok" or "skipped". */
export function teardownOk(results: TeardownResults): boolean {
  return Object.values(results).every((r) => r === "ok" || r === "skipped");
}
