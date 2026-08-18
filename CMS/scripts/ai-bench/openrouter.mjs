/**
 * Minimal OpenRouter client for the benchmark — the same wire the CMS uses
 * (`src/lib/ports/ai.ts`, `describe-image.ts`, `generate-image.ts`) minus
 * streaming: one POST, one JSON body, `usage.cost` included so every call is
 * priced by OpenRouter itself (no local price tables).
 */
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {object} req  { model, messages, tools?, maxTokens?, modalities?, temperature? }
 * @returns {{ message, usage:{promptTokens,completionTokens,costUsd}, latencyMs, raw }}
 */
export async function chat(apiKey, req, opts = {}) {
  const { retries = 3 } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await chatOnce(apiKey, req, opts);
    } catch (e) {
      // Retry transient upstream trouble (rate limit / overload / gateway) with backoff.
      const transient = e instanceof OpenRouterError && (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 524 || e.status === 0);
      if (!transient || attempt >= retries) throw e;
      attempt += 1;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500));
    }
  }
}

async function chatOnce(apiKey, req, { timeoutMs = 180_000 } = {}) {
  const body = {
    model: req.model,
    messages: req.messages,
    stream: false,
    usage: { include: true },
  };
  if (req.tools?.length) body.tools = req.tools;
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.modalities) body.modalities = req.modalities;
  if (req.temperature !== undefined) body.temperature = req.temperature;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new OpenRouterError(`network/timeout: ${e.message}`, 0, "");
  }
  clearTimeout(timer);
  const latencyMs = Math.round(performance.now() - t0);
  const text = await res.text();
  if (!res.ok) throw new OpenRouterError(`HTTP ${res.status}`, res.status, text.slice(0, 500));
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OpenRouterError("non-JSON body", res.status, text.slice(0, 500));
  }
  if (json.error) {
    throw new OpenRouterError(json.error.message ?? "provider error", json.error.code ?? 500, JSON.stringify(json.error).slice(0, 500));
  }
  const message = json.choices?.[0]?.message ?? {};
  const u = json.usage ?? {};
  return {
    message,
    finishReason: json.choices?.[0]?.finish_reason ?? null,
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      costUsd: typeof u.cost === "number" ? u.cost : null,
    },
    latencyMs,
    raw: json,
  };
}

/** Text content of a message (string or content-part array). */
export function messageText(message) {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
  }
  return "";
}

/** Parsed tool calls `[{id,name,args}]` (args JSON-parsed; parse failure → args:null). */
export function toolCalls(message) {
  const list = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return list.map((tc) => {
    let args = null;
    try {
      args = JSON.parse(tc.function?.arguments ?? "");
    } catch {
      args = null;
    }
    return { id: tc.id, name: tc.function?.name ?? "", args, rawArgs: tc.function?.arguments ?? "" };
  });
}

/**
 * The CMS's multi-round tool loop (`streamChatRounds`), benchmark edition: the
 * model may call tools up to `maxRounds` times; `runTool(name,args)` returns
 * the tool result object appended as a `role:"tool"` message. Collects every
 * call made + total usage/latency. Ends when the model replies without tools.
 */
export async function runToolLoop(apiKey, { model, messages, tools, maxTokens }, runTool, maxRounds = 4) {
  const msgs = [...messages];
  const calls = [];
  const usage = { promptTokens: 0, completionTokens: 0, costUsd: 0, costKnown: true };
  let latencyMs = 0;
  let last = null;
  for (let round = 0; round <= maxRounds; round += 1) {
    last = await chat(apiKey, { model, messages: msgs, tools, maxTokens });
    latencyMs += last.latencyMs;
    usage.promptTokens += last.usage.promptTokens;
    usage.completionTokens += last.usage.completionTokens;
    if (last.usage.costUsd == null) usage.costKnown = false;
    else usage.costUsd += last.usage.costUsd;
    const tcs = toolCalls(last.message);
    if (tcs.length === 0 || round === maxRounds) break;
    msgs.push({ role: "assistant", content: last.message.content ?? null, tool_calls: last.message.tool_calls });
    for (const tc of tcs) {
      const result = await runTool(tc.name, tc.args, tc);
      calls.push({ round, name: tc.name, args: tc.args, rawArgs: tc.rawArgs, result });
      msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  return { calls, finalText: messageText(last?.message), finalMessage: last?.message, usage, latencyMs, rounds: msgs.length };
}
