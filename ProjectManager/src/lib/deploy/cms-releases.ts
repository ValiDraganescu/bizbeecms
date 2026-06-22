/**
 * Pure helpers for the CMS version picker (cms-releases Slice 5).
 *
 * The deployer's `GET /tags` returns `{tags:[{version,tag}]}` (newest-first) and
 * `GET /release-notes?version=` returns `{version, markdown}`. These normalisers
 * defend the PM proxy against a malformed/empty deployer response so the picker
 * never renders junk refs. No Cloudflare/db deps → node-testable.
 */

export type CmsRelease = { version: string; tag: string };

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const TAG_RE = /^cms-v\d+\.\d+\.\d+$/;

/** `[1,2,3]` from `"1.2.3"`. */
function semverParts(v: string): [number, number, number] {
  const [a, b, c] = v.split(".").map((n) => Number(n));
  return [a, b, c];
}

/** Descending semver: newer first. */
function cmpSemverDesc(a: string, b: string): number {
  const pa = semverParts(a);
  const pb = semverParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/**
 * Normalise the deployer's `/tags` payload into a clean, newest-first list of
 * valid `cms-v<x.y.z>` releases. Drops anything whose `version` isn't a bare
 * semver or whose `tag` isn't a `cms-v*` tag, de-dupes by version, and re-sorts
 * (don't trust the upstream order). `main` is never a release here — TAGGED
 * RELEASES ONLY (USER DECISION).
 */
export function normalizeReleases(payload: unknown): CmsRelease[] {
  const raw =
    payload && typeof payload === "object" && Array.isArray((payload as { tags?: unknown }).tags)
      ? ((payload as { tags: unknown[] }).tags)
      : [];

  const seen = new Set<string>();
  const out: CmsRelease[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { version, tag } = item as { version?: unknown; tag?: unknown };
    if (typeof version !== "string" || typeof tag !== "string") continue;
    if (!SEMVER_RE.test(version) || !TAG_RE.test(tag)) continue;
    if (seen.has(version)) continue;
    seen.add(version);
    out.push({ version, tag });
  }
  out.sort((a, b) => cmpSemverDesc(a.version, b.version));
  return out;
}

/** The `cms-v<x.y.z>` ref to deploy for a chosen bare version. */
export function refForVersion(version: string): string {
  return `cms-v${version}`;
}
