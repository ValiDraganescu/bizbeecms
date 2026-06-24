/**
 * ai-widget-ux — persist the chat widget's selected model across reloads.
 *
 * The picker resets to DEFAULT_MODEL on every refresh because the widget holds
 * the choice in `useState(DEFAULT_MODEL)`. We remember it in localStorage (a UI
 * pref, per-CMS) and restore it on mount — but only if the stored id is STILL a
 * real model. The catalog is the OpenRouter list (ai-openrouter's territory) and
 * can change, so a removed model must not stick: `resolveInitialModel` validates
 * the stored id against the live catalog ids and falls back to the default.
 */

/**
 * Pick the model to start with on mount.
 * - stored id present AND still in the catalog → use it.
 * - otherwise (absent, empty, or no longer offered) → the default.
 *
 * When the catalog list is empty (offline / not yet loaded) we can't validate,
 * so we trust a non-empty stored id rather than discard a valid choice — the
 * chat route validates the model server-side regardless, so an unknown id is
 * harmless there.
 */
export function resolveInitialModel(
  stored: string | null | undefined,
  catalogIds: readonly string[],
  fallback: string,
): string {
  if (!stored) return fallback;
  if (catalogIds.length === 0) return stored; // can't validate yet — keep it
  return catalogIds.includes(stored) ? stored : fallback;
}

const KEY = "bizbee.chat.model";

export function loadModel(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveModel(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode / no storage — choice just won't persist */
  }
}
