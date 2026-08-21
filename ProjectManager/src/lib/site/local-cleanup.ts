/**
 * Local-dev counterpart of the deployer teardown: a local Site's content lives
 * in the sibling CMS checkout (`CMS/.wrangler/sites/<slug>/` plus the
 * `.local-site.json` connection marker written by scripts/connect.mjs), so a
 * PM-side delete would otherwise leave the CMS dev server happily serving a
 * Site the PM no longer knows about.
 *
 * Split so the decision is pure and testable: `planLocalCleanup` decides WHAT
 * to remove from data alone; `cleanupLocalSiteData` (dev-only, best-effort)
 * does the filesystem work.
 */
export type LocalCleanupPlan = {
  /** Remove `CMS/.wrangler/sites/<slug>/` (the Site's local D1/R2 state). */
  removeSiteDir: boolean;
  /** Remove `CMS/.local-site.json` — only when it points at this very Site. */
  removeMarker: boolean;
};

export function planLocalCleanup(
  slug: string,
  markerJson: string | null,
): LocalCleanupPlan {
  // The slug becomes a path segment — anything outside the strict slug
  // grammar (same shape isValidSlug enforces; alias-free copy so node --test
  // can import this module bare) is refused wholesale, never sanitized.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    return { removeSiteDir: false, removeMarker: false };
  }

  let removeMarker = false;
  if (markerJson != null) {
    try {
      const marker = JSON.parse(markerJson) as { slug?: unknown };
      removeMarker = marker.slug === slug;
    } catch {
      removeMarker = false;
    }
  }
  return { removeSiteDir: true, removeMarker };
}

/**
 * Best-effort removal of the deleted Site's local CMS state. No-ops entirely
 * outside `next dev`, and also when the PM is in prod-remote mode — there the
 * deleted Site is a PRODUCTION Site and any same-slug local dir belongs to a
 * different, local one. Failures only warn: the authoritative delete is the
 * DB row, and stray local dirs are harmless (and removable by hand).
 */
export async function cleanupLocalSiteData(slug: string): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;

  const [fs, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);

  const pmDir = process.cwd();
  const prodMarker = path.join(pmDir, ".prod-remote.json");
  if (await fs.access(prodMarker).then(() => true, () => false)) return;

  const cmsDir = path.resolve(pmDir, "../CMS");
  const markerPath = path.join(cmsDir, ".local-site.json");
  const markerJson = await fs.readFile(markerPath, "utf8").catch(() => null);

  const plan = planLocalCleanup(slug, markerJson);
  try {
    if (plan.removeSiteDir) {
      await fs.rm(path.join(cmsDir, ".wrangler", "sites", slug), {
        recursive: true,
        force: true,
      });
    }
    if (plan.removeMarker) {
      await fs.rm(markerPath, { force: true });
      console.warn(
        `[sites] delete ${slug}: the local CMS was connected to this Site — ` +
          `its data and .local-site.json were removed. Reconnect the CMS ` +
          `(scripts/connect.mjs cms <slug>) and restart it.`,
      );
    }
  } catch (err) {
    console.warn(`[sites] delete ${slug}: local CMS cleanup failed. ${err}`);
  }
}
