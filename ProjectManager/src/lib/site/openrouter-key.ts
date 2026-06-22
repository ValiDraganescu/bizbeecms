/**
 * Write-only normalization for a Site's OpenRouter API key on update.
 *
 * The key is never echoed back; the API exposes only a `hasOpenrouterKey`
 * boolean. On update the caller may send a plaintext `openrouterApiKey` to
 * set/replace, or `clearOpenrouterKey: true` to wipe it. A BLANK key field is
 * "no change" — only the explicit clear flag removes an existing key.
 *
 * Pure (no `@/` alias, no DB) so it unit-tests under a bare `node --test`.
 */
export type OpenrouterKeyOp = {
  /** Trimmed plaintext to set, or undefined when blank / absent (no change). */
  openrouterApiKey?: string;
  /** True only on an explicit clear request. */
  clearOpenrouterKey: boolean;
};

export function parseOpenrouterKey(body: {
  openrouterApiKey?: unknown;
  clearOpenrouterKey?: unknown;
}): OpenrouterKeyOp {
  const raw = String(body.openrouterApiKey ?? "").trim();
  return {
    openrouterApiKey: raw === "" ? undefined : raw,
    clearOpenrouterKey: body.clearOpenrouterKey === true,
  };
}
