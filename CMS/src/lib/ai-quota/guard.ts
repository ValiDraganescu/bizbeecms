/**
 * The quota GATE every AI entry point calls before reaching for a model
 * (Contract D, W2-D — docs/ai-cost-quotas-contracts.md).
 *
 * One predicate (`aiQuotaSpent`) plus one refusal builder per SURFACE, because
 * the four surfaces speak different languages:
 *   - admin routes return a 429 the operator's client shows        → aiQuotaDenial
 *   - guest chat returns a 429 the VISITOR reads, so it's localized → guestAiQuotaDenial
 *   - assistant tools return `{ok,errors}` the model relays         → aiQuotaToolError
 *   - the optional describe-on-upload just skips                    → aiQuotaSpent
 *
 * Building them here rather than at each call site is the point: the wording,
 * the status code and the guest translation can never drift apart.
 *
 * The gate is a plain read of this month's billable counter vs the Site's quota
 * (`checkAiQuota`), which fails OPEN — an unreachable PM or an unbound D1 never
 * blocks a call.
 */
import { checkAiQuota } from "@/db/ai-usage-store";
import { getContentLocales } from "@/db/settings-store";
import {
  QUOTA_REACHED,
  guestQuotaMessage,
  readContentLocaleCookie,
} from "./message.ts";

/**
 * Is this Site's monthly AI budget spent? THE gate — every refusal below is a
 * formatting of this one answer. Used directly by the optional AI steps that
 * already degrade silently (the auto-describe on media upload): over quota
 * disables the enhancement exactly like an absent OpenRouter key does, because
 * an upload is not an AI request and must never fail over the quota.
 */
export async function aiQuotaSpent(): Promise<boolean> {
  return !(await checkAiQuota()).ok;
}

/**
 * A 429 `{ error: "monthly AI quota reached" }` for ADMIN surfaces when the
 * budget is spent, else null — used as `const denied = await aiQuotaDenial(); if
 * (denied) return denied;`, the same rhythm as `requireAdmin`. The string is the
 * stable English one the admin clients surface as-is.
 */
export async function aiQuotaDenial(): Promise<Response | null> {
  if (!(await aiQuotaSpent())) return null;
  return Response.json({ error: QUOTA_REACHED }, { status: 429 });
}

/**
 * The same 429 for the PUBLIC guest chat, carrying a message the VISITOR can
 * read: the guest client script renders `j.error` verbatim, so it is translated
 * server-side into the request's content locale (`bb_content_locale` cookie),
 * falling back to the Site's default content locale — the same chain that
 * rendered the page the widget sits on.
 */
export async function guestAiQuotaDenial(request: Request): Promise<Response | null> {
  if (!(await aiQuotaSpent())) return null;

  const locale = readContentLocaleCookie(request.headers.get("cookie"));
  // A settings-read failure must not turn a quota refusal into a 500 — fall back
  // to the message module's own default rather than propagate.
  const siteDefault = await getContentLocales()
    .then((l) => l.default)
    .catch(() => "en");
  return Response.json(
    { error: guestQuotaMessage(locale, siteDefault) },
    { status: 429 },
  );
}

/**
 * The refusal as a TOOL result for the assistant's `generate_image`: tool
 * handlers return `{ok,errors}`, never HTTP statuses, so the model relays the
 * reason to the operator instead of the stream dying. Null when budget remains.
 */
export async function aiQuotaToolError(): Promise<
  { ok: false; errors: string[] } | null
> {
  if (!(await aiQuotaSpent())) return null;
  return { ok: false, errors: [QUOTA_REACHED] };
}
