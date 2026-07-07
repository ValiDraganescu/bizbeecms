/**
 * Pure "did this component artifact actually change?" check.
 *
 * The Develop editor round-trips a component's html through the code editor and
 * autosaves on open — so an UNTOUCHED component would otherwise create a draft
 * ("unpublished changes") for a no-op. This compares the incoming artifact to the
 * LIVE one field-by-field; the store skips the draft write when they match. Kept
 * pure (no D1) so it's node-testable and the store stays a thin wrapper.
 */

import { parseHtml } from "../render/parse-html.ts";

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

/**
 * Html equivalence must be by PARSED TREE, not raw string: the renderer only
 * ever sees `parseHtml(html)`, and different writers format the same tree
 * differently — the Develop editor round-trips through `formatHtml` (pretty-
 * printed) while the AI's edit_text writes compact markup. A raw-string
 * compare let those echoes past the guard, so publishing re-grew a phantom
 * "unpublished changes" draft that was tree-identical to live (restovista,
 * 2026-07-08). Raw equality short-circuits; a parse failure falls back to the
 * raw verdict (an unparseable artifact never silently counts as unchanged).
 */
function htmlEquivalent(live: string, next: string): boolean {
  if (next === live) return true;
  try {
    return JSON.stringify(parseHtml(next)) === JSON.stringify(parseHtml(live));
  } catch {
    return false;
  }
}

/** True when `next` would render identically to `live` (no draft-worthy change). */
export function artifactUnchanged(live: LiveArtifact, next: NextArtifact): boolean {
  return (
    htmlEquivalent(live.html, next.html) &&
    next.script === live.script &&
    next.css === live.css &&
    next.propsSchema === live.propsSchema &&
    next.label === live.label
  );
}
