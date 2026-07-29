/**
 * edit_text tool handler (split from `tool-dispatch.ts`): string-edit patch of
 * a long-text field. Registered in the shared HANDLERS map in
 * `tool-dispatch.ts`.
 *
 * Load the targeted field, apply the edit (replace mode = apply-edit's
 * cascading matchers; replaceBetween mode = exact markers with near-miss
 * errors), re-validate through the SAME gate a full update of that field uses,
 * and persist. Never rewrites the whole field; an ambiguous/absent snippet or
 * marker returns a recoverable error and nothing is written.
 */
import { validateEditText, type EditTextEdit, type EditTextTargetSpec } from "./edit-text-tool";
import { applyEdit, applyBetween, type EditResult } from "./apply-edit";
import { validateComponentArtifact } from "./component-tool";
import { lintComponentScript } from "./lint-component-script";
import { reconcileComponentClasses } from "./reconcile-classes";
import { applyRequestPatch } from "./data-source-tools";
import { handleUpdateChatAgent, unknownAgentMessage } from "./tool-dispatch-chat-agents";
import { resolveSourceAndRequest, unknownCollectionMessage } from "./tool-dispatch-shared";
import { getComponentByName, upsertComponent } from "@/db/component-store";
import { getPromptVersion, updatePromptVersion } from "@/db/prompt-version-store";
import { getChatAgent } from "@/db/chat-agent-store";
import { updateDataSourceRequest } from "@/db/data-source-store";
import { getCollection } from "@/db/collection-store";
import { getItem, updateItem } from "@/db/item-store";
import { parseStoredWelcome } from "@/lib/public-chat/core";
import type { TreeNode } from "@/lib/render/tree";
import { treeToHtml } from "@/lib/render/parse-html";

type ToolResult = Record<string, unknown>;

/** Run the validated edit against the current field text (pure). */
function runEdit(current: string, edit: EditTextEdit): EditResult {
  return edit.mode === "replace"
    ? applyEdit(current, edit.oldString, edit.newString, edit.replaceAll)
    : applyBetween(current, edit.start, edit.end, edit.newString, {
        inclusive: edit.inclusive,
        occurrence: edit.occurrence,
      });
}

export async function handleEditText(args: unknown): Promise<ToolResult> {
  const valid = validateEditText(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  const { target, spec, edit } = valid;

  try {
    switch (spec.kind) {
      case "component":
        return await editComponent(target, spec, edit);
      case "prompt":
        return await editPrompt(target, spec, edit);
      case "agent_prompt":
        return await editAgentPrompt(target, spec, edit);
      case "agent_welcome":
        return await editAgentWelcome(target, spec, edit);
      case "request_body":
        return await editRequestBody(target, spec, edit);
      case "item_field":
        return await editItemField(target, spec, edit);
    }
  } catch (err) {
    return { ok: false, errors: [`failed to edit text: ${(err as Error).message}`] };
  }
}

async function editComponent(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "component" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  // Edit the DRAFT base (preferDraft) so a tweak stacks on the pending
  // draft instead of reverting to live; upsertComponent re-drafts it.
  const row = await getComponentByName(spec.name, true);
  if (!row) return { ok: false, errors: [`no component named "${spec.name}"`] };
  // The edit base for html is the SAME serialization get_component shows the
  // model (treeToHtml of the stored tree), so its oldString quotes match.
  let tree: TreeNode;
  try {
    tree = JSON.parse(row.tree as string) as TreeNode;
  } catch {
    return { ok: false, errors: ["stored component markup is not valid; use update_component"] };
  }
  const storedHtml = treeToHtml(tree);
  const field = spec.field;
  const current =
    field === "html" ? storedHtml
    : field === "script" ? ((row.script as string) ?? "")
    : ((row.css as string) ?? "");
  const edited = runEdit(current, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };

  // Re-pass the FULL artifact through the same validate gate as create/update
  // — an html patch re-runs the strict lint (tag balance, slot syntax). For
  // html edits the STORED propsSchema rides along so the slot↔schema
  // cross-check runs too (only for html: a script/css tweak must not be
  // blocked by a pre-existing slot issue in untouched markup).
  const artifact = {
    name: row.name,
    html: field === "html" ? edited.content : storedHtml,
    script: field === "script" ? edited.content : ((row.script as string) ?? ""),
    css: field === "css" ? edited.content : ((row.css as string) ?? ""),
    ...(field === "html" && row.propsSchema ? { propsSchema: row.propsSchema as string } : {}),
  };
  const checked = validateComponentArtifact(artifact);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  // Script↔markup lint: BLOCKS when the script itself is being edited (the
  // model is authoring it now); rides as a warning on html/css edits — a
  // pre-existing script nit must not block an unrelated text tweak, but an
  // html edit that removes a hook the script queries should be surfaced.
  const scriptFindings = lintComponentScript(checked.artifact.tree, checked.artifact.script);
  if (field === "script" && scriptFindings.length > 0) {
    return { ok: false, errors: scriptFindings };
  }
  const res = await upsertComponent(checked.artifact);
  const warnings = [
    ...(field === "script" ? [] : scriptFindings),
    ...(await reconcileComponentClasses(
      checked.artifact.tree,
      checked.artifact.css,
      checked.artifact.script,
    )),
  ];
  return {
    ok: true,
    action: "edited",
    target,
    component: res.name,
    replacements: edited.replacements,
    matcher: edited.matcher,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function editPrompt(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "prompt" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  const version = await getPromptVersion(spec.id);
  if (!version) return { ok: false, errors: [`no prompt version with id "${spec.id}"`] };
  const edited = runEdit(version.prompt, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };
  const updated = await updatePromptVersion(spec.id, { prompt: edited.content });
  if (!updated) return { ok: false, errors: [`no prompt version with id "${spec.id}"`] };
  return { ok: true, action: "edited", target, prompt: updated, replacements: edited.replacements, matcher: edited.matcher };
}

/**
 * chat_agent.systemPrompt: edit the stored prompt, then persist through
 * handleUpdateChatAgent — LITERALLY the same gate + write path as a full
 * `update_chat_agent {systemPrompt}` (e.g. an edit that empties the prompt is
 * rejected there; nothing written).
 */
async function editAgentPrompt(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "agent_prompt" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  const row = await getChatAgent(spec.agent);
  if (!row) return { ok: false, errors: [await unknownAgentMessage(spec.agent)] };
  const edited = runEdit(row.systemPrompt, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };
  const res = await handleUpdateChatAgent({ agent: row.id, systemPrompt: edited.content });
  if (res.ok !== true) return res;
  return { ok: true, action: "edited", target, agent: row.name, replacements: edited.replacements, matcher: edited.matcher };
}

/**
 * chat_agent.welcomeMessage.<locale>: edit ONE locale's greeting, then persist
 * as an update_chat_agent per-locale merge patch ({<locale>: edited}) — the
 * same applyWelcomePatch gate as a full update; other locales untouched.
 */
async function editAgentWelcome(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "agent_welcome" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  const row = await getChatAgent(spec.agent);
  if (!row) return { ok: false, errors: [await unknownAgentMessage(spec.agent)] };
  if (row.welcomeMessage === null) {
    return {
      ok: false,
      errors: [
        `agent "${row.name}" has no welcomeMessage — set one with update_chat_agent (a locale object like {"${spec.locale}":"…"}) before patching a locale`,
      ],
    };
  }
  const parsed = parseStoredWelcome(row.welcomeMessage);
  if (typeof parsed === "string") {
    return {
      ok: false,
      errors: [
        `agent "${row.name}"'s welcomeMessage is a single plain string (the same greeting for every locale), not per-locale — change it with update_chat_agent, or set a locale object there first`,
      ],
    };
  }
  const current = parsed[spec.locale];
  if (current === undefined) {
    return {
      ok: false,
      errors: [
        `welcomeMessage has no "${spec.locale}" greeting — its locales: ${Object.keys(parsed).join(", ")}. Add the locale with update_chat_agent (welcomeMessage: {"${spec.locale}":"…"})`,
      ],
    };
  }
  const edited = runEdit(current, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };
  const res = await handleUpdateChatAgent({
    agent: row.id,
    welcomeMessage: { [spec.locale]: edited.content },
  });
  if (res.ok !== true) return res;
  return {
    ok: true,
    action: "edited",
    target,
    agent: row.name,
    locale: spec.locale,
    replacements: edited.replacements,
    matcher: edited.matcher,
  };
}

/**
 * data_request.bodyTemplate: edit the saved request's body template, then
 * re-validate the WHOLE request via applyRequestPatch — the same gate as
 * set_data_source_request — and persist in place (request id stays stable).
 */
async function editRequestBody(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "request_body" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  const resolved = await resolveSourceAndRequest(spec.source, spec.request);
  if (!resolved.ok) return { ok: false, errors: [resolved.error] };
  const { source, request } = resolved;
  if (request.bodyTemplate == null || request.bodyTemplate === "") {
    return {
      ok: false,
      errors: [
        `saved request "${request.name}" has no bodyTemplate to edit — set one with set_data_source_request (note: GET requests cannot have a body)`,
      ],
    };
  }
  const edited = runEdit(request.bodyTemplate, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };
  const patched = applyRequestPatch(request, request.name, { bodyTemplate: edited.content });
  if (!patched.ok) return { ok: false, errors: [patched.error] };
  const updated = await updateDataSourceRequest(source.id, request.id, patched.value.request);
  if (!updated) return { ok: false, errors: [`saved request "${request.name}" disappeared while editing — list_data_sources to re-check`] };
  return {
    ok: true,
    action: "edited",
    target,
    source: source.name,
    request: updated.name,
    replacements: edited.replacements,
    matcher: edited.matcher,
  };
}

/**
 * collection_item.<field>: edit ONE item's long-text field, then persist via
 * updateItem — the same coerceFieldValue gate as update_collection_item. Only
 * text/richtext fields are patchable; other types get the right tool named.
 */
async function editItemField(
  target: string,
  spec: Extract<EditTextTargetSpec, { kind: "item_field" }>,
  edit: EditTextEdit,
): Promise<ToolResult> {
  const view = await getCollection(spec.collection);
  if (!view) return { ok: false, errors: [await unknownCollectionMessage(spec.collection)] };
  const field = view.fields.find((f) => f.name === spec.field);
  if (!field) {
    const have = view.fields.map((f) => f.name).join(", ") || "none";
    return { ok: false, errors: [`field "${spec.field}" does not exist on ${spec.collection} — its user fields are: ${have}`] };
  }
  if (field.type !== "text" && field.type !== "richtext") {
    return {
      ok: false,
      errors: [
        `field "${spec.field}" on ${spec.collection} is type "${field.type}" — edit_text only patches long-text fields (text, richtext); change a ${field.type} value with update_collection_item`,
      ],
    };
  }
  const item = await getItem(spec.collection, spec.id);
  if (!item.ok) {
    return { ok: false, errors: [`item "${spec.id}" not found in ${spec.collection} — query_collection shows item ids`] };
  }
  const raw = item.plan[spec.field];
  if (raw == null || raw === "") {
    return { ok: false, errors: [`field "${spec.field}" on item "${spec.id}" is empty — nothing to patch; set it with update_collection_item`] };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      errors: [
        `field "${spec.field}" holds per-locale values — change it with update_collection_item (pass a locale object like {"en":"…"})`,
      ],
    };
  }
  const edited = runEdit(raw, edit);
  if (!edited.ok) return { ok: false, errors: [edited.error] };
  const res = await updateItem(spec.collection, spec.id, { [spec.field]: edited.content });
  if (!res.ok) return { ok: false, errors: [res.error] };
  return {
    ok: true,
    action: "edited",
    target,
    collection: spec.collection,
    id: spec.id,
    field: spec.field,
    replacements: edited.replacements,
    matcher: edited.matcher,
  };
}
