/**
 * OpenRouter per-KEY credit endpoint (ai-openrouter goal — surface the minted PM
 * key's remaining spend in the chat widget).
 *
 *   GET /api/chat/credit  → { credit: { usage, limit, remaining } | null }
 *
 * Returns the in-use key's spend-vs-limit ONLY when the in-use key is the
 * env/minted/deployer-global `OPENROUTER_API_KEY` — determined via the SAME
 * precedence as the Ai port (`effectiveOpenrouterKey`: CMS-local user key wins).
 * A CMS-local user key is the customer's OWN OpenRouter balance → out of scope,
 * so we return `{ credit: null }` (the widget hides the line). Source is
 * OpenRouter's per-KEY `/api/v1/key` (no management key needed); we NEVER log the
 * key and NEVER echo it.
 *
 * Admin-only (CMS-internal). REST-only (PM directive). Never 500 on a settings/
 * upstream failure — degrade to `{ credit: null }`.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth/guard";
import {
  OPENROUTER_KEY_URL,
  parseKeyCredit,
  type KeyCredit,
} from "@/lib/chat/credit";
import { getDecryptedOpenrouterUserKey } from "@/db/openrouter-key-store";
import { effectiveOpenrouterKey } from "@/lib/settings/openrouter-key";

export const dynamic = "force-dynamic";

/** Fetch + parse the in-use key's credit from OpenRouter, or null on any failure. */
async function fetchKeyCredit(apiKey: string): Promise<KeyCredit | null> {
  try {
    const res = await fetch(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return parseKeyCredit(await res.json());
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as {
      OPENROUTER_API_KEY?: string;
      CMS_AUTH_SECRET?: string;
    };

    // Mirror getAi() precedence: CMS-local user key wins over the env key.
    let userKey: string | null = null;
    if (typeof e.CMS_AUTH_SECRET === "string" && e.CMS_AUTH_SECRET) {
      try {
        userKey = await getDecryptedOpenrouterUserKey(e.CMS_AUTH_SECRET);
      } catch {
        userKey = null;
      }
    }
    const envKey = typeof e.OPENROUTER_API_KEY === "string" ? e.OPENROUTER_API_KEY : "";
    const inUse = effectiveOpenrouterKey(userKey, envKey);

    // Only surface credit for the env/minted key — a CMS-local user key is the
    // customer's own balance (out of scope). No key at all → nothing to show.
    const usingUserKey = typeof userKey === "string" && userKey.trim() !== "";
    if (!inUse || usingUserKey) {
      return Response.json({ credit: null });
    }

    const credit = await fetchKeyCredit(inUse);
    return Response.json({ credit });
  } catch {
    // Never break the widget — degrade to no credit info.
    return Response.json({ credit: null });
  }
}
