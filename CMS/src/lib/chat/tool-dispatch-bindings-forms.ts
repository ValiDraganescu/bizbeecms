/**
 * Component/list binding + Form block tool handlers (split from
 * `tool-dispatch.ts`). Registered in the shared HANDLERS map in
 * `tool-dispatch.ts`.
 *
 * content-collections (Slice D): the binding tools mutate a PAGE's draft block
 * tree (NOT a collection store): load the blocks, find the target block,
 * validate the binding against the registry + the target/template component's
 * propsSchema (the SHARED validateBinding/validateListBinding — no forked
 * validation), apply via the Slice-C page-blocks helpers, persist via
 * setDraftBlocks. Graceful at runtime (the renderer skips unresolved), but
 * AUTHORING rejects unknown collection/field/prop so the model gets a
 * recoverable message and doesn't author dead bindings.
 */
import {
  validateBindComponent,
  validateCreateList,
  validateBindList,
} from "./binding-tools";
import {
  validateCreateForm,
  validateBindForm,
  mergeFormTarget,
} from "./form-tools";
import {
  validateBlocks,
  topLevelBlockIds,
  findBlock,
  setBlockField,
  setBlockChildren,
  addListToSection,
  addFormToSection,
  isList,
  isForm,
  isSection,
  LIST_COMPONENT,
  FORM_COMPONENT,
} from "@/lib/pages/page-blocks";
import type { Block, BindingRef, ListSource, FormTarget } from "@/lib/render/tree";
import {
  validateBinding,
  validateListBinding,
  declaredPropNames,
} from "@/lib/content/binding";
import { requestPlaceholders } from "@/lib/data-sources/validate";
import { getCollection } from "@/db/collection-store";
import { getComponentByName } from "@/db/component-store";
import {
  getDraftBlocks,
  setDraftBlocks,
  unknownComponentMessage,
  unknownCollectionMessage,
  resolveSourceAndRequest,
} from "./tool-dispatch-shared";

/** The bound collection's registry fields, or null if it doesn't exist. */
async function collectionFields(table: string) {
  const view = await getCollection(table);
  return view ? view.fields : null;
}

/** A component's declared prop names (the binding allowlist), empty set if absent. */
async function declaredProps(component: string): Promise<Set<string>> {
  const row = await getComponentByName(component);
  return declaredPropNames(row?.propsSchema ?? null);
}

/** The id of the built-in block just appended by add*ToSection (the new block in `after`). */
function newBlockId(before: Block[], after: Block[], component: string): string {
  const had = new Set<string>();
  const collect = (bs: Block[]) => bs.forEach((b) => { had.add(b.id); if (b.children) collect(b.children); });
  collect(before);
  let found = "";
  const scan = (bs: Block[]) => bs.forEach((b) => {
    if (!had.has(b.id) && b.component === component) found = b.id;
    if (b.children) scan(b.children);
  });
  scan(after);
  return found;
}

/** The id of the List just appended by addListToSection. */
function newListId(before: Block[], after: Block[]): string {
  return newBlockId(before, after, LIST_COMPONENT);
}

export async function handleBindComponent(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindComponent(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, block } = valid.value;
  try {
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const target = findBlock(loaded.blocks, block);
    if (!target) return { ok: false, errors: [`no block with id "${block}" on this page`] };

    // Clear → drop the "item" binding (revert to static props).
    if (valid.value.clear) {
      const next = setBlockField(loaded.blocks, block, { bindings: undefined });
      const res = await setDraftBlocks(page, next, loaded.meta);
      if (!res.ok) return { ok: false, errors: res.errors };
      return { ok: true, action: "cleared", page, block };
    }

    // external-data-sources Slice 6: `source`+`request` → an api-kind binding
    // (map values are response dot-paths; only declared props are validatable).
    let binding: BindingRef;
    let boundTo: string;
    if (valid.value.source) {
      const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request!);
      if (!resolved.ok) return { ok: false, errors: [resolved.error] };
      binding = {
        source: {
          kind: "api",
          sourceId: resolved.source.id,
          requestId: resolved.request.id,
          ...(valid.value.params ? { params: valid.value.params } : {}),
        },
        map: valid.value.map!,
      };
      boundTo = resolved.source.name;
      const declared = await declaredProps(target.component);
      const check = validateBinding(binding, null, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    } else {
      binding = {
        source: { collection: valid.value.collection!, filter: valid.value.filter, sort: valid.value.sort },
        map: valid.value.map!,
      };
      boundTo = valid.value.collection!;
      const fields = await collectionFields(valid.value.collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(valid.value.collection!)] };
      const declared = await declaredProps(target.component);
      const check = validateBinding(binding, fields, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    }

    const next = setBlockField(loaded.blocks, block, { bindings: { item: binding } });
    const res = await setDraftBlocks(page, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page,
      block,
      ...(valid.value.source ? { source: boundTo } : { collection: boundTo }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind component: ${(err as Error).message}`] };
  }
}

export async function handleCreateList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, section, collection, template, filter, search, sort, limit, map } = valid.value;
  try {
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const sectionBlock = findBlock(loaded.blocks, section);
    if (!sectionBlock) return { ok: false, errors: [`no block with id "${section}" on this page`] };
    if (!isSection(sectionBlock)) return { ok: false, errors: [`block "${section}" is not a Section (insert a Section first)`] };

    // external-data-sources Slice 6: api rows (`source`+`request`) OR collection rows.
    let listSource: ListSource;
    let rowsFrom: string;
    const declared = await declaredProps(template);
    if (valid.value.source) {
      const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request!);
      if (!resolved.ok) return { ok: false, errors: [resolved.error] };
      listSource = {
        kind: "api",
        sourceId: resolved.source.id,
        requestId: resolved.request.id,
        ...(valid.value.params ? { params: valid.value.params } : {}),
        ...(valid.value.itemsPath ? { itemsPath: valid.value.itemsPath } : {}),
        ...(limit !== undefined ? { limit } : {}),
      };
      rowsFrom = resolved.source.name;
      const check = validateListBinding(listSource, map, null, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    } else {
      listSource = { collection: collection!, filter, search, sort, limit };
      rowsFrom = collection!;
      const fields = await collectionFields(collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(collection!)] };
      const check = validateListBinding(listSource, map, fields, declared);
      if (!check.ok) return { ok: false, errors: check.errors };
    }

    // Insert the built-in List, then stamp its query/map + a template child.
    let next = addListToSection(loaded.blocks, section);
    const listId = newListId(loaded.blocks, next);
    next = setBlockField(next, listId, { listSource, listMap: map });
    const tpl: Block = { id: `${listId}-tpl`, component: template, listRole: "template" };
    next = setBlockChildren(next, listId, [tpl]);

    // Renderable check (mirror the page-blocks editor / setPageBlocks contract).
    // Grandfather the page's existing top-level blocks — this mutation only edits
    // inside a section, so it never introduces a new top-level stray.
    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };

    const res = await setDraftBlocks(page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "created",
      page,
      list: listId,
      template,
      ...(valid.value.source ? { source: rowsFrom } : { collection: rowsFrom }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to create list: ${(err as Error).message}`] };
  }
}

export async function handleBindList(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindList(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { page, block } = valid.value;
  try {
    const loaded = await getDraftBlocks(page);
    if (!loaded) return { ok: false, errors: [`no page with id "${page}"`] };
    const listBlock = findBlock(loaded.blocks, block);
    if (!listBlock) return { ok: false, errors: [`no block with id "${block}" on this page`] };
    if (!isList(listBlock)) return { ok: false, errors: [`block "${block}" is not a List`] };

    // Merge the patch onto the existing config so partial updates work. The row
    // SOURCE kind is resolved first (external-data-sources Slice 6): an explicit
    // `source`/`collection` switches kinds (dropping the other kind's query
    // fields); otherwise the stored kind is kept and patched. Presentation +
    // combobox config always survive — only explicitly-passed fields change.
    const v = valid.value;
    const prevSource: ListSource = listBlock.listSource ?? { collection: "" };
    const wantsApi = v.source !== undefined || (v.collection === undefined && prevSource.kind === "api");

    let base: ListSource;
    let rowsFrom: string;
    if (wantsApi) {
      let sourceId = prevSource.kind === "api" ? prevSource.sourceId : undefined;
      let requestId = prevSource.kind === "api" ? prevSource.requestId : undefined;
      rowsFrom = sourceId ?? "";
      if (v.source) {
        const resolved = await resolveSourceAndRequest(v.source, v.request!);
        if (!resolved.ok) return { ok: false, errors: [resolved.error] };
        sourceId = resolved.source.id;
        requestId = resolved.request.id;
        rowsFrom = resolved.source.name;
      }
      if (!sourceId || !requestId) {
        return { ok: false, errors: ["this list has no row source yet — pass `collection`, or `source`+`request` for API rows"] };
      }
      const { collection: _c, filter: _f, sort: _s, ...keep } = prevSource;
      base = { ...keep, kind: "api", sourceId, requestId };
      if (v.params !== undefined) base.params = v.params;
      if (v.itemsPath !== undefined) base.itemsPath = v.itemsPath;
    } else {
      const collection = v.collection ?? prevSource.collection;
      if (!collection) return { ok: false, errors: ["this list has no collection yet — pass `collection`, or `source`+`request` for API rows"] };
      // Collection lists persist NO kind field (legacy stored lists stay byte-identical).
      const { kind: _k, sourceId: _si, requestId: _ri, params: _p, itemsPath: _ip, ...keep } = prevSource;
      base = { ...keep, collection };
      if (v.filter !== undefined) base.filter = v.filter;
      if (v.search !== undefined) base.search = v.search;
      if (v.sort !== undefined) base.sort = v.sort;
      rowsFrom = collection;
    }

    const patch: Partial<ListSource> = {};
    if (v.limit !== undefined) patch.limit = v.limit;
    if (v.presentation !== undefined) patch.presentation = v.presentation;
    if (v.direction !== undefined) patch.direction = v.direction;
    if (v.columns !== undefined) patch.columns = v.columns;
    if (v.columnsTablet !== undefined) patch.columnsTablet = v.columnsTablet;
    if (v.columnsMobile !== undefined) patch.columnsMobile = v.columnsMobile;
    if (v.gap !== undefined) patch.gap = v.gap;
    if (v.maxSize !== undefined) patch.maxSize = v.maxSize;
    if (v.autoscroll !== undefined) patch.autoscroll = v.autoscroll;
    if (v.autoscrollSpeed !== undefined) patch.autoscrollSpeed = v.autoscrollSpeed;
    if (v.itemList !== undefined) patch.itemList = v.itemList;
    if (v.select !== undefined) patch.select = v.select;
    if (v.min !== undefined) patch.min = v.min;
    if (v.max !== undefined) patch.max = v.max;
    if (v.searchable !== undefined) patch.searchable = v.searchable;
    if (v.valueField !== undefined) patch.valueField = v.valueField;
    if (v.labelField !== undefined) patch.labelField = v.labelField;
    if (v.labelExpr !== undefined) patch.labelExpr = v.labelExpr;
    if (v.name !== undefined) patch.name = v.name;
    if (v.placeholder !== undefined) patch.placeholder = v.placeholder;
    if (v.searchPlaceholder !== undefined) patch.searchPlaceholder = v.searchPlaceholder;
    const listSource = { ...base, ...patch };
    const listMap = valid.value.map ?? listBlock.listMap ?? {};

    // Template: the existing template child's component, unless replacing it.
    const prevTpl = (listBlock.children ?? []).find((c) => c.listRole !== "empty");
    const template = valid.value.template ?? prevTpl?.component;
    if (!template) return { ok: false, errors: ["this list has no template yet — pass `template`"] };

    const declared = await declaredProps(template);
    let check: { ok: true } | { ok: false; errors: string[] };
    if (listSource.kind === "api") {
      check = validateListBinding(listSource, listMap, null, declared);
    } else {
      const fields = await collectionFields(listSource.collection!);
      if (fields === null) return { ok: false, errors: [await unknownCollectionMessage(listSource.collection!)] };
      check = validateListBinding(listSource, listMap, fields, declared);
    }
    if (!check.ok) return { ok: false, errors: check.errors };

    let next = setBlockField(loaded.blocks, block, { listSource, listMap });
    // Replace the template component if requested, preserving any empty-state child.
    if (valid.value.template) {
      const emptyChild = (listBlock.children ?? []).find((c) => c.listRole === "empty");
      const tpl: Block = { id: `${block}-tpl`, component: template, listRole: "template" };
      next = setBlockChildren(next, block, emptyChild ? [tpl, emptyChild] : [tpl]);
    }

    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };
    const res = await setDraftBlocks(page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page,
      list: block,
      template,
      ...(listSource.kind === "api" ? { source: rowsFrom } : { collection: rowsFrom }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind list: ${(err as Error).message}`] };
  }
}

// ── external-data-sources Form slice (d): built-in Form block tools ───────────
// create_form inserts a Form block into a Section column (mirroring create_list)
// and sets its `formTarget`; bind_form PATCHes an existing Form's target/
// messages. Target validation is the whole point: an api target must name a
// REAL source + saved request (resolved by id OR name, ids persisted); a
// collection target must EXIST and have publicSubmissions ENABLED — the same
// gates the submit endpoint enforces at POST time, surfaced at AUTHORING time
// with self-correcting errors. Both tools return the field NAMES the form's
// child inputs must use (mapping is by-name — see submit-core.ts).

type ResolvedFormTarget = {
  target: { api?: { sourceId: string; requestId: string }; collection?: string };
  /** The input names the form's child component must render. */
  fields: string[];
  /** Human label for the result payload (source name / table name). */
  boundTo: string;
};

/** Resolve + validate a form target (api source/request OR collection). */
async function resolveFormTarget(
  sourceRef: string | undefined,
  requestRef: string | undefined,
  collectionRef: string | undefined,
): Promise<{ ok: true; value: ResolvedFormTarget } | { ok: false; error: string }> {
  if (sourceRef) {
    const resolved = await resolveSourceAndRequest(sourceRef, requestRef!);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return {
      ok: true,
      value: {
        target: { api: { sourceId: resolved.source.id, requestId: resolved.request.id } },
        fields: requestPlaceholders({
          path: resolved.request.path,
          query: resolved.request.query,
          bodyTemplate: resolved.request.bodyTemplate,
        }),
        boundTo: resolved.source.name,
      },
    };
  }
  const view = await getCollection(collectionRef!);
  if (!view) return { ok: false, error: await unknownCollectionMessage(collectionRef!) };
  if (!view.publicSubmissions) {
    return {
      ok: false,
      error:
        `collection "${view.tableName}" exists but has NOT opted in to public form submissions ` +
        `(publicSubmissions is off), so a visitor form cannot write to it. The operator must enable it ` +
        `first — PATCH /api/collections/${view.tableName} with {"_op":"set_public_submissions","enabled":true} ` +
        `(a deliberate operator-only switch; there is no AI tool to flip it). Then retry this tool.`,
    };
  }
  return {
    ok: true,
    value: {
      target: { collection: view.tableName },
      fields: view.fields.map((f) => f.name),
      boundTo: view.tableName,
    },
  };
}

/** The `fields` guidance both tools return (by-name mapping, see form-tools.ts). */
function formFieldsNote(target: { api?: unknown }, fields: string[], child?: string): string {
  const what = target.api
    ? "the saved request's {placeholder} names"
    : "the collection's declared field names";
  const needs =
    fields.length > 0
      ? `<input name=…> fields matching ${what} (${fields.join(", ")}) and a type="submit" button`
      : `only a type="submit" button (this target declares no fields)`;
  return child
    ? `placed "${child}" inside the form — verify it renders ${needs}`
    : `place a component inside the form that renders ${needs}`;
}

export async function handleCreateForm(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateForm(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const loaded = await getDraftBlocks(v.page);
    if (!loaded) return { ok: false, errors: [`no page with id "${v.page}"`] };
    const sectionBlock = findBlock(loaded.blocks, v.section);
    if (!sectionBlock) return { ok: false, errors: [`no block with id "${v.section}" on this page`] };
    if (!isSection(sectionBlock)) return { ok: false, errors: [`block "${v.section}" is not a Section (insert a Section first)`] };

    // Optional `child`: an EXISTING component placed inside the form in the same
    // call (one call → a submittable form, no full-replace update_page_blocks).
    if (v.child && !(await getComponentByName(v.child))) {
      return { ok: false, errors: [await unknownComponentMessage([v.child])] };
    }

    const resolved = await resolveFormTarget(v.source, v.request, v.collection);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };

    const formTarget = mergeFormTarget(undefined, {
      ...resolved.value.target,
      successMessage: v.successMessage,
      errorMessage: v.errorMessage,
      redirect: v.redirect,
    });

    let next = addFormToSection(loaded.blocks, v.section);
    const formId = newBlockId(loaded.blocks, next, FORM_COMPONENT);
    if (!formId) return { ok: false, errors: [`failed to insert the Form into section "${v.section}"`] };
    next = setBlockField(next, formId, { formTarget });
    if (v.child) next = setBlockChildren(next, formId, [{ id: `${formId}-child`, component: v.child }]);

    const shape = validateBlocks(next, {
      grandfatheredTopLevelIds: topLevelBlockIds(loaded.blocks),
    });
    if (!shape.ok) return { ok: false, errors: shape.errors };
    const res = await setDraftBlocks(v.page, shape.blocks, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "created",
      page: v.page,
      form: formId,
      ...(resolved.value.target.api ? { source: resolved.value.boundTo } : { collection: resolved.value.boundTo }),
      ...(v.child ? { child: v.child } : {}),
      fields: resolved.value.fields,
      note: formFieldsNote(resolved.value.target, resolved.value.fields, v.child),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to create form: ${(err as Error).message}`] };
  }
}

export async function handleBindForm(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateBindForm(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const v = valid.value;
  try {
    const loaded = await getDraftBlocks(v.page);
    if (!loaded) return { ok: false, errors: [`no page with id "${v.page}"`] };
    const formBlock = findBlock(loaded.blocks, v.block);
    if (!formBlock) return { ok: false, errors: [`no block with id "${v.block}" on this page`] };
    if (!isForm(formBlock)) return { ok: false, errors: [`block "${v.block}" is not a Form (create one with create_form)`] };

    if (v.clear) {
      const next = setBlockField(loaded.blocks, v.block, { formTarget: undefined });
      const res = await setDraftBlocks(v.page, next, loaded.meta);
      if (!res.ok) return { ok: false, errors: res.errors };
      return { ok: true, action: "cleared", page: v.page, form: v.block };
    }

    // A target patch is validated fresh; a messages-only patch keeps (and
    // re-validates nothing about) the stored target — but the stored target must
    // EXIST for the messages to ever show, so surface that as a hint, not a block.
    let resolved: ResolvedFormTarget | null = null;
    if (v.source || v.collection) {
      const r = await resolveFormTarget(v.source, v.request, v.collection);
      if (!r.ok) return { ok: false, errors: [r.error] };
      resolved = r.value;
    }

    const prev = formBlock.formTarget as FormTarget | undefined;
    const formTarget = mergeFormTarget(prev, {
      ...(resolved ? resolved.target : {}),
      successMessage: v.successMessage,
      errorMessage: v.errorMessage,
      redirect: v.redirect,
    });
    if (!formTarget.kind) {
      return {
        ok: false,
        errors: [
          "this form has no target yet — pass `source`+`request` (API saved request) or `collection` (opted-in collection) along with your change",
        ],
      };
    }

    const next = setBlockField(loaded.blocks, v.block, { formTarget });
    const res = await setDraftBlocks(v.page, next, loaded.meta);
    if (!res.ok) return { ok: false, errors: res.errors };
    return {
      ok: true,
      action: "bound",
      page: v.page,
      form: v.block,
      ...(resolved
        ? {
            ...(resolved.target.api ? { source: resolved.boundTo } : { collection: resolved.boundTo }),
            fields: resolved.fields,
            note: formFieldsNote(resolved.target, resolved.fields),
          }
        : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to bind form: ${(err as Error).message}`] };
  }
}
