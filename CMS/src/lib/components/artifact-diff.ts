/**
 * Pure "did this component artifact actually change?" check.
 *
 * The Develop editor round-trips a component's html through the code editor and
 * autosaves on open — so an UNTOUCHED component would otherwise create a draft
 * ("unpublished changes") for a no-op. This compares the incoming artifact to the
 * LIVE one field-by-field; the store skips the draft write when they match. Kept
 * pure (no D1) so it's node-testable and the store stays a thin wrapper.
 */

/** The LIVE artifact fields a draft would overwrite. */
export type LiveArtifact = {
  html: string;
  script: string;
  css: string;
  propsSchema: string | null;
  label: string | null;
};

/** The already-resolved incoming artifact (omitted props/label pre-filled from live). */
export type NextArtifact = {
  html: string;
  script: string;
  css: string;
  propsSchema: string | null;
  label: string | null;
};

/** True when `next` is byte-identical to `live` (no draft-worthy change). */
export function artifactUnchanged(live: LiveArtifact, next: NextArtifact): boolean {
  return (
    next.html === live.html &&
    next.script === live.script &&
    next.css === live.css &&
    next.propsSchema === live.propsSchema &&
    next.label === live.label
  );
}
