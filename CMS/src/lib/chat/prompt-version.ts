/**
 * Pure helpers for the PM-SSO system-prompt editor (ai-widget-ux).
 *
 * A PM-SSO operator can save named "versions" of the assistant system prompt and,
 * for their OWN session only, send a chosen version's text as a per-request
 * `systemPromptOverride` on the chat POST. The chat route applies the override
 * INSTEAD of the auto-assembled default — but ONLY when the override is present
 * AND the caller is PM-SSO. Real end-users + non-SSO operators always get the
 * assembled default; no site default is ever mutated.
 *
 * Pure — no D1/React/fetch imports — so `node --test` loads it directly. The D1
 * binding (store) + the request gate (route) wrap these.
 */

/** A saved prompt version as the client/store exchange it. */
export type PromptVersion = {
  id: string;
  label: string;
  prompt: string;
  createdAt: number;
};

export const MAX_LABEL_LEN = 80;
export const MAX_PROMPT_LEN = 20000;

export type ValidatedPromptInput = { label: string; prompt: string };

/**
 * Validate untrusted CRUD input. Returns the trimmed/normalized value or an
 * error string. Label: 1..MAX_LABEL_LEN after trim. Prompt: 1..MAX_PROMPT_LEN
 * after trim (a version IS the full prompt — empty is meaningless).
 */
export function validatePromptInput(
  raw: unknown,
): ValidatedPromptInput | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "body must be an object" };
  const b = raw as { label?: unknown; prompt?: unknown };
  if (typeof b.label !== "string") return { error: "label is required" };
  if (typeof b.prompt !== "string") return { error: "prompt is required" };
  const label = b.label.trim();
  const prompt = b.prompt.trim();
  if (label.length === 0) return { error: "label must not be empty" };
  if (label.length > MAX_LABEL_LEN) return { error: `label exceeds ${MAX_LABEL_LEN} chars` };
  if (prompt.length === 0) return { error: "prompt must not be empty" };
  if (prompt.length > MAX_PROMPT_LEN) return { error: `prompt exceeds ${MAX_PROMPT_LEN} chars` };
  return { label, prompt };
}

/**
 * Decide the EFFECTIVE system prompt for a chat request.
 *
 * The override wins ONLY when it is a non-empty string AND the caller is PM-SSO.
 * Otherwise the assembled default is used. This is the single trust gate: a
 * non-SSO caller's override is ignored even if present (defense in depth — the
 * route also strips it), so a local user can never inject a prompt.
 */
export function effectiveSystemPrompt(args: {
  override: unknown;
  isPmSso: boolean;
  assembled: string;
}): string {
  const { override, isPmSso, assembled } = args;
  if (isPmSso && typeof override === "string" && override.trim().length > 0) {
    return override;
  }
  return assembled;
}
