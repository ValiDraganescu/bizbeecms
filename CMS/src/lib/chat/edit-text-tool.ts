/**
 * `edit_text` tool — patch a long-text field by string-replace, WITHOUT rewriting
 * the whole field (the edit strategy code agents use; see `apply-edit.ts`). The
 * model sends a `target` + selector + `oldString`/`newString`; we load the field,
 * apply the edit, and persist. So changing a few words in a component's `script`
 * or a saved prompt's body costs a snippet and can't corrupt the untouched text.
 *
 * Targets are the FIXED long-text fields worth editing in place:
 *   - component.script / component.css   (selector: name)
 *   - prompt.prompt                       (selector: id)
 * (A tree field like component.tree or a page's blocks is NOT a text field — those
 * stay read→replace-whole; editing structure by string-replace is unsafe.)
 *
 * PURE here: the SCHEMA + the untrusted-arg validator. The dispatch handler in
 * `tool-dispatch.ts` does the load/apply/save (it owns the stores + apply-edit).
 */

/** The editable long-text fields, as `target` enum values. */
export const EDIT_TEXT_TARGETS = [
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
      "Patch a long-text field by replacing a snippet, instead of rewriting the whole value (use this to change a few words/lines without re-emitting everything). Provide `oldString` (an exact snippet currently in the field, with enough surrounding context to be unique) and `newString`. Editable targets: 'component.script' / 'component.css' (selector: name), 'prompt.prompt' (selector: id). For structural fields (a component's tree or a page's blocks) use the update_* tools instead.",
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
