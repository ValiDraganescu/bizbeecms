/**
 * PUBLIC Form-block submit endpoint (external-data-sources Form slice (a)).
 *
 * ONE endpoint, TWO client modes (dual submit, USER DECISION 2026-07-02):
 *  - NATIVE: a plain `<form method="POST">` form-data/urlencoded post (no JS).
 *    Answers 303 See Other — back to the page (Referer) or the authored
 *    `formTarget.redirect`, with `?bb_form=ok|error` appended.
 *  - FETCH: the progressive-enhancement script posts the same FormData with
 *    `Accept: application/json`; we answer JSON for inline status rendering.
 *
 * SECURITY MODEL: the client sends only the PAGE + BLOCK identity (hidden
 * inputs). The target is re-read from the PUBLISHED page's blocks server-side —
 * a visitor can only ever trigger form targets an operator actually published.
 *  - api kind: the saved request runs through the central fetch engine (secret
 *    decrypted server-side, never exposed); form fields fill the request's
 *    declared `{placeholder}`s with the engine's safe encoding. Cache is
 *    BYPASSED and retries are FORCED OFF — a submission must fire exactly once.
 *  - collection kind: the collection must have EXPLICITLY opted in
 *    (`public_submissions`); only declared schema fields are kept; the item is
 *    FORCED to draft status (operator reviews before it can render anywhere).
 *  - caps: body size / field count / value length; per-IP sliding-window rate
 *    limit riding the existing login_attempt table (kind "form") — ONE
 *    successful submission per window; the second gets a 429 with a
 *    guest-visible message.
 *  - BOT PROTECTION: every submission must carry a solved ALTCHA
 *    proof-of-work payload, minted by `/api/forms/challenge` and verified
 *    here (HMAC-only — no PBKDF2 on this path). A verified challenge is
 *    BURNED single-use through the same login_attempt table (`altcha:<id>`),
 *    so a solved payload can't be replayed across IPs. This makes JS
 *    REQUIRED for form submission — a no-JS native post is refused.
 *
 * Failures are DELIBERATE responses (4xx JSON / error redirect) — never 500s
 * for bad input; a real exception still degrades to the generic error shape.
 */
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import { parseJsonColumn, type Block, type FormTarget } from "@/lib/render/tree";
import {
  collectSubmission,
  findFormBlock,
  apiParamsFromFields,
  collectionBodyFromFields,
  decideFormRate,
  wantsJson,
  formRedirectUrl,
  MAX_FORM_BODY_BYTES,
  FORM_RATE_LIMIT_ERROR,
} from "@/lib/forms/submit-core";
import {
  altchaReplayKey,
  altchaSecrets,
  pickGuestMessage,
  ALTCHA_MISSING_ERROR,
  ALTCHA_FAILED_ERROR,
} from "@/lib/forms/altcha-core";
import { readContentLocaleCookie } from "@/lib/ai-quota/message";
import { getContentLocales } from "@/db/settings-store";
import { verify as verifyAltcha } from "altcha-lib/frameworks/shared";
import { deriveKey as altchaDeriveKey } from "altcha-lib/algorithms/pbkdf2";
import { FORM_DEFAULT_ERROR } from "@/lib/render/plan-form";
import {
  recentFailureTimestamps,
  recordFailure,
} from "@/db/login-attempt-store";
import { getCollection } from "@/db/collection-store";
import { createItem } from "@/db/item-store";
import {
  getDataSource,
  listDataSourceRequests,
  decryptSourceSecret,
} from "@/db/data-source-store";
import { fetchSource } from "@/lib/data-sources/fetch";
import {
  requestPlaceholders,
  type AuthType,
  type HttpMethod,
} from "@/lib/data-sources/validate";

export const dynamic = "force-dynamic";

async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

/** Best-effort client IP for the rate-limit key (Workers sets cf-connecting-ip). */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

type Outcome = { ok: boolean; status: number; error?: string };

/** Answer in the caller's mode: JSON for fetch clients, 303 redirect for native. */
function respond(
  request: Request,
  target: FormTarget | undefined,
  outcome: Outcome,
): Response {
  if (wantsJson(request.headers.get("accept"))) {
    return Response.json(
      outcome.ok ? { ok: true } : { ok: false, error: outcome.error ?? FORM_DEFAULT_ERROR },
      { status: outcome.status },
    );
  }
  const location = formRedirectUrl(target, request.headers.get("referer"), outcome.ok);
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<Response> {
  let target: FormTarget | undefined;
  try {
    // ── Trust boundary: size cap, then parse form-data OR JSON ──────────────
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FORM_BODY_BYTES) {
      return respond(request, target, { ok: false, status: 413, error: "submission too large" });
    }
    const contentType = request.headers.get("content-type") ?? "";
    let entries: Iterable<[string, unknown]>;
    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return respond(request, target, { ok: false, status: 400, error: "invalid JSON body" });
      }
      entries =
        body && typeof body === "object" && !Array.isArray(body)
          ? Object.entries(body as Record<string, unknown>)
          : [];
    } else {
      try {
        entries = (await request.formData()).entries();
      } catch {
        return respond(request, target, { ok: false, status: 400, error: "invalid form body" });
      }
    }
    const parsed = collectSubmission(entries);
    if (!parsed.ok) {
      return respond(request, target, { ok: false, status: parsed.status, error: parsed.error });
    }

    // Bot-protection refusals are rendered VERBATIM to the visitor, so they
    // ship pre-translated: active content locale (the cookie the page itself
    // rendered in) → the Site's default → English. A settings-read failure
    // must not turn a refusal into a 500 — fall back to English.
    const guestLocale = readContentLocaleCookie(request.headers.get("cookie"));
    const siteDefaultLocale = await getContentLocales()
      .then((l) => l.default)
      .catch(() => "en");
    const guestMessage = (dict: Parameters<typeof pickGuestMessage>[0]) =>
      pickGuestMessage(dict, guestLocale, siteDefaultLocale);

    // ── Rate limit (per IP, sliding window on the login_attempt table).
    // READ-ONLY here: the attempt is recorded only when the submission
    // SUCCEEDS, so a visitor whose submit failed validation can retry. ──────
    const rateKey = `form:${clientIp(request)}`;
    const stamps = await recentFailureTimestamps(rateKey, Date.now(), "form");
    if (decideFormRate(stamps).locked) {
      return respond(request, target, {
        ok: false,
        status: 429,
        error: guestMessage(FORM_RATE_LIMIT_ERROR),
      });
    }

    // ── ALTCHA proof-of-work gate (bot protection). The payload is verified
    // (expiry + challenge signature + key signature, HMAC-only) and its
    // challenge id is BURNED single-use via the login_attempt table — a
    // solved payload replayed from another IP is refused. ────────────────────
    if (!parsed.altcha) {
      return respond(request, target, {
        ok: false,
        status: 403,
        error: guestMessage(ALTCHA_MISSING_ERROR),
      });
    }
    const secrets = altchaSecrets(await kek());
    const replayStore = {
      get: async (id: string) =>
        (await recentFailureTimestamps(altchaReplayKey(id), Date.now(), "form")).length > 0,
      set: async (id: string) => {
        await recordFailure(altchaReplayKey(id), Date.now(), "form");
      },
    };
    const altcha = await verifyAltcha(
      parsed.altcha,
      altchaDeriveKey,
      secrets.signature,
      secrets.key,
      replayStore,
    );
    if (altcha.error || !altcha.verification?.verified) {
      // ALTCHA's exact reason is not surfaced; the visitor gets one stable,
      // self-correcting, localized refusal.
      return respond(request, target, {
        ok: false,
        status: 403,
        error: guestMessage(ALTCHA_FAILED_ERROR),
      });
    }

    /** Count this IP's ONE successful submission for the window — call just
     *  before each success response. */
    const recordSubmission = () => recordFailure(rateKey, Date.now(), "form");

    // ── Resolve the target from the PUBLISHED page (never from the client) ──
    const db = await getDb();
    const pages = await db
      .select()
      .from(pageTable)
      .where(eq(pageTable.id, parsed.pageId))
      .limit(1);
    const pageRow = pages[0];
    if (!pageRow || pageRow.publishStatus !== "published") {
      return respond(request, target, { ok: false, status: 404, error: "form not found" });
    }
    const published = await getVersion(pageRow.publishedVersionId);
    const blocks = parseJsonColumn<Block[]>(
      pickRenderBlocks(published, null, pageRow.blocks),
      [],
    );
    const formBlock = findFormBlock(blocks, parsed.blockId);
    target = formBlock?.formTarget;
    if (!formBlock || !target?.kind) {
      return respond(request, target, { ok: false, status: 404, error: "form not found" });
    }

    // ── collection kind: opt-in gate → declared fields only → DRAFT item ────
    if (target.kind === "collection") {
      const view = target.collection ? await getCollection(target.collection) : null;
      if (!view || !view.publicSubmissions) {
        return respond(request, target, {
          ok: false,
          status: 403,
          error: "this form does not accept submissions",
        });
      }
      const body = collectionBodyFromFields(
        parsed.fields,
        view.fields.map((f) => f.name),
      );
      const result = await createItem(view.tableName, body);
      if (!result.ok) {
        return respond(request, target, { ok: false, status: result.status, error: result.error });
      }
      await recordSubmission();
      return respond(request, target, { ok: true, status: 200 });
    }

    // ── api kind: saved request via the central fetch engine ────────────────
    if (!target.sourceId || !target.requestId) {
      return respond(request, target, { ok: false, status: 404, error: "form not found" });
    }
    const source = await getDataSource(target.sourceId);
    const saved = source
      ? (await listDataSourceRequests(target.sourceId)).find((r) => r.id === target?.requestId)
      : undefined;
    if (!source || !saved) {
      return respond(request, target, { ok: false, status: 404, error: "form not found" });
    }
    const params = apiParamsFromFields(
      requestPlaceholders({
        path: saved.path,
        query: saved.query,
        bodyTemplate: saved.bodyTemplate,
      }),
      parsed.fields,
    );
    if (!params.ok) {
      return respond(request, target, { ok: false, status: 400, error: params.error });
    }
    const secret = source.hasSecret
      ? await decryptSourceSecret(source.id, await kek())
      : null;
    const result = await fetchSource(
      {
        id: source.id,
        baseUrl: source.baseUrl,
        authType: source.authType as AuthType,
        authParam: source.authParam,
        secret,
      },
      {
        id: saved.id,
        method: saved.method as HttpMethod,
        path: saved.path,
        query: saved.query,
        bodyTemplate: saved.bodyTemplate,
        // A submission must fire EXACTLY once and never pollute the render
        // cache: cache bypassed, retries forced off (even if the operator
        // marked the request retryable for render binds).
        cacheEnabled: false,
        cacheTtlSec: saved.cacheTtlSec,
        retryable: false,
      },
      params.params,
      { cache: null },
    );
    if (!result.ok) {
      // Upstream failed — the visitor sees the authored/default error, not the
      // engine's internals (those stay in the JSON `error` for debugging).
      return respond(request, target, { ok: false, status: 502, error: result.error });
    }
    await recordSubmission();
    return respond(request, target, { ok: true, status: 200 });
  } catch (err) {
    return respond(request, target, {
      ok: false,
      status: 500,
      error: (err as Error).message ?? "submission failed",
    });
  }
}
