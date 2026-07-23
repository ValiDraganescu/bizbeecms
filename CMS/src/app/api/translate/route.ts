/**
 * Programmatic AI-translate endpoint (Milestone 2, ai-assistant goal).
 *
 * `POST /api/translate` with
 *   `{ kind:"page"|"component", target, fields:{name:sourceText}, fromLocale, toLocales? }`
 * → translates each field's SOURCE text into the target locales using the SAME
 * `Ai` port the chat assistant uses, validates the result via the
 * EXISTING `validateTranslationInput`, writes via the EXISTING `applyTranslation`
 * (one translation write path), and returns the produced `{loc:text}` maps so the
 * caller can show them for optional review.
 *
 * This is the reusable engine the page-builder AI-translate button sits on — it
 * is NOT a chat conversation and does NOT add a second model client.
 *
 * REST-only, no server actions (PM directive). The model call + D1 write need a
 * real key + D1 (HITL); the request shaping + response parsing are pure and
 * unit-tested (`scripts/translate-request.test.mjs`).
 */
import { getAi } from "@/lib/ports/ai";
import { DEFAULT_TRANSLATE_MODEL } from "@/lib/chat/models";
import {
  buildTranslateMessages,
  collectStreamText,
  parseTranslateRequest,
  parseTranslateResponse,
  resolveTargetLocales,
} from "@/lib/chat/translate-request";
import { validateTranslationInput } from "@/lib/chat/translate-tool";
import { applyTranslation } from "@/db/translate-store";
import { meterAiCall } from "@/db/ai-usage-store";
import { waitUntilOrInline } from "@/lib/cf/wait-until";
import { aiQuotaDenial } from "@/lib/ai-quota/guard";
import { getContentLocales, getTranslateModel } from "@/db/settings-store";
import { getAiConfig, effectiveModel } from "@/lib/ai-config";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Uses the SAME catalog DEFAULT_MODEL as the chat route (an OpenRouter id since
// the ai-openrouter migration). `getAi()` picks the provider; this id must match
// it — translate runs on whatever the assistant runs on. (Was a hardcoded
// Workers-AI id, which 502'd against the OpenRouter adapter on every keyed Site.)

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  // Monthly AI quota (ai-cost-quotas): refuse BEFORE the model call, never after.
  const overQuota = await aiQuotaDenial();
  if (overQuota) return overQuota;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseTranslateRequest(body);
  if (!parsed.ok) {
    return Response.json({ errors: parsed.errors }, { status: 400 });
  }
  const req = parsed.request;

  const ai = await getAi();
  if (!ai) {
    return Response.json(
      { error: "AI not configured for this Site" },
      { status: 503 },
    );
  }

  // Constrain to the Site's configured content locales (C1).
  let locales;
  try {
    locales = await getContentLocales();
  } catch {
    locales = undefined;
  }
  const siteLocales = locales?.locales ?? [req.fromLocale];

  const targetLocales = resolveTargetLocales(req.fromLocale, req.toLocales, siteLocales);
  if (targetLocales.length === 0) {
    return Response.json(
      { error: "no target locales to translate into (only the source locale is configured)" },
      { status: 400 },
    );
  }

  // The operator-selected translation model (Settings → AI models). The stored
  // value is a curated alias key or a legacy raw model id — `effectiveModel`
  // resolves both, and falls back to DEFAULT_TRANSLATE_MODEL when this site has
  // no curated config.
  let translateModel = DEFAULT_TRANSLATE_MODEL;
  try {
    translateModel = effectiveModel(
      await getAiConfig(),
      "translate",
      await getTranslateModel(),
      DEFAULT_TRANSLATE_MODEL,
    );
  } catch {
    /* no D1 → default */
  }

  // Ask the model for the translations.
  let modelText: string;
  try {
    const upstream = await ai.chat(
      buildTranslateMessages(req.fromLocale, targetLocales, req.fields),
      { model: translateModel },
    );
    const collected = await collectStreamText(upstream);
    modelText = collected.text;
    // Meter this month's AI spend (ai-cost-quotas) — under waitUntil, so a
    // metering failure never costs the operator their translation and the
    // write still lands after the response settles (a dangling promise would
    // be cancelled on Workers).
    waitUntilOrInline(meterAiCall("translate", translateModel, collected.cost).catch(() => {}));
  } catch (err) {
    return Response.json(
      { error: `AI request failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const { fields, missing } = parseTranslateResponse(
    modelText,
    req.fromLocale,
    targetLocales,
    req.fields,
  );

  // Shape-gate the model's UNTRUSTED output before any write (reuse the chat
  // tool's validator — same locale-object contract the renderer relies on).
  const valid = validateTranslationInput(
    { kind: req.kind, target: req.target, fields },
    { allowedLocales: locales?.locales },
  );
  if (!valid.ok) {
    return Response.json({ errors: valid.errors, missing }, { status: 422 });
  }

  // Non-persisting caller (the page-builder per-block field) only wants the
  // produced maps — it merges them into the BLOCK's props and autosaves itself.
  // Skip the artifact write (a component target has nowhere to persist anyway).
  if (!req.persist) {
    return Response.json({
      ok: true,
      action: "translated",
      target: req.target,
      fieldsWritten: 0,
      translations: valid.input.fields,
      missing,
    });
  }

  // Persist via the EXISTING merge/write path.
  try {
    const res = await applyTranslation(valid.input);
    if (!res.ok) {
      return Response.json({ errors: res.errors, missing }, { status: 422 });
    }
    return Response.json({
      ok: true,
      action: res.action,
      target: res.target,
      fieldsWritten: res.fields,
      translations: valid.input.fields,
      missing,
    });
  } catch (err) {
    return Response.json(
      { error: `failed to apply translation: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
