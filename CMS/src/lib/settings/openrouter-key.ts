/**
 * CMS-local OpenRouter user-key — PURE helpers (ai-openrouter KEY-MINTING track,
 * "CMS-local user-key override" slice). No `@/` imports, no CF bindings →
 * node-testable.
 *
 * A Site operator can paste THEIR OWN OpenRouter key in CMS settings; it's stored
 * encrypted in the CMS's own D1 (`site_settings` row `openrouter_user_key`) and
 * PREFERRED at AI request time over the deployer-injected `OPENROUTER_API_KEY`
 * secret (the PM-minted or deployer-global key). Precedence at request time:
 *   CMS-local user key → env.OPENROUTER_API_KEY (minted-or-global) → 503.
 *
 * The key is write-only: the UI shows "key set / no key" + a clear button, the
 * plaintext is never echoed back. These helpers validate what the operator typed,
 * normalize the stored row, and project the safe status view.
 */

/** What's persisted in the `site_settings` `openrouter_user_key` row. */
export interface OpenrouterUserKeyConfig {
  /** AES-GCM blob of the user key (secret-box wire format). Empty = unset. */
  keyEnc: string;
}

/** The empty/unset config — the safe default when no row exists / row is garbage. */
export function emptyOpenrouterUserKey(): OpenrouterUserKeyConfig {
  return { keyEnc: "" };
}

/**
 * True when the operator typed a plausible OpenRouter key. OpenRouter keys are
 * `sk-or-...`; we keep the check loose (non-empty, bounded) since OpenRouter is
 * the real validator — but require the `sk-or-` prefix to catch obvious paste
 * mistakes. Tolerates an `unknown`.
 */
export function isValidUserKey(key: unknown): boolean {
  if (typeof key !== "string") return false;
  const k = key.trim();
  return k.length > 0 && k.length <= 256 && k.startsWith("sk-or-");
}

/**
 * Normalize a raw (possibly-bad-JSON) stored value into a config. Keeps the
 * encrypted blob verbatim (base64); any non-string → empty. Never throws.
 */
export function normalizeOpenrouterUserKey(raw: unknown): OpenrouterUserKeyConfig {
  if (!raw || typeof raw !== "object") return emptyOpenrouterUserKey();
  const r = raw as Partial<OpenrouterUserKeyConfig>;
  return { keyEnc: typeof r.keyEnc === "string" ? r.keyEnc : "" };
}

/** The non-secret view returned to the admin UI — NEVER echoes the key. */
export interface OpenrouterUserKeyStatus {
  /** Whether a user key is stored (true) without revealing it. */
  hasKey: boolean;
}

/** Project a stored config to the safe status view for the UI. */
export function toOpenrouterUserKeyStatus(
  config: OpenrouterUserKeyConfig,
): OpenrouterUserKeyStatus {
  return { hasKey: config.keyEnc.length > 0 };
}

/**
 * Pure request-time precedence: the CMS-local user key wins when present
 * (non-empty after trim), else the deployer-injected `OPENROUTER_API_KEY`.
 * Returns the effective OpenRouter key, or "" when neither is set (caller then
 * answers 503). Tolerates undefined/null inputs.
 */
export function effectiveOpenrouterKey(
  userKey: string | null | undefined,
  envKey: string | null | undefined,
): string {
  const u = typeof userKey === "string" ? userKey.trim() : "";
  if (u) return u;
  const e = typeof envKey === "string" ? envKey.trim() : "";
  return e;
}
