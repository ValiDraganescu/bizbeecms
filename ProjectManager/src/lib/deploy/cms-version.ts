/**
 * Pure helpers for the deployed-CMS-version (cms-releases Slice 3).
 *
 * The deployer clones `--branch "$REF"` and echoes that ref back in the success
 * callback as `deployedRef`. PM stores it on `sites.deployedCmsVersion`. These
 * helpers normalise the ref into what we persist + how we display it, with zero
 * Cloudflare/db deps so they're node-testable.
 */

/** An `r-<x.y.z>` (or retired `cms-v<x.y.z>`) tag → its bare `x.y.z`, else null. */
export function parseCmsTag(ref: string): string | null {
  const m = /^(?:r-|cms-v)(\d+\.\d+\.\d+)$/.exec(ref.trim());
  return m ? m[1] : null;
}

/**
 * What to persist from a callback's `deployedRef`. We only record a value the
 * deployer actually deployed from; `main` (or anything non-tag) is recorded
 * verbatim so the UI can still show "deployed from main". Empty/absent → null
 * (don't clobber an existing version with nothing). The string is length-capped
 * to keep a malformed ref from bloating the row.
 */
export function deployedVersionFromCallback(deployedRef: unknown): string | null {
  if (typeof deployedRef !== "string") return null;
  const ref = deployedRef.trim();
  if (!ref) return null;
  // Same charset the deployer validates a ref against (`^[\w.\-/]+$`); reject
  // anything else rather than store junk.
  if (!/^[\w.\-/]+$/.test(ref)) return null;
  return ref.slice(0, 80);
}

/**
 * How to label a stored `deployedCmsVersion` in the UI. A `cms-v<x.y.z>` tag
 * shows as `x.y.z`; any other ref (e.g. `main`) shows verbatim; null/empty → null
 * so the caller can render its own "not deployed" placeholder.
 */
export function displayCmsVersion(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return parseCmsTag(stored) ?? stored;
}
