/**
 * Pure helpers for the CMS version picker (cms-releases Slice 5).
 *
 * The deployer's `GET /tags` returns `{tags:[{version,tag}]}` (newest-first) and
 * `GET /release-notes?version=` returns `{version, markdown}`. These normalisers
 * defend the PM proxy against a malformed/empty deployer response so the picker
 * never renders junk refs. No Cloudflare/db deps → node-testable.
 */

import { parseCmsTag } from "./cms-version.ts";

export type CmsRelease = { version: string; tag: string };

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
// Current scheme is `r-<x.y.z>` (`r` = release); legacy `cms-v<x.y.z>` tags are
// retired but still accepted so already-deployed sites resolve.
const TAG_RE = /^(?:r-|cms-v)\d+\.\d+\.\d+$/;

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
 * valid releases. Drops anything whose `version` isn't a bare semver or whose
 * `tag` isn't an `r-*` (or retired `cms-v*`) tag, de-dupes by version, and re-sorts
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

/** The `r-<x.y.z>` ref to deploy for a chosen bare version (current scheme). */
export function refForVersion(version: string): string {
  return `r-${version}`;
}

/**
 * Slice 6 — is a newer CMS release available than what a site runs?
 *
 * `stored` is the site's `deployedCmsVersion` (e.g. `cms-v0.6.0`, `main`, or
 * null/undefined). `latestVersion` is the bare semver of the newest release
 * (`releases[0].version` from `normalizeReleases`, or null when none exist).
 *
 * Returns true only when both are known AND `stored` parses to a `cms-v<x.y.z>`
 * tag strictly OLDER than `latestVersion`. Degrades to false (no badge) for:
 * never-deployed sites (null), non-tag refs like `main` (can't compare), and an
 * empty tag list (latestVersion null) — exactly the graceful cases the task asks
 * for.
 */
export function isUpdateAvailable(
  stored: string | null | undefined,
  latestVersion: string | null | undefined,
): boolean {
  if (!stored || !latestVersion) return false;
  if (!SEMVER_RE.test(latestVersion)) return false;
  const current = parseCmsTag(stored);
  if (!current) return false; // `main` / junk → not comparable
  // cmpSemverDesc < 0 means `current` is newer than `latest`; > 0 means older.
  return cmpSemverDesc(current, latestVersion) > 0;
}
