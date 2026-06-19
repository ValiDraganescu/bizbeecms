/**
 * CMS AI-assistant chat endpoint (Milestone 2, epic B1) — streaming, no tools yet.
 *
 * POST a `{ messages: [{role, content}, ...] }` body; get back a `text/event-stream`
 * of our re-framed protocol (see `lib/chat/sse.ts`): `token` events as the model
 * streams, then a single `done` (or `error`).
 *
 * Provider = Cloudflare **Workers AI** (`env.AI`, no API key, billed via CF)
 * behind **AI Gateway** (caching / per-Site spend caps / analytics / provider
 * fallback). We call the OpenAI-compatible `env.AI.run(model, {messages, stream})`,
 * which returns an SSE `ReadableStream`; we parse + re-frame it.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers; see project memory). This is a plain route handler taking a
 * `Request` and returning a streaming `Response`.
 *
 * The SSE parsing/framing + body validation are pure and unit-tested
 * (`scripts/chat-sse.test.mjs`); the live model call needs a real `AI` binding +
 * gateway (HITL — can't be exercised offline).
 */
import { getAi, getGatewayId } from "@/lib/ports/ai";
import { ToolCallAccumulator, frameEvent, parseChatBody } from "@/lib/chat/sse";
import { reframe } from "@/lib/chat/reframe";
import {
  CREATE_COMPONENT_TOOL,
  validateComponentArtifact,
} from "@/lib/chat/component-tool";
import { CREATE_PAGE_TOOL, validatePageInput } from "@/lib/chat/page-tool";
import {
  CREATE_TRANSLATION_TOOL,
  validateTranslationInput,
} from "@/lib/chat/translate-tool";
import {
  LIST_ASSETS_TOOL,
  coerceLimit,
  formatAssetList,
} from "@/lib/chat/list-assets-tool";
import {
  LIST_COMPONENTS_TOOL,
  GET_COMPONENT_TOOL,
  LIST_PAGES_TOOL,
  GET_PAGE_TOOL,
  LIST_LOCALES_TOOL,
  GET_BRAND_IDENTITY_TOOL,
  GET_THEME_TOOL,
  coerceIdArg,
  formatComponentList,
  formatPageList,
} from "@/lib/chat/read-tools";
import {
  detectAdminContext,
  isAdminContext,
  toolsForContext,
  contextPrompt,
  type AdminPageContext,
  type ToolName,
} from "@/lib/chat/tool-scopes";
import {
  listComponentNames,
  upsertComponent,
  listComponents,
  getComponentByName,
} from "@/db/component-store";
import { missingComponents, upsertPage, listPages, getPageById } from "@/db/page-store";
import { applyTranslation } from "@/db/translate-store";
import {
  getContentLocales,
  getSiteIdentity,
  getThemeOverrides,
  getThemeOverridesDark,
} from "@/db/settings-store";
import { listAssets } from "@/db/asset-store";
import { buildSystemPrompt } from "@/lib/settings/site-settings";
import { allowedClasses } from "@/lib/render/utility-css";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Default Workers AI model. Swappable per the B1 risk note: AI Gateway lets us
// point at a stronger model without re-architecting if tool-calling needs it.
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// The full tool catalog, keyed by the tool's function.name. Page-awareness
// (Slice 2) scopes which subset the model sees per admin page via
// `toolsForContext` — the names there MUST match these keys.
const TOOL_BY_NAME: Record<ToolName, unknown> = {
  create_component: CREATE_COMPONENT_TOOL,
  create_page: CREATE_PAGE_TOOL,
  translate: CREATE_TRANSLATION_TOOL,
  list_assets: LIST_ASSETS_TOOL,
  list_components: LIST_COMPONENTS_TOOL,
  get_component: GET_COMPONENT_TOOL,
  list_pages: LIST_PAGES_TOOL,
  get_page: GET_PAGE_TOOL,
  list_locales: LIST_LOCALES_TOOL,
  get_brand_identity: GET_BRAND_IDENTITY_TOOL,
  get_theme: GET_THEME_TOOL,
};

/** Resolve the context's tool-name list to the actual tool objects. */
function toolsForRequest(context: AdminPageContext) {
  return toolsForContext(context).map((name) => TOOL_BY_NAME[name]);
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseChatBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  // Page-awareness (Slice 2): the client sends its current admin page as
  // `context` (one of the AdminPageContext values) or a `pathname` to derive it
  // from. Untrusted → validate / detect; unknown falls back to "general".
  const context = resolveContext(body);

  const ai = await getAi();
  if (!ai) {
    // Binding missing (not yet provisioned for this Site). Don't 500 silently.
    return Response.json(
      { error: "AI binding not configured for this Site" },
      { status: 503 },
    );
  }

  // Prepend a system prompt built from the Site's identity (E2 brand/design/AI
  // persona) + its existing components + the bounded utility-class vocabulary, so
  // generated artifacts match the Site and reference real components/classes.
  // Only if the client didn't already supply a system message.
  const messages = await withSystemPrompt(parsed.messages, context);

  let upstream: ReadableStream<Uint8Array>;
  try {
    // OpenAI-compatible streaming call through AI Gateway (via the Ai port).
    // Tools are scoped to the current admin page (Slice 2).
    upstream = await ai.chat(messages, {
      model: DEFAULT_MODEL,
      tools: toolsForRequest(context),
      gatewayId: await getGatewayId(),
    });
  } catch (err) {
    return Response.json(
      { error: `AI request failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const stream = reframe(upstream, runTools);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type ChatMessage = { role: string; content: string };

/**
 * Resolve the admin page context from the raw request body. The client may send
 * an explicit `context` (validated against the known set) or a `pathname` we
 * detect from. Both untrusted → default to "general" (full toolset). Not part of
 * `parseChatBody` because it's optional and never a 400.
 */
function resolveContext(body: unknown): AdminPageContext {
  if (typeof body !== "object" || body === null) return "general";
  const b = body as { context?: unknown; pathname?: unknown };
  if (isAdminContext(b.context)) return b.context;
  if (typeof b.pathname === "string") return detectAdminContext(b.pathname);
  return "general";
}

/**
 * Build the E2 system prompt (Site identity + components + utility classes),
 * append the page-aware context prompt (Slice 2), and prepend it to the
 * conversation — unless the client already sent a system message (it owns the
 * prompt then). Reads are defensive: an unbound D1 (no Site provisioned, or this
 * offline env) falls back to an empty identity / no components, so the base
 * instruction still ships.
 */
async function withSystemPrompt(
  messages: ChatMessage[],
  context: AdminPageContext,
): Promise<ChatMessage[]> {
  if (messages.some((m) => m.role === "system")) return messages;

  let identity;
  let componentNames: string[] = [];
  try {
    identity = await getSiteIdentity();
  } catch {
    /* unbound D1 → no identity */
  }
  try {
    componentNames = await listComponentNames();
  } catch {
    /* unbound D1 → no components */
  }

  const system =
    buildSystemPrompt({
      identity,
      componentNames,
      utilityClasses: [...allowedClasses()].sort(),
    }) +
    "\n\n" +
    contextPrompt(context);
  return [{ role: "system", content: system }, ...messages];
}

/**
 * Run the accumulated tool calls and frame a `tool` event per call. Dispatches
 * by tool name (B2 `create_component`, B3 `create_page`). Each result is
 * `{name, ok, action|errors|...}`. Failures (validation or D1) are surfaced as
 * `ok:false` events, never thrown — one bad tool call must not kill the stream.
 */
async function runTools(
  tools: ToolCallAccumulator,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const emit = (data: Record<string, unknown>) =>
    controller.enqueue(encoder.encode(frameEvent("tool", data)));

  for (const call of tools.finish()) {
    try {
      if (call.name === CREATE_COMPONENT_TOOL.function.name) {
        await handleCreateComponent(call.args, emit);
      } else if (call.name === CREATE_PAGE_TOOL.function.name) {
        await handleCreatePage(call.args, emit);
      } else if (call.name === CREATE_TRANSLATION_TOOL.function.name) {
        await handleTranslate(call.args, emit);
      } else if (call.name === LIST_ASSETS_TOOL.function.name) {
        await handleListAssets(call.args, emit);
      } else if (call.name === LIST_COMPONENTS_TOOL.function.name) {
        await handleListComponents(emit);
      } else if (call.name === GET_COMPONENT_TOOL.function.name) {
        await handleGetComponent(call.args, emit);
      } else if (call.name === LIST_PAGES_TOOL.function.name) {
        await handleListPages(emit);
      } else if (call.name === GET_PAGE_TOOL.function.name) {
        await handleGetPage(call.args, emit);
      } else if (call.name === LIST_LOCALES_TOOL.function.name) {
        await handleListLocales(emit);
      } else if (call.name === GET_BRAND_IDENTITY_TOOL.function.name) {
        await handleGetBrandIdentity(emit);
      } else if (call.name === GET_THEME_TOOL.function.name) {
        await handleGetTheme(emit);
      } else {
        emit({ name: call.name, ok: false, errors: [`unknown tool: ${call.name}`] });
      }
    } catch (err) {
      emit({ name: call.name, ok: false, errors: [(err as Error).message] });
    }
  }
}

async function handleCreateComponent(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_COMPONENT_TOOL.function.name;
  const valid = validateComponentArtifact(args);
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    const res = await upsertComponent(valid.artifact);
    emit({ name, ok: true, action: res.action, component: res.name });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to save component: ${(err as Error).message}`] });
  }
}

async function handleCreatePage(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_PAGE_TOOL.function.name;
  const valid = validatePageInput(args);
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    // The blocks reference component names — verify they exist before writing,
    // so the model learns to create_component first (not silent placeholders).
    const missing = await missingComponents(valid.componentNames);
    if (missing.length > 0) {
      emit({
        name,
        ok: false,
        errors: [`unknown components (create them first): ${missing.join(", ")}`],
      });
      return;
    }
    const res = await upsertPage(valid.page);
    if (!res.ok) {
      emit({ name, ok: false, errors: res.errors });
      return;
    }
    emit({ name, ok: true, action: res.action, page: res.slug });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to save page: ${(err as Error).message}`] });
  }
}

async function handleTranslate(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = CREATE_TRANSLATION_TOOL.function.name;
  // Constrain the model to the Site's configured content locales (C1), so it
  // can't invent locales the Site doesn't serve.
  let allowedLocales: string[] | undefined;
  try {
    allowedLocales = (await getContentLocales()).locales;
  } catch {
    allowedLocales = undefined; // settings unreadable → accept any valid code
  }
  const valid = validateTranslationInput(args, { allowedLocales });
  if (!valid.ok) {
    emit({ name, ok: false, errors: valid.errors });
    return;
  }
  try {
    const res = await applyTranslation(valid.input);
    if (!res.ok) {
      emit({ name, ok: false, errors: res.errors });
      return;
    }
    emit({ name, ok: true, action: res.action, target: res.target, fields: res.fields });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to translate: ${(err as Error).message}`] });
  }
}

/**
 * Read-only: list the Site's uploaded media so the model can reference real
 * `/media/<key>` URLs in components/pages (closes the D1 upload→AI-use loop).
 * No untrusted artifact to validate — just clamp the limit and shape the rows.
 */
async function handleListAssets(
  args: unknown,
  emit: (data: Record<string, unknown>) => void,
): Promise<void> {
  const name = LIST_ASSETS_TOOL.function.name;
  try {
    const rows = await listAssets();
    const assets = formatAssetList(rows, coerceLimit(args));
    emit({ name, ok: true, assets });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to list assets: ${(err as Error).message}`] });
  }
}

// ── Slice 3: read-only discovery tools (back the scoped contexts' UPDATE work) ─
// Each reads an EXISTING store; no untrusted artifact to validate (see read-tools.ts).

async function handleListComponents(emit: (d: Record<string, unknown>) => void): Promise<void> {
  const name = LIST_COMPONENTS_TOOL.function.name;
  try {
    emit({ name, ok: true, components: formatComponentList(await listComponents()) });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to list components: ${(err as Error).message}`] });
  }
}

async function handleGetComponent(
  args: unknown,
  emit: (d: Record<string, unknown>) => void,
): Promise<void> {
  const name = GET_COMPONENT_TOOL.function.name;
  const compName = coerceIdArg(args, "name");
  if (!compName) {
    emit({ name, ok: false, errors: ["name is required"] });
    return;
  }
  try {
    const row = await getComponentByName(compName);
    if (!row) {
      emit({ name, ok: false, errors: [`no component named "${compName}"`] });
      return;
    }
    emit({ name, ok: true, component: row });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to get component: ${(err as Error).message}`] });
  }
}

async function handleListPages(emit: (d: Record<string, unknown>) => void): Promise<void> {
  const name = LIST_PAGES_TOOL.function.name;
  try {
    emit({ name, ok: true, pages: formatPageList(await listPages()) });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to list pages: ${(err as Error).message}`] });
  }
}

async function handleGetPage(
  args: unknown,
  emit: (d: Record<string, unknown>) => void,
): Promise<void> {
  const name = GET_PAGE_TOOL.function.name;
  const id = coerceIdArg(args, "id");
  if (!id) {
    emit({ name, ok: false, errors: ["id is required"] });
    return;
  }
  try {
    const page = await getPageById(id);
    if (!page) {
      emit({ name, ok: false, errors: [`no page with id "${id}"`] });
      return;
    }
    emit({ name, ok: true, page });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to get page: ${(err as Error).message}`] });
  }
}

async function handleListLocales(emit: (d: Record<string, unknown>) => void): Promise<void> {
  const name = LIST_LOCALES_TOOL.function.name;
  try {
    emit({ name, ok: true, locales: await getContentLocales() });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to list locales: ${(err as Error).message}`] });
  }
}

async function handleGetBrandIdentity(emit: (d: Record<string, unknown>) => void): Promise<void> {
  const name = GET_BRAND_IDENTITY_TOOL.function.name;
  try {
    emit({ name, ok: true, identity: await getSiteIdentity() });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to get brand identity: ${(err as Error).message}`] });
  }
}

async function handleGetTheme(emit: (d: Record<string, unknown>) => void): Promise<void> {
  const name = GET_THEME_TOOL.function.name;
  try {
    const [light, dark] = await Promise.all([getThemeOverrides(), getThemeOverridesDark()]);
    emit({ name, ok: true, theme: { light, dark } });
  } catch (err) {
    emit({ name, ok: false, errors: [`failed to get theme: ${(err as Error).message}`] });
  }
}
