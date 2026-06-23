/**
 * Write normalization for a Site's OpenRouter key-MINTING controls on update.
 *
 * The manual paste field is gone — the key value is never user-entered. Instead
 * the Edit Site form sends two fields:
 *  - `openrouterMintingEnabled` (boolean) — whether PM auto-mints a per-Site key.
 *  - `openrouterMonthlyLimitUsd` (integer USD ≥ 0, or null = no cap) — the
 *    spend limit applied to the minted key.
 *
 * Pure (no `@/` alias, no DB) so it unit-tests under a bare `node --test`.
 */
export type OpenrouterMintingOp = {
  /** Whether minting is enabled for this Site. */
  openrouterMintingEnabled: boolean;
  /** Monthly spend cap in whole USD, or null for no cap. */
  openrouterMonthlyLimitUsd: number | null;
};

/**
 * Parse the minting fields. The toggle is `=== true`-only (truthy strings don't
 * enable, by design). The limit accepts a non-negative integer (or numeric
 * string); blank/absent/invalid/negative → null (no cap). Fractional values are
 * floored — OpenRouter limits are whole-dollar.
 */
export function parseOpenrouterMinting(body: {
  openrouterMintingEnabled?: unknown;
  openrouterMonthlyLimitUsd?: unknown;
}): OpenrouterMintingOp {
  const raw = body.openrouterMonthlyLimitUsd;
  let limit: number | null = null;
  // Trim string input so whitespace-only (and an empty string) → no cap, not 0.
  const cleaned = typeof raw === "string" ? raw.trim() : raw;
  if (cleaned !== "" && cleaned != null) {
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 0) limit = Math.floor(n);
  }
  return {
    openrouterMintingEnabled: body.openrouterMintingEnabled === true,
    openrouterMonthlyLimitUsd: limit,
  };
}
