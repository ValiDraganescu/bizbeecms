/**
 * Client-side alias-option helpers (ai-cost-quotas W2-E). Pure, no React/`@/`
 * imports so they run under dep-free `node --test` (alias-options.test.ts).
 *
 * The admin pickers hold a stored value that may be a curated alias `key` (new)
 * or a raw OpenRouter model id persisted before curation. These helpers answer
 * the two questions the picker asks about such a value: "which curated option
 * does it select?" and "is it curated at all?" — plus, since the aliases wire
 * grew pricing, how curated aliases become a `CatalogModel[]` the rich
 * `ModelPicker` can render.
 */

import { providerOf, type CatalogModel } from "../chat/models.ts";

/**
 * The `/api/ai-config/aliases` wire shape. Prices are the CUSTOMER-facing
 * USD-per-token rates — the raw OpenRouter price already adjusted by the alias
 * margin server-side; `marginPct` itself never reaches the browser. The pricing
 * and modality fields are optional: they're a catalog join, absent whenever the
 * model isn't in the (possibly stale/empty) catalog cache.
 */
export interface AliasOption {
  key: string;
  label: string;
  model: string;
  /** Margin-adjusted USD per input token; null/absent when unknown. */
  inputPrice?: number | null;
  /** Margin-adjusted USD per output token; null/absent when unknown. */
  outputPrice?: number | null;
  inputModalities?: string[];
  outputModalities?: string[];
  contextLength?: number | null;
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

/**
 * A raw USD-per-token price adjusted by the alias margin — what the CUSTOMER
 * pays per token. Mirrors `decideAiMeter`'s margin semantics (negative margins
 * clamp to 0); a null/unknown price stays null (never invent a rate).
 */
export function withMargin(
  price: number | null | undefined,
  marginPct: number,
): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  const pct = Number.isFinite(marginPct) ? Math.max(0, marginPct) : 0;
  return price * (1 + pct / 100);
}

/** The subset of the curated config the projection reads (server-side shape). */
export interface CuratedAliasLike {
  key: string;
  label: string;
  model: string;
  marginPct: number;
}

/**
 * Project curated aliases to the wire shape, joining each against the catalog
 * for modality/context metadata and MARGIN-ADJUSTED prices. A model missing
 * from the catalog (stale/empty cache, retired id) projects without the join —
 * the picker then shows it with no price rather than dropping it.
 */
export function projectAliasOptions(
  curated: ReadonlyArray<CuratedAliasLike>,
  catalog: ReadonlyArray<CatalogModel>,
): AliasOption[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  return curated.map((c) => {
    const m = byId.get(c.model);
    return {
      key: c.key,
      label: c.label,
      model: c.model,
      inputPrice: withMargin(m?.inputPrice, c.marginPct),
      outputPrice: withMargin(m?.outputPrice, c.marginPct),
      inputModalities: m?.inputModalities ?? ["text"],
      outputModalities: m?.outputModalities ?? ["text"],
      contextLength: m?.contextLength ?? null,
    };
  });
}

/**
 * Curated aliases as a `CatalogModel[]` for the rich `ModelPicker`: the alias
 * KEY becomes the entry id (it's what gets stored/sent on selection), the
 * provider comes from the underlying model id (grouping), and the prices are
 * the customer-facing adjusted rates from the wire. Alias order is preserved
 * within a provider group only as far as the picker's price sort allows.
 */
export function aliasCatalog(aliases: ReadonlyArray<AliasOption>): CatalogModel[] {
  return aliases.map((a) => ({
    id: a.key,
    label: a.label,
    provider: providerOf(a.model),
    price: a.inputPrice ?? null,
    inputPrice: a.inputPrice ?? null,
    outputPrice: a.outputPrice ?? null,
    inputModalities: a.inputModalities ?? ["text"],
    outputModalities: a.outputModalities ?? ["text"],
    contextLength: a.contextLength ?? null,
  }));
}
