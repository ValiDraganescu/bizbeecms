/**
 * edit_text tool handler (split from `tool-dispatch.ts`): string-replace patch
 * of a long-text field. Registered in the shared HANDLERS map in
 * `tool-dispatch.ts`.
 *
 * Load the targeted field, apply the snippet edit (apply-edit's cascading
 * matchers + safety rails), re-validate where needed, and persist. Never
 * rewrites the whole field; an ambiguous/absent oldString returns a
 * recoverable error.
 */
import { validateEditText } from "./edit-text-tool";
import { applyEdit } from "./apply-edit";
import { validateComponentArtifact } from "./component-tool";
import { lintComponentScript } from "./lint-component-script";
import { reconcileComponentClasses } from "./reconcile-classes";
import { getComponentByName, upsertComponent } from "@/db/component-store";
import { getPromptVersion, updatePromptVersion } from "@/db/prompt-version-store";
import type { TreeNode } from "@/lib/render/tree";
import { treeToHtml } from "@/lib/render/parse-html";

export async function handleEditText(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateEditText(args);
  if ("error" in valid) return { ok: false, errors: [valid.error] };
  const { target, selector, oldString, newString, replaceAll } = valid;

  try {
    if (target === "component.html" || target === "component.script" || target === "component.css") {
      // Edit the DRAFT base (preferDraft) so a tweak stacks on the pending
      // draft instead of reverting to live; upsertComponent re-drafts it.
      const row = await getComponentByName(selector, true);
      if (!row) return { ok: false, errors: [`no component named "${selector}"`] };
      // The edit base for html is the SAME serialization get_component shows the
      // model (treeToHtml of the stored tree), so its oldString quotes match.
      let tree: TreeNode;
      try {
        tree = JSON.parse(row.tree as string) as TreeNode;
      } catch {
        return { ok: false, errors: ["stored component markup is not valid; use update_component"] };
      }
      const storedHtml = treeToHtml(tree);
      const field = target === "component.html" ? "html" : target === "component.script" ? "script" : "css";
      const current =
        field === "html" ? storedHtml
        : field === "script" ? ((row.script as string) ?? "")
        : ((row.css as string) ?? "");
      const edit = applyEdit(current, oldString, newString, replaceAll);
      if (!edit.ok) return { ok: false, errors: [edit.error] };

      // Re-pass the FULL artifact through the same validate gate as create/update
      // — an html patch re-runs the strict lint (tag balance, slot syntax). For
      // html edits the STORED propsSchema rides along so the slot↔schema
      // cross-check runs too (only for html: a script/css tweak must not be
      // blocked by a pre-existing slot issue in untouched markup).
      const artifact = {
        name: row.name,
        html: field === "html" ? edit.content : storedHtml,
        script: field === "script" ? edit.content : ((row.script as string) ?? ""),
        css: field === "css" ? edit.content : ((row.css as string) ?? ""),
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
        replacements: edit.replacements,
        matcher: edit.matcher,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    // prompt.prompt
    const version = await getPromptVersion(selector);
    if (!version) return { ok: false, errors: [`no prompt version with id "${selector}"`] };
    const edit = applyEdit(version.prompt, oldString, newString, replaceAll);
    if (!edit.ok) return { ok: false, errors: [edit.error] };
    const updated = await updatePromptVersion(selector, { prompt: edit.content });
    if (!updated) return { ok: false, errors: [`no prompt version with id "${selector}"`] };
    return { ok: true, action: "edited", target, prompt: updated, replacements: edit.replacements, matcher: edit.matcher };
  } catch (err) {
    return { ok: false, errors: [`failed to edit text: ${(err as Error).message}`] };
  }
}
