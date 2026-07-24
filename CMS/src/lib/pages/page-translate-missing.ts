/**
 * bulk-translate-missing — the PAGE-BUILDER adapter (feature AC C7).
 *
 * Derives the T1 planner's `PlanEntry[]` from a page's meta title/description
 * maps + every translatable component prop in its block tree, and applies a
 * run's vetted result slots back. Entry NAMES are the page-translation paths
 * `applyTranslation` established: `metaTitle` / `metaDescription` for meta and
 * `<blockId>.<propName>` for block props. Block ids can't contain a dot
 * (page-blocks ID_RE), so the two namespaces can never collide and no name
 * parsing is needed — application re-derives each block's names the same way.
 *
 * PERSISTENCE matches the existing per-field page-builder translate
 * (`translatable-field.tsx`): `/api/translate` is called with `persist:false`
 * and only the vetted, REQUESTED field×locale slots are merged client-side —
 * block props into the builder's draft state (autosave → draft → publish, which
 * purges the edge cache), meta via the SEO form's `PUT /api/pages` (which
 * purges too). The server-side `applyTranslation` path is deliberately NOT
 * used: it writes the LIVE `page.blocks` by top-level slug, bypassing the
 * draft/version system, and would apply the model's source-locale seed —
 * unrequested slots a missing-only bulk run must never write.
 *
 * SOURCE semantics (shared by the page sweep, the per-block button and the
 * per-field menu): a prop's translation source is its stored default-locale
 * text, else the schema's authored non-empty string `default` — exactly what
 * the per-field menu renders (`translatable-field.tsx` `sourceText`). No
 * stored text AND no authored default → no source → no entry (AC8).
 *
 * PURE, dep-free transitively (page-blocks/tree/localize are node-loadable) so
 * it runs under `node --test`. Relative `.ts` imports keep it that way.
 */
import { missingLocaleSlots, type PlanEntry } from "../content/bulk-translate-plan.ts";
import type { TranslationSlots } from "../content/bulk-translate-run.ts";
import { mergeTranslations, parsePropsSchema, type PropField } from "./page-blocks.ts";
import type { Block } from "../render/tree.ts";
import { isLocaleObject, type ContentLocales } from "../render/localize.ts";

/** The page-level meta fields the action covers — also their entry names. */
export const PAGE_META_FIELDS = ["metaTitle", "metaDescription"] as const;
export type PageMetaField = (typeof PAGE_META_FIELDS)[number];

/** The per-locale meta maps of the page being translated (PageSummary subset). */
export type PageMeta = Record<PageMetaField, Record<string, string>>;

/** Component name → raw `propsSchema` JSON (the shell's palette map). */
export type PropsSchemas = Record<string, string | null | undefined>;

/**
 * Every missing field×locale slot of the page as planner entries: the two meta
 * maps first, then each translatable string/richtext prop of every block in the
 * tree (any depth — List templates, column children), with the shared
 * stored-text-else-authored-default source semantics (`propMissingSlots`).
 * Built-ins and unknown components have no schema → no entries. A single-locale
 * site, a fully translated page, or an entry with no source yields none. PURE.
 */
export function pageTranslateEntries(
  meta: PageMeta,
  blocks: Block[],
  schemas: PropsSchemas,
  locales: ContentLocales,
): PlanEntry[] {
  const entries: PlanEntry[] = [];
  const consider = (name: string, slots: { sourceText: string; missing: string[] }) => {
    if (slots.missing.length > 0) {
      entries.push({ name, sourceText: slots.sourceText, targetLocales: slots.missing });
    }
  };

  for (const field of PAGE_META_FIELDS) consider(field, missingLocaleSlots(meta[field], locales));

  const visit = (list: Block[]) => {
    for (const block of list) {
      for (const f of translatableFields(block, schemas)) {
        consider(`${block.id}.${f.name}`, propMissingSlots(block.props?.[f.name], f, locales));
      }
      if (block.children?.length) visit(block.children);
    }
  };
  visit(blocks);
  return entries;
}

/**
 * Split a run's vetted slots into the meta slots (PUT via the SEO body) and the
 * block slots (merged into draft state). Every name is exactly one of the two —
 * see the naming contract above. PURE.
 */
export function splitPageSlots(
  slots: TranslationSlots,
): { meta: TranslationSlots; block: TranslationSlots } {
  const meta: TranslationSlots = {};
  const block: TranslationSlots = {};
  for (const [name, map] of Object.entries(slots)) {
    ((PAGE_META_FIELDS as readonly string[]).includes(name) ? meta : block)[name] = map;
  }
  return { meta, block };
}

/** Merge vetted meta slots into the page's current maps, filling ABSENT (or
 *  blank) locales only. The slots were requested-missing at plan time, but the
 *  base is read fresh at save time — a slot an operator filled mid-run must win
 *  over the model's translation (never-overwrite). PURE. */
export function mergePageMeta(meta: PageMeta, slots: TranslationSlots): PageMeta {
  const fill = (base: Record<string, string>, add?: Record<string, string>) => {
    const out = { ...base };
    for (const [locale, text] of Object.entries(add ?? {})) {
      if ((out[locale] ?? "") === "") out[locale] = text;
    }
    return out;
  };
  return {
    metaTitle: fill(meta.metaTitle, slots.metaTitle),
    metaDescription: fill(meta.metaDescription, slots.metaDescription),
  };
}

/**
 * Merge vetted BLOCK slots (`<blockId>.<prop>` names) into a block tree, going
 * through the SAME `mergeTranslations` (per-locale write + full-schema
 * re-validation) a per-field translate uses. Untouched subtrees keep their
 * references (and an all-miss application returns `blocks` itself), so callers
 * can cheaply detect "nothing changed". Meant to run inside a functional
 * `setBlocks` update so concurrent edits are never clobbered. PURE.
 */
export function applyBlockTranslations(
  blocks: Block[],
  slots: TranslationSlots,
  schemas: PropsSchemas,
  locales: ContentLocales,
): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    let out = block;

    const schema = parsePropsSchema(schemas[block.component]);
    const own: TranslationSlots = {};
    let any = false;
    for (const f of schema) {
      if (!f.translatable) continue;
      const map = slots[`${block.id}.${f.name}`];
      if (map && Object.keys(map).length > 0) {
        own[f.name] = map;
        any = true;
      }
    }
    if (any) {
      out = { ...out, props: mergeTranslations(block.props, own, schema, locales.locales) };
    }

    if (block.children?.length) {
      const children = applyBlockTranslations(block.children, slots, schemas, locales);
      if (children !== block.children) out = out === block ? { ...block, children } : { ...out, children };
    }

    if (out !== block) changed = true;
    return out;
  });
  return changed ? next : blocks;
}

function translatableFields(block: Block, schemas: PropsSchemas): PropField[] {
  // `translatable` is already narrowed to string/richtext by parsePropsSchema.
  return parsePropsSchema(schemas[block.component]).filter((f) => f.translatable);
}

/**
 * One translatable prop's source + missing target locales, with the SHARED
 * source semantics (see the module doc): stored default-locale text wins; a
 * prop with nothing authored falls back to the schema's non-empty string
 * `default` — targets then keep whatever real translations are already stored.
 * No source → no missing slots. PURE.
 */
function propMissingSlots(
  raw: unknown,
  field: PropField,
  locales: ContentLocales,
): { sourceText: string; missing: string[] } {
  const slots = missingLocaleSlots(raw, locales);
  if (slots.sourceText.trim() !== "" || field.default.trim() === "") return slots;
  const map = isLocaleObject(raw) ? (raw as Record<string, unknown>) : {};
  const missing = locales.locales.filter((code) => {
    if (code === locales.default) return false;
    const slot = map[code];
    return typeof slot !== "string" || slot.trim() === "";
  });
  return { sourceText: field.default, missing };
}

/**
 * ONE-block entries for the inspector's per-component "Translate missing"
 * button (AC 7b): every translatable prop of the block × its missing target
 * locales (shared source semantics — `propMissingSlots`). Names are PLAIN prop
 * names — the vetted result merges straight into this block via
 * `mergeTranslations`, so no `<blockId>.` namespace is needed. A single-locale
 * site yields none. PURE.
 */
export function blockTranslateEntries(
  props: Record<string, unknown> | undefined,
  schema: PropField[],
  locales: ContentLocales,
): PlanEntry[] {
  const entries: PlanEntry[] = [];
  for (const f of schema) {
    if (!f.translatable) continue;
    const { sourceText, missing } = propMissingSlots(props?.[f.name], f, locales);
    if (missing.length > 0) entries.push({ name: f.name, sourceText, targetLocales: missing });
  }
  return entries;
}
