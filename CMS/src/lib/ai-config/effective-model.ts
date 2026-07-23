/**
 * ai-cost-quotas W2-E — the ONE rule for turning a site-stored model value into
 * the OpenRouter model id an AI call actually uses. Pure, no I/O (tested in
 * effective-model.test.ts).
 *
 * Sites persist a curated alias `key` since curation landed, but rows written
 * before it still hold a raw OpenRouter model id. `resolveModelForPurpose`
 * matches BOTH (Contract B), so the only extra job here is the config-less case:
 * when no curated config is available (fresh site, PM unreachable, local dev)
 * the CMS must behave exactly as it did before curation — the legacy stored id
 * if there is one, else the caller's legacy `DEFAULT_*` constant.
 */
import type { AiConfig, AiPurpose } from "./types.ts";
import { resolveModelForPurpose } from "./resolve.ts";

export function effectiveModel(
  config: AiConfig | null,
  purpose: AiPurpose,
  storedValue: string | null | undefined,
  legacyDefault: string,
): string {
  const curated = resolveModelForPurpose(config, purpose, storedValue);
  if (curated) return curated.model;
  // No curated list for this purpose → pre-curation behaviour. A stored value is
  // a raw model id here (an alias key can only exist if the config listed it).
  const stored = typeof storedValue === "string" ? storedValue.trim() : "";
  return stored || legacyDefault;
}
