/**
 * Client-side alias-option helpers (ai-cost-quotas W2-E). Pure, no React/`@/`
 * imports so they run under dep-free `node --test` (alias-options.test.ts).
 *
 * The admin pickers hold a stored value that may be a curated alias `key` (new)
 * or a raw OpenRouter model id persisted before curation. These helpers answer
 * the two questions the picker asks about such a value: "which curated option
 * does it select?" and "is it curated at all?".
 */

/** The `/api/ai-config/aliases` wire shape — no margins reach the browser. */
export interface AliasOption {
  key: string;
  label: string;
  model: string;
}

/** The alias a stored value selects, matching key first then legacy model id. */
export function matchAlias(
  aliases: readonly AliasOption[],
  storedValue: string | null | undefined,
): AliasOption | null {
  if (!storedValue) return null;
  return (
    aliases.find((a) => a.key === storedValue) ??
    aliases.find((a) => a.model === storedValue) ??
    null
  );
}

/**
 * The `<select>` value for a stored value: the matching alias `key`, or the
 * stored value verbatim when nothing matches — an uncurated legacy id stays
 * selected as its own option rather than silently re-pointing at another model.
 */
export function selectValueFor(
  aliases: readonly AliasOption[],
  storedValue: string,
): string {
  return matchAlias(aliases, storedValue)?.key ?? storedValue;
}
