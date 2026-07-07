/**
 * D1 read/merge/write for the translate tool (Milestone 2, epic B4).
 *
 * The input has already been SHAPE-validated by `validateTranslationInput`
 * (pure, in lib/chat); this module does the parts that need the binding: look
 * the target up, MERGE the per-locale values into the stored artifact, write
 * back. Merging (not replacing) preserves any locales the field already had —
 * the renderer's `resolveLocalized` (C1) then resolves the now-fuller locale
 * object at request time.
 *
 * Field mapping for a PAGE:
 *  - `metaTitle` / `metaDescription` → the page's per-locale meta JSON maps.
 *  - `<blockId>.<propName>`          → that block's prop, set to a locale object.
 *
 * For a COMPONENT: components are static artifacts; their translatable text is
 * supplied as block props at the page use-site, so a component translate target
 * merges into the component's `propsSchema`-adjacent area is out of scope. We
 * support translating component PROPS the same block-path way is N/A; instead
 * we currently reject component targets with a clear message (page-prop
 * translation covers the real flow). Kept as an explicit branch so the contract
 * is obvious and B-later can extend it.
 *
 * The page-merge logic is the PURE `mergePageFields` (in lib/chat/translate-tool,
 * node-testable); only the lookup/write here touches D1 (build-verified, HITL).
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./index";
import { mergePageFields, type TranslationInput } from "@/lib/chat/translate-tool";

export type MergeResult =
  | { ok: true; action: "translated"; target: string; fields: number; pageId: string }
  | { ok: false; errors: string[] };

/** Persist a validated translation by merging it into the target artifact. */
export async function applyTranslation(input: TranslationInput): Promise<MergeResult> {
  if (input.kind === "component") {
    return {
      ok: false,
      errors: [
        "component-target translation is not supported yet — translate the page " +
          "whose blocks use the component (its props carry the localized text)",
      ],
    };
  }

  const db = await getDb();

  // Page lookup by slug. The tool addresses pages by slug; if the same slug
  // exists at multiple tree levels we take the top-level one (the common case
  // the AI composes). A more specific path lands when B-later adds parent slugs.
  const rows = await db
    .select({
      id: schema.page.id,
      blocks: schema.page.blocks,
      metaTitle: schema.page.metaTitle,
      metaDescription: schema.page.metaDescription,
    })
    .from(schema.page)
    .where(and(eq(schema.page.slug, input.target), isNull(schema.page.parentPageId)))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, errors: [`page "${input.target}" not found`] };
  }
  const row = rows[0];

  const merged = mergePageFields(
    {
      blocks: parseJson(row.blocks, []),
      metaTitle: parseJson(row.metaTitle, {}),
      metaDescription: parseJson(row.metaDescription, {}),
    },
    input.fields,
  );

  if (merged.errors.length > 0) return { ok: false, errors: merged.errors };
  if (merged.applied === 0) {
    return { ok: false, errors: ["no matching fields to translate on this page"] };
  }

  await db
    .update(schema.page)
    .set({
      blocks: JSON.stringify(merged.blocks),
      metaTitle: JSON.stringify(merged.metaTitle),
      metaDescription: JSON.stringify(merged.metaDescription),
      updatedAt: new Date(),
    })
    .where(eq(schema.page.id, row.id));

  return {
    ok: true,
    action: "translated",
    target: input.target,
    fields: merged.applied,
    pageId: row.id,
  };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
