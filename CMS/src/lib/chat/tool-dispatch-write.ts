/**
 * Content-write tool handlers (split from `tool-dispatch.ts`): component +
 * page create/update, translate, page meta, per-block prop patch, brand
 * identity and theme. Registered in the shared HANDLERS map in
 * `tool-dispatch.ts`.
 */
import { validateComponentArtifact } from "./component-tool";
import { validatePageInput } from "./page-tool";
import { validateSetPageMeta, mergePageMeta } from "./meta-tools";
import { validateTranslationInput } from "./translate-tool";
import { splitThemeArgs, coerceIdentityArg } from "./write-tools";
import { coerceIdArg } from "./read-tools";
import { reconcileComponentClasses } from "./reconcile-classes";
import { lintComponentScript } from "./lint-component-script";
import {
  validateBlocks,
  topLevelBlockIds,
  findBlock,
  mergeBlockProps,
  patchBlockProps,
  validateBlockProps,
  parsePropsSchema,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import { upsertComponent, getComponentByName } from "@/db/component-store";
import {
  missingComponents,
  upsertPage,
  listPages,
  upsertPageMeta,
} from "@/db/page-store";
import { applyTranslation } from "@/db/translate-store";
import {
  getContentLocales,
  setSiteIdentity,
  setThemeOverrides,
  setThemeOverridesDark,
} from "@/db/settings-store";
import { localeSlugConflicts } from "@/lib/render/localize";
import { notifyIndexNowForPage } from "@/lib/render/indexnow-notify";
import { purgeEdgeTags } from "@/lib/render/purge-edge";
import { purgeTagsForPageWrite } from "@/lib/render/page-write-hooks";
import {
  getDraftBlocks,
  setDraftBlocks,
  unknownComponentMessage,
} from "./tool-dispatch-shared";

export async function handleCreateComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateComponentArtifact(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  // The script is being authored HERE, so script↔markup findings block: a
  // static selector matching nothing this component renders/builds is either
  // a cross-component reach or dead code — both fixable by the model now.
  const scriptFindings = lintComponentScript(valid.artifact.tree, valid.artifact.script);
  if (scriptFindings.length > 0) return { ok: false, errors: scriptFindings };
  try {
    const res = await upsertComponent(valid.artifact);
    // Quality nits (unknown html classes, dead css rules) ride back as
    // non-blocking warnings so the model can clean up in its next call.
    const warnings = await reconcileComponentClasses(
      valid.artifact.tree,
      valid.artifact.css,
      valid.artifact.script,
    );
    return {
      ok: true,
      action: res.action,
      component: res.name,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save component: ${(err as Error).message}`] };
  }
}

/** Update an existing component (same untrusted-artifact gate as create_component). */
export async function handleUpdateComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateComponentArtifact(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  // Full re-author = the model owns the whole script; findings block (see create).
  const scriptFindings = lintComponentScript(valid.artifact.tree, valid.artifact.script);
  if (scriptFindings.length > 0) return { ok: false, errors: scriptFindings };
  try {
    const res = await upsertComponent(valid.artifact);
    const warnings = await reconcileComponentClasses(
      valid.artifact.tree,
      valid.artifact.css,
      valid.artifact.script,
    );
    return {
      ok: true,
      action: res.action,
      component: res.name,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to save component: ${(err as Error).message}`] };
  }
}

export async function handleCreatePage(args: unknown): Promise<Record<string, unknown>> {
  const valid = validatePageInput(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    // Blocks reference component names — verify they exist before writing so the
    // model learns to create_component first (not silent placeholders).
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      return { ok: false, errors: [await unknownComponentMessage(missing)] };
    }
    // A top-level slug equal to a content-locale code would be shadowed by the
    // /<code>/ locale URL prefix (Stage 1 locale-prefix routing) — same guard
    // as the /api/pages REST route.
    if (valid.page.parentSlug === null) {
      const { locales } = await getContentLocales();
      const clash = localeSlugConflicts(locales, [valid.page.slug]);
      if (clash.length > 0) {
        return {
          ok: false,
          errors: [
            `slug "${valid.page.slug}" equals the configured content-locale code "${clash[0]}" — the /${clash[0]}/ locale prefix would shadow this page; choose a different top-level slug`,
          ],
        };
      }
    }
    const res = await upsertPage(valid.page);
    if (!res.ok) return { ok: false, errors: res.errors };
    // AI live-write coherence: mirror the REST /api/pages post-write hooks so an
    // AI publish/edit of a PUBLISHED page pings IndexNow and busts the edge cache
    // (an UPDATE may target an already-cached live page; a CREATE can't be cached
    // yet, so only purge on update). Best-effort — both helpers self-wrap
    // waitUntil / swallow errors, so this never fails the tool result.
    const tags = purgeTagsForPageWrite(res.action, res.pageId);
    if (tags.length > 0) await purgeEdgeTags(...tags);
    await notifyIndexNowForPage(res.pageId);
    return { ok: true, action: res.action, page: res.slug };
  } catch (err) {
    return { ok: false, errors: [`failed to save page: ${(err as Error).message}`] };
  }
}

export async function handleTranslate(args: unknown): Promise<Record<string, unknown>> {
  // Constrain the model to the Site's configured content locales (C1).
  let allowedLocales: string[] | undefined;
  try {
    allowedLocales = (await getContentLocales()).locales;
  } catch {
    allowedLocales = undefined; // settings unreadable → accept any valid code
  }
  const valid = validateTranslationInput(args, { allowedLocales });
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const res = await applyTranslation(valid.input);
    if (!res.ok) return { ok: false, errors: res.errors };
    // Translate rewrites an EXISTING page's live metaTitle/metaDescription (and
    // block text) — if that page is published + cached the edge would serve the
    // pre-translation bytes until TTL, and IndexNow never learns of the change.
    // Mirror the REST post-write hooks. Best-effort (self-wrapping helpers).
    await purgeEdgeTags(...purgeTagsForPageWrite(res.action, res.pageId));
    await notifyIndexNowForPage(res.pageId);
    return { ok: true, action: res.action, target: res.target, fields: res.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to translate: ${(err as Error).message}`] };
  }
}

export async function handleSetPageMeta(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetPageMeta(args);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  const { patch } = valid;
  try {
    // Address by slug (+ optional parentSlug) — the model doesn't know page ids.
    const pages = await listPages();
    const match = pages.find(
      (p) => p.slug === patch.slug && (p.parentSlug ?? null) === patch.parentSlug,
    );
    if (!match) {
      const where = patch.parentSlug ? ` under parent "${patch.parentSlug}"` : "";
      return {
        ok: false,
        errors: [
          `no page with slug "${patch.slug}"${where} — call list_pages or audit_meta to see real slugs`,
        ],
      };
    }
    // Merge into current meta, preserving slug/parent/publish/OG-image/noindex.
    const meta = mergePageMeta(match, patch);
    const res = await upsertPageMeta(meta, match.id);
    if (!res.ok) return { ok: false, errors: res.errors };
    // Meta-only edit can't move URLs or flip noindex, so the light AI hook is
    // correct: purge this page's cache tag + ping IndexNow (mirrors create_page;
    // no rename/noindex pre-capture needed — see the AI write-path caveat).
    const tags = purgeTagsForPageWrite(res.action, res.id);
    if (tags.length > 0) await purgeEdgeTags(...tags);
    await notifyIndexNowForPage(res.id);
    return {
      ok: true,
      page: match.slug,
      wroteTitleLocales: Object.keys(patch.metaTitle).filter((l) => patch.metaTitle[l] !== undefined),
      wroteDescriptionLocales: Object.keys(patch.metaDescription),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to set page meta: ${(err as Error).message}`] };
  }
}

/** Every block id in a tree (depth-first) — for a "no such block, here are the ids" error. */
function collectBlockIds(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b?.id) out.push(b.id);
      if (b?.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Replace an existing page's block tree (validateBlocks gate, like the editor). */
export async function handleUpdatePageBlocks(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required (use list_pages/get_page to find it)"] };
  const blocksArg =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).blocks
      : undefined;
  const draft = await getDraftBlocks(id);
  if (!draft) return { ok: false, errors: ["page not found"] };
  // Grandfather the page's already-saved top-level blocks (top-level = Sections
  // only rejects NEW non-Section strays).
  const valid = validateBlocks(blocksArg, {
    grandfatheredTopLevelIds: topLevelBlockIds(draft.blocks),
  });
  if (!valid.ok) return { ok: false, errors: valid.errors };
  try {
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      return { ok: false, errors: [await unknownComponentMessage(missing)] };
    }
    const res = await setDraftBlocks(id, valid.blocks, draft.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "updated", page: id };
  } catch (err) {
    return { ok: false, errors: [`failed to update page blocks: ${(err as Error).message}`] };
  }
}

/**
 * Patch ONE block's props by id — the SAFE per-block content edit (it can't drop
 * the rest of the tree the way a full update_page_blocks re-pass can). Loads the
 * draft, finds the block, MERGES the patch into its existing props (empty string
 * clears a prop), validates against the component's propsSchema (same gate the
 * editor uses), and saves. Built-in blocks (Section/List) carry no propsSchema, so
 * their props pass through the legacy allowlist path unchanged.
 */
export async function handleSetBlockProps(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required (the page id, from list_pages/get_page)"] };
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const blockId = typeof a.blockId === "string" ? a.blockId : "";
  if (!blockId) return { ok: false, errors: ["blockId is required (every block in get_page has an `id`)"] };
  if (typeof a.props !== "object" || a.props === null || Array.isArray(a.props)) {
    return { ok: false, errors: ["props must be an object, e.g. { title: 'New title' }"] };
  }
  const patch = a.props as Record<string, unknown>;
  try {
    const loaded = await getDraftBlocks(id);
    if (!loaded) return { ok: false, errors: [`no page with id "${id}"`] };
    const target = findBlock(loaded.blocks, blockId);
    if (!target) {
      const ids = collectBlockIds(loaded.blocks);
      return {
        ok: false,
        errors: [
          `no block with id "${blockId}" on this page. Block ids: ${ids.join(", ") || "(none)"}`,
        ],
      };
    }

    const row = await getComponentByName(target.component);
    const schema = parsePropsSchema(row?.propsSchema ?? null);
    const editable = schema.map((f) => f.name);

    // An EMPTY patch changes nothing — do NOT report success (that invites a retry
    // loop). Name the props the model could actually set so it self-corrects.
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        errors: [
          `props was empty — nothing to change. Pass the values to set, e.g. ` +
            `{ "props": { "title": "…" } }.` +
            (editable.length ? ` Editable props on ${target.component}: ${editable.join(", ")}.` : ""),
        ],
      };
    }

    // Merge the patch over the block's current props; an empty string clears a key.
    const merged = patchBlockProps(target.props, patch);
    // Validate against the component's own schema (drop undeclared keys, coerce by
    // type) — the same gate the editor's field path uses. A built-in/schemaless
    // block has NO propsSchema; the schema-aware path would drop everything, so we
    // keep the merged props verbatim there (Section/List config isn't this tool's
    // job, but we must not silently nuke it).
    const validated = schema.length > 0 ? validateBlockProps(merged, schema) : merged;

    // If NO supplied key survived validation as a known prop, it's a no-op (the
    // model used wrong prop names). Tell it which keys were rejected and what IS
    // settable — don't report a false success. (We test key SURVIVAL, not value
    // equality: validateBlockProps coerces values, e.g. "12" → 12, so a kept prop
    // legitimately differs from the raw patch.) `width` is a reserved layout prop
    // the validator keeps even when not in the schema — count it as known.
    if (schema.length > 0) {
      const known = new Set([...editable, "width"]);
      const anyKnown = Object.keys(patch).some((k) => known.has(k));
      if (!anyKnown) {
        return {
          ok: false,
          errors: [
            `none of [${Object.keys(patch).join(", ")}] are props of ${target.component}. ` +
              `Editable props: ${editable.join(", ") || "(none)"}.`,
          ],
        };
      }
    }

    const next = mergeBlockProps(loaded.blocks, blockId, validated);
    const res = await setDraftBlocks(id, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return { ok: true, action: "updated", page: id, block: blockId, props: validated };
  } catch (err) {
    return { ok: false, errors: [`failed to set block props: ${(err as Error).message}`] };
  }
}

/** Update the Site's brand identity (setSiteIdentity is the normalization gate). */
export async function handleUpdateBrandIdentity(args: unknown): Promise<Record<string, unknown>> {
  const identity = coerceIdentityArg(args);
  if (identity === undefined) {
    return { ok: false, errors: ["identity must be an object (use get_brand_identity first)"] };
  }
  try {
    const saved = await setSiteIdentity(identity);
    return { ok: true, action: "updated", identity: saved };
  } catch (err) {
    return { ok: false, errors: [`failed to save brand identity: ${(err as Error).message}`] };
  }
}

/** Update the Site's theme overrides (light and/or dark; normalize to known tokens). */
export async function handleUpdateTheme(args: unknown): Promise<Record<string, unknown>> {
  const { light, dark, any } = splitThemeArgs(args);
  if (!any) return { ok: false, errors: ["supply 'light' and/or 'dark' as a token→color object"] };
  try {
    const result: Record<string, unknown> = {};
    if (light !== undefined) result.light = await setThemeOverrides(light);
    if (dark !== undefined) result.dark = await setThemeOverridesDark(dark);
    return { ok: true, action: "updated", theme: result };
  } catch (err) {
    return { ok: false, errors: [`failed to save theme: ${(err as Error).message}`] };
  }
}
