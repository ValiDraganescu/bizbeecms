/**
 * AI-assistant TOOLS for managing saved system-prompt versions (CRUD).
 *
 * Mirrors the PM-SSO prompt editor's REST CRUD (`/api/chat/prompts`) as
 * function-calling tools so an operator can list/create/update/delete prompt
 * versions through the assistant and the remote MCP server (api-key authed). The
 * pure shape/validation reuses `prompt-version.ts` (label/prompt bounds); this
 * module only adds the tool SCHEMAS + the small id/patch validators the handlers
 * need. PURE (no D1/React/CF) → node-testable; the store wraps these.
 *
 * Authz note: these run through the SHARED tool registry, so the per-Site MCP API
 * key (and any admin chat) can call them — the key already authorizes every
 * content write, so prompt versions are no more privileged (decision: MCP key =
 * full access).
 */
import {
  validatePromptInput,
  MAX_LABEL_LEN,
  MAX_PROMPT_LEN,
  type ValidatedPromptInput,
} from "./prompt-version.ts";

export const LIST_PROMPTS_TOOL = {
  type: "function",
  function: {
    name: "list_prompts",
    description:
      "List the saved system-prompt versions (newest first) — each is a named full version of the AI assistant's system prompt an operator saved to compare. Returns id, label, prompt text, and created time.",
    parameters: { type: "object", properties: {} },
  },
} as const;

export const CREATE_PROMPT_TOOL = {
  type: "function",
  function: {
    name: "create_prompt",
    description:
      "Save a NEW system-prompt version from a label + the full prompt text. The version is stored for comparison; it does NOT change the site's active default prompt.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: `A short name for this version (1..${MAX_LABEL_LEN} chars).` },
        prompt: { type: "string", description: `The FULL system-prompt text for this version (1..${MAX_PROMPT_LEN} chars).` },
      },
      required: ["label", "prompt"],
    },
  },
} as const;

export const UPDATE_PROMPT_TOOL = {
  type: "function",
  function: {
    name: "update_prompt",
    description:
      "Update an existing system-prompt version by id. Pass label and/or prompt to change (omitted fields are left unchanged). Use list_prompts to find the id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The version's id (from list_prompts)." },
        label: { type: "string", description: `New label (1..${MAX_LABEL_LEN} chars). Omit to keep the current one.` },
        prompt: { type: "string", description: `New full prompt text (1..${MAX_PROMPT_LEN} chars). Omit to keep the current one.` },
      },
      required: ["id"],
    },
  },
} as const;

export const DELETE_PROMPT_TOOL = {
  type: "function",
  function: {
    name: "delete_prompt",
    description: "Delete a saved system-prompt version by id. Use list_prompts to find the id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The version's id to delete." },
      },
      required: ["id"],
    },
  },
} as const;

/** Re-export create validation (label+prompt, both required) under a tool-local name. */
export function validateCreatePrompt(raw: unknown): ValidatedPromptInput | { error: string } {
  return validatePromptInput(raw);
}

/** The trimmed `id` from an args object, or null if absent/blank. */
export function coercePromptId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const id = (raw as { id?: unknown }).id;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

export type ValidatedPromptPatch = { id: string; label?: string; prompt?: string };

/**
 * Validate an update: requires a non-blank id and at least one of label/prompt,
 * each bounded/trimmed exactly like create (a present-but-empty field is an error,
 * an ABSENT field is "leave unchanged"). Returns the patch or an error string.
 */
export function validateUpdatePrompt(raw: unknown): ValidatedPromptPatch | { error: string } {
  const id = coercePromptId(raw);
  if (!id) return { error: "id is required" };
  const b = raw as { label?: unknown; prompt?: unknown };

  const patch: ValidatedPromptPatch = { id };
  if (b.label !== undefined) {
    if (typeof b.label !== "string") return { error: "label must be a string" };
    const label = b.label.trim();
    if (label.length === 0) return { error: "label must not be empty" };
    if (label.length > MAX_LABEL_LEN) return { error: `label exceeds ${MAX_LABEL_LEN} chars` };
    patch.label = label;
  }
  if (b.prompt !== undefined) {
    if (typeof b.prompt !== "string") return { error: "prompt must be a string" };
    const prompt = b.prompt.trim();
    if (prompt.length === 0) return { error: "prompt must not be empty" };
    if (prompt.length > MAX_PROMPT_LEN) return { error: `prompt exceeds ${MAX_PROMPT_LEN} chars` };
    patch.prompt = prompt;
  }
  if (patch.label === undefined && patch.prompt === undefined) {
    return { error: "pass label and/or prompt to update" };
  }
  return patch;
}
