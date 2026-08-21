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
 * prop with nothing stored falls back to the schema's authored default —
 * targets then keep whatever real translations are already stored. An authored
 * PER-LOCALE default object (`{ fi:"…", en:"…" }`) counts as filling the
 * locales it names: the renderer resolves it per locale, so those slots are
 * not missing on the live site and must not be re-translated. No source → no
 * missing slots. PURE.
 */
function propMissingSlots(
  raw: unknown,
  field: PropField,
  locales: ContentLocales,
): { sourceText: string; missing: string[] } {
  const slots = missingLocaleSlots(raw, locales);
  if (slots.sourceText.trim() !== "") return slots;
  // No stored source — fall back to the authored default. A per-locale object
  // sources from ITS default-locale text (field.default is only the editor's
  // first-locale display string).
  const authored = isLocaleObject(field.defaultValue)
    ? (field.defaultValue as Record<string, unknown>)
    : undefined;
  const authoredDefault = authored?.[locales.default];
  const sourceText =
    typeof authoredDefault === "string" && authoredDefault.trim() !== ""
      ? authoredDefault
      : field.default;
  if (sourceText.trim() === "") return slots;
  const map = isLocaleObject(raw) ? (raw as Record<string, unknown>) : {};
  const missing = locales.locales.filter((code) => {
    if (code === locales.default) return false;
    const stored = map[code];
    if (typeof stored === "string" && stored.trim() !== "") return false;
    const def = authored?.[code];
    return !(typeof def === "string" && def.trim() !== "");
  });
  return { sourceText, missing };
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

/**
 * One HUMAN-readable row of the pre-run confirmation dialog: what is missing
 * and in which languages. `kind:"meta"` rows carry the meta field name in
 * `field` (the UI localizes it); `kind:"block"` rows carry the block's
 * component name + the prop's label (else its name) — enough for an operator
 * to recognize the item without knowing block ids.
 */
export interface TranslateEntryRow {
  /** The plan entry's name — stable list key. */
  name: string;
  kind: "meta" | "block";
  /** Block rows only: the component name of the owning block. */
  component?: string;
  /** Meta field name (`metaTitle`/`metaDescription`) or the prop label/name. */
  field: string;
  /** The locales this entry is missing (never the default locale). */
  locales: string[];
}

/**
 * Describe page-level plan entries (`pageTranslateEntries` output) for the
 * confirmation dialog. Resolves each `<blockId>.<prop>` name against the block
 * tree + schemas to the component name and the prop's human label. An entry
 * whose block or field can no longer be resolved (shouldn't happen — same
 * inputs) falls back to the raw name. PURE.
 */
export function describePageEntries(
  entries: PlanEntry[],
  blocks: Block[],
  schemas: PropsSchemas,
): TranslateEntryRow[] {
  const byId = new Map<string, Block>();
  const visit = (list: Block[]) => {
    for (const b of list) {
      byId.set(b.id, b);
      if (b.children?.length) visit(b.children);
    }
  };
  visit(blocks);

  return entries.map((e) => {
    if ((PAGE_META_FIELDS as readonly string[]).includes(e.name)) {
      return { name: e.name, kind: "meta" as const, field: e.name, locales: e.targetLocales };
    }
    const dot = e.name.indexOf(".");
    const block = byId.get(e.name.slice(0, dot));
    const propName = e.name.slice(dot + 1);
    const field = block
      ? parsePropsSchema(schemas[block.component]).find((f) => f.name === propName)
      : undefined;
    return {
      name: e.name,
      kind: "block" as const,
      component: block?.component ?? "?",
      field: field?.label ?? propName,
      locales: e.targetLocales,
    };
  });
}

/** Describe ONE block's plan entries (`blockTranslateEntries` output) for the
 *  confirmation dialog — prop labels only, the block is already selected. PURE. */
export function describeBlockEntries(
  entries: PlanEntry[],
  component: string,
  schema: PropField[],
): TranslateEntryRow[] {
  return entries.map((e) => ({
    name: e.name,
    kind: "block" as const,
    component,
    field: schema.find((f) => f.name === e.name)?.label ?? e.name,
    locales: e.targetLocales,
  }));
}
