/**
 * `edit_text` tool — patch a long-text field by string-replace, WITHOUT rewriting
 * the whole field (the edit strategy code agents use; see `apply-edit.ts`). The
 * model sends a `target` + selector + `oldString`/`newString`; we load the field,
 * apply the edit, and persist. So changing a few words in a component's `script`
 * or a saved prompt's body costs a snippet and can't corrupt the untouched text.
 *
 * Targets are the FIXED long-text fields worth editing in place:
 *   - component.html / component.script / component.css   (selector: name)
 *   - prompt.prompt                                        (selector: id)
 * html edits are safe because the patched string re-enters the SAME strict gate
 * as a full update (parse + planTree + lint-component-html tag/slot checks, plus
 * the slot↔schema cross-check against the stored propsSchema) — a patch that
 * unbalances the markup is rejected, never silently "repaired". A page's blocks
 * stay read→replace-whole (structured JSON, not a text field).
 *
 * PURE here: the SCHEMA + the untrusted-arg validator. The dispatch handler in
 * `tool-dispatch.ts` does the load/apply/save (it owns the stores + apply-edit).
 */

/** The editable long-text fields, as `target` enum values. */
export const EDIT_TEXT_TARGETS = [
  "component.html",
  "component.script",
  "component.css",
  "prompt.prompt",
] as const;
export type EditTextTarget = (typeof EDIT_TEXT_TARGETS)[number];

export const EDIT_TEXT_TOOL = {
  type: "function",
  function: {
    name: "edit_text",
    description:
      "Patch a long-text field by replacing a snippet, instead of rewriting the whole value — the PREFERRED way to change an EXISTING component (cheaper, and the untouched code cannot drift). get_component first, then provide `oldString` (an exact snippet currently in the field, with enough surrounding context to be unique) and `newString`. Editable targets: 'component.html' / 'component.script' / 'component.css' (selector: name), 'prompt.prompt' (selector: id). Every html edit is re-validated exactly like update_component (tag balance, slot syntax, declared slots) — a patch that would break the markup is rejected with the reason. Fall back to update_component's full re-author ONLY for a wholesale restructure, or when several edit_text attempts in a row could not locate their snippet. For a page's blocks use the page tools instead.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: [...EDIT_TEXT_TARGETS],
          description: "Which field to edit.",
        },
        name: {
          type: "string",
          description: "The component name (required when target starts with 'component.').",
        },
        id: {
          type: "string",
          description: "The prompt-version id (required when target is 'prompt.prompt').",
        },
        oldString: {
          type: "string",
          description: "The exact snippet to replace (unique within the field; add surrounding context if needed).",
        },
        newString: { type: "string", description: "The replacement text." },
        replaceAll: {
          type: "boolean",
          description: "Replace every occurrence of oldString (default false — a non-unique oldString errors otherwise).",
        },
      },
      required: ["target", "oldString", "newString"],
    },
  },
} as const;

export type ValidatedEditText = {
  target: EditTextTarget;
  selector: string; // component name or prompt id
  oldString: string;
  newString: string;
  replaceAll: boolean;
};

/**
 * Validate untrusted `edit_text` args: a known target, the selector that target
 * needs (name for component.*, id for prompt.*), and non-empty old/new strings.
 * Returns the normalized value or an error string.
 */
export function validateEditText(raw: unknown): ValidatedEditText | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "args must be an object" };
  const b = raw as Record<string, unknown>;

  const target = b.target;
  if (typeof target !== "string" || !(EDIT_TEXT_TARGETS as readonly string[]).includes(target)) {
    return { error: `target must be one of: ${EDIT_TEXT_TARGETS.join(", ")}` };
  }
  const t = target as EditTextTarget;

  const needsName = t.startsWith("component.");
  const selectorRaw = needsName ? b.name : b.id;
  if (typeof selectorRaw !== "string" || selectorRaw.trim() === "") {
    return { error: needsName ? "name is required for a component target" : "id is required for a prompt target" };
  }

  if (typeof b.oldString !== "string" || b.oldString === "") {
    return { error: "oldString must be a non-empty string" };
  }
  if (typeof b.newString !== "string") return { error: "newString must be a string" };

  return {
    target: t,
    selector: selectorRaw.trim(),
    oldString: b.oldString,
    newString: b.newString,
    replaceAll: b.replaceAll === true,
  };
}
