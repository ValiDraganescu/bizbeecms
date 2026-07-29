/**
 * `edit_text` tool — patch a long-text field by string edit, WITHOUT rewriting
 * the whole field (the edit strategy code agents use; see `apply-edit.ts`). Two
 * modes: replace (`oldString`/`newString`) and replaceBetween (`start` + `end`
 * markers). The model sends a `target` + selector + the mode's args; the
 * handler loads the field, applies the edit, and persists. So changing a few
 * words in a 9k-char systemPrompt costs a snippet and can't corrupt the
 * untouched text.
 *
 * Targets are the FIXED long-text fields worth editing in place:
 *   - component.html / component.script / component.css   (selector: name)
 *   - prompt.prompt                                        (selector: id)
 *   - chat_agent.systemPrompt                              (selector: agent)
 *   - chat_agent.welcomeMessage.<locale>                   (selector: agent)
 *   - data_request.bodyTemplate                            (selector: source + request)
 *   - collection_item.<field>                              (selector: collection + id)
 * Every patched value re-enters the SAME validation gate as a full update of
 * that field (component lint, agent config rules, request validation, item
 * field coercion) — a patch that would break the field is rejected, never
 * silently "repaired". A page's blocks stay read→replace-whole (structured
 * JSON, not a text field).
 *
 * PURE here: the SCHEMA + the untrusted-arg validator. The dispatch handler in
 * `tool-dispatch-edit-text.ts` does the load/apply/save (it owns the stores +
 * apply-edit).
 */
import { isValidLocaleCode, normalizeLocaleCode } from "../render/localize.ts";

/** The editable target FORMS (documentation + description source of truth). */
export const EDIT_TEXT_TARGET_FORMS = [
  "component.html",
  "component.script",
  "component.css",
  "prompt.prompt",
  "chat_agent.systemPrompt",
  "chat_agent.welcomeMessage.<locale>",
  "data_request.bodyTemplate",
  "collection_item.<field>",
] as const;

export const EDIT_TEXT_TOOL = {
  type: "function",
  function: {
    name: "edit_text",
    description:
      "Patch a long-text field by editing a snippet, instead of rewriting the whole value — the PREFERRED way to change EXISTING long text (cheaper, and the untouched text cannot drift). Read the field first (get_component / get_chat_agent / list_data_sources / query_collection), then use ONE of two modes (their args are mutually exclusive): (1) replace — `oldString` (an exact snippet currently in the field, with enough surrounding context to be unique) + `newString`; `replaceAll: true` replaces every occurrence. (2) replaceBetween — `start` + `end` markers + `newString`: replaces the text between the first `start` match and the next `end` after it; `inclusive: true` replaces the markers too (default false — markers kept); when `start` matches more than once you MUST pass `occurrence` (1-based index of the start match). A snippet/marker that is not found errors quoting the nearest near-miss from the actual text. Targets and their selector args: 'component.html' / 'component.script' / 'component.css' (name), 'prompt.prompt' (id: the prompt-version id), 'chat_agent.systemPrompt' (agent: id or name), 'chat_agent.welcomeMessage.<locale>' e.g. 'chat_agent.welcomeMessage.en' (agent; patches that ONE locale's greeting), 'data_request.bodyTemplate' (source + request: ids or names), 'collection_item.<field>' e.g. 'collection_item.description' (collection: the content_<slug> table + id: the item id; text/richtext fields only — other field types belong to update_collection_item). Every patched result re-enters the SAME validation gate as a full update of that field (html tag/slot lint, agent config rules, saved-request validation, item field coercion) — a patch that would break the field is rejected with the reason and nothing is written. Fall back to the field's full update tool ONLY for a wholesale rewrite, or when several edit_text attempts in a row could not locate their snippet. For a page's blocks use the page tools instead.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: `Which field to edit — one of: ${EDIT_TEXT_TARGET_FORMS.join(", ")} (<locale> = a locale code like en; <field> = the collection field name).`,
        },
        name: {
          type: "string",
          description: "The component name (required when target starts with 'component.').",
        },
        id: {
          type: "string",
          description: "The prompt-version id ('prompt.prompt') or the item id ('collection_item.<field>').",
        },
        agent: {
          type: "string",
          description: "The chat agent's id or name (required when target starts with 'chat_agent.').",
        },
        source: {
          type: "string",
          description: "The data source id or name (required for 'data_request.bodyTemplate').",
        },
        request: {
          type: "string",
          description: "The saved request id or name (required for 'data_request.bodyTemplate').",
        },
        collection: {
          type: "string",
          description: "The collection's content_<slug> table name (required for 'collection_item.<field>').",
        },
        oldString: {
          type: "string",
          description: "Replace mode: the exact snippet to replace (unique within the field; add surrounding context if needed).",
        },
        newString: { type: "string", description: "The replacement text (both modes)." },
        replaceAll: {
          type: "boolean",
          description: "Replace mode: replace every occurrence of oldString (default false — a non-unique oldString errors otherwise).",
        },
        start: {
          type: "string",
          description: "replaceBetween mode: the exact marker BEFORE the span to replace.",
        },
        end: {
          type: "string",
          description: "replaceBetween mode: the exact marker AFTER the span (the first match following start).",
        },
        inclusive: {
          type: "boolean",
          description: "replaceBetween mode: also replace the start/end markers themselves (default false — markers kept).",
        },
        occurrence: {
          type: "integer",
          description: "replaceBetween mode: 1-based index of the start match to use (required when start matches more than once).",
        },
      },
      required: ["target", "newString"],
    },
  },
} as const;

/** Which field to edit + the selector(s) that locate it. */
export type EditTextTargetSpec =
  | { kind: "component"; field: "html" | "script" | "css"; name: string }
  | { kind: "prompt"; id: string }
  | { kind: "agent_prompt"; agent: string }
  | { kind: "agent_welcome"; agent: string; locale: string }
  | { kind: "request_body"; source: string; request: string }
  | { kind: "item_field"; collection: string; id: string; field: string };

/** The edit to apply — exactly one of the two modes. */
export type EditTextEdit =
  | { mode: "replace"; oldString: string; newString: string; replaceAll: boolean }
  | {
      mode: "between";
      start: string;
      end: string;
      newString: string;
      inclusive: boolean;
      occurrence: number | null;
    };

export type ValidatedEditText = { target: string; spec: EditTextTargetSpec; edit: EditTextEdit };

/** Read a required selector arg; empty/missing → the given self-correcting error. */
function selectorArg(b: Record<string, unknown>, key: string, error: string): string | { error: string } {
  const raw = b[key];
  if (typeof raw !== "string" || raw.trim() === "") return { error };
  return raw.trim();
}

const WELCOME_PREFIX = "chat_agent.welcomeMessage";
const ITEM_PREFIX = "collection_item";

/** Parse + validate the `target` string and its selector args into a spec. */
function parseTarget(target: string, b: Record<string, unknown>): EditTextTargetSpec | { error: string } {
  if (target === "component.html" || target === "component.script" || target === "component.css") {
    const name = selectorArg(b, "name", "name is required for a component target");
    if (typeof name !== "string") return name;
    return { kind: "component", field: target.slice("component.".length) as "html" | "script" | "css", name };
  }
  if (target === "prompt.prompt") {
    const id = selectorArg(b, "id", "id is required for a prompt target (the prompt-version id)");
    if (typeof id !== "string") return id;
    return { kind: "prompt", id };
  }
  if (target === "chat_agent.systemPrompt" || target === WELCOME_PREFIX || target.startsWith(WELCOME_PREFIX + ".")) {
    const agent = selectorArg(b, "agent", "agent (id or name) is required for a chat_agent target — list_chat_agents shows them");
    if (typeof agent !== "string") return agent;
    if (target === "chat_agent.systemPrompt") return { kind: "agent_prompt", agent };
    const locale = target.slice(WELCOME_PREFIX.length + 1);
    if (locale === "" || target === WELCOME_PREFIX) {
      return { error: "target must name the locale: chat_agent.welcomeMessage.<locale> (e.g. chat_agent.welcomeMessage.en)" };
    }
    if (!isValidLocaleCode(locale)) {
      return { error: `"${locale}" is not a locale code (like "en" or "pt-br") — target form: chat_agent.welcomeMessage.<locale>` };
    }
    return { kind: "agent_welcome", agent, locale: normalizeLocaleCode(locale) };
  }
  if (target === "data_request.bodyTemplate") {
    const source = selectorArg(b, "source", "source (id or name) is required for the data_request.bodyTemplate target — list_data_sources shows them");
    if (typeof source !== "string") return source;
    const request = selectorArg(b, "request", "request (id or name) is required for the data_request.bodyTemplate target — list_data_sources shows each source's saved requests");
    if (typeof request !== "string") return request;
    return { kind: "request_body", source, request };
  }
  if (target === ITEM_PREFIX || target.startsWith(ITEM_PREFIX + ".")) {
    const field = target === ITEM_PREFIX ? "" : target.slice(ITEM_PREFIX.length + 1);
    if (field === "") {
      return { error: "target must name the field: collection_item.<field> (e.g. collection_item.description)" };
    }
    const collection = selectorArg(b, "collection", "collection (the content_<slug> table name) is required for a collection_item target");
    if (typeof collection !== "string") return collection;
    const id = selectorArg(b, "id", "id (the item id) is required for a collection_item target — query_collection shows item ids");
    if (typeof id !== "string") return id;
    return { kind: "item_field", collection, id, field };
  }
  return { error: `unknown target "${target}" — use one of: ${EDIT_TEXT_TARGET_FORMS.join(", ")}` };
}

/** Parse + validate the edit-mode args (exactly one mode). */
function parseEdit(b: Record<string, unknown>): EditTextEdit | { error: string } {
  const hasReplace = b.oldString !== undefined || b.replaceAll !== undefined;
  const hasBetween =
    b.start !== undefined || b.end !== undefined || b.inclusive !== undefined || b.occurrence !== undefined;
  if (hasReplace && hasBetween) {
    return {
      error:
        "pass EITHER oldString/replaceAll (replace mode) OR start/end/inclusive/occurrence (replaceBetween mode) — not args from both",
    };
  }
  if (!hasReplace && !hasBetween) {
    return {
      error:
        "pass oldString + newString (replace mode) or start + end + newString (replaceBetween mode)",
    };
  }
  if (typeof b.newString !== "string") return { error: "newString must be a string" };

  if (hasReplace) {
    if (typeof b.oldString !== "string" || b.oldString === "") {
      return { error: "oldString must be a non-empty string" };
    }
    return { mode: "replace", oldString: b.oldString, newString: b.newString, replaceAll: b.replaceAll === true };
  }

  if (typeof b.start !== "string" || b.start === "") {
    return { error: "start must be a non-empty string (the marker before the span to replace)" };
  }
  if (typeof b.end !== "string" || b.end === "") {
    return { error: "end must be a non-empty string (the marker after the span to replace)" };
  }
  let occurrence: number | null = null;
  if (b.occurrence !== undefined && b.occurrence !== null) {
    if (typeof b.occurrence !== "number" || !Number.isInteger(b.occurrence) || b.occurrence < 1) {
      return { error: "occurrence must be a positive integer (1 = the first start match)" };
    }
    occurrence = b.occurrence;
  }
  return {
    mode: "between",
    start: b.start,
    end: b.end,
    newString: b.newString,
    inclusive: b.inclusive === true,
    occurrence,
  };
}

/**
 * Validate untrusted `edit_text` args: a known target with the selector(s) it
 * needs, plus exactly ONE edit mode's args. Returns the normalized value or an
 * error string.
 */
export function validateEditText(raw: unknown): ValidatedEditText | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "args must be an object" };
  const b = raw as Record<string, unknown>;

  if (typeof b.target !== "string" || b.target.trim() === "") {
    return { error: `target is required — one of: ${EDIT_TEXT_TARGET_FORMS.join(", ")}` };
  }
  const spec = parseTarget(b.target.trim(), b);
  if ("error" in spec) return spec;

  const edit = parseEdit(b);
  if ("error" in edit) return edit;

  return { target: b.target.trim(), spec, edit };
}
