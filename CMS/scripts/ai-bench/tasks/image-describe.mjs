/**
 * Purpose `imageDescribe` — alt text / media-search description. Calls the
 * REAL `describeImage()` (prompt, 300-token cap, reasoning-off + mandatory-
 * reasoning fallback) on fixture images with known content; scores keyword recall, format
 * (1–2 plain sentences, no markdown, ≤600 chars) and factuality via a judge
 * that sees the image.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describeImage } from "../../../src/lib/chat/describe-image.ts";
import { judge } from "../judge.mjs";
import { check, judgeCheck } from "./shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function dataUrl(file) {
  const bytes = readFileSync(join(HERE, "..", "fixtures", file));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const IMAGES = [
  { id: "logo", file: "logo.png", must: [/logo|emblem|brand/i, /restovista/i], should: [/nordic kitchen/i, /gold|yellow|beige/i, /navy|dark blue|blue/i, /circle|ring/i] },
  { id: "chart", file: "chart.png", must: [/chart|graph/i, /sales/i], should: [/2026/, /bar/i, /jan|feb|mar|apr|may|month/i, /blue/i, /red/i] },
  { id: "sign", file: "sign.png", must: [/open/i, /sign/i], should: [/green/i, /12/, /22/, /tue|sat/i, /white/i] },
];

export const tasks = IMAGES.map((img) => ({
  id: img.id,
  run: async (ctx) => {
    const url = dataUrl(img.file);
    // Call the REAL production function (reasoning-off first, mandatory-reasoning
    // fallback, 300-token cap) — a fetch wrapper only measures latency/tokens.
    const t0 = performance.now();
    let promptTokens = 0, completionTokens = 0, requests = 0;
    const timedFetch = async (input, init) => {
      requests += 1;
      const r = await fetch(input, init);
      const text = await r.text();
      try { const u = JSON.parse(text).usage; if (u) { promptTokens += u.prompt_tokens ?? 0; completionTokens += u.completion_tokens ?? 0; } } catch { /* ignore */ }
      return { ok: r.ok, status: r.status, text: async () => text };
    };
    const out = await describeImage(url, ctx.model, ctx.apiKey, timedFetch);
    const res = { usage: { promptTokens, completionTokens, costUsd: out.cost ?? null, costKnown: out.cost != null }, latencyMs: Math.round(performance.now() - t0) };
    const desc = out.description;
    const sentences = desc.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    const mustHits = img.must.filter((re) => re.test(desc)).length;
    const shouldHits = img.should.filter((re) => re.test(desc)).length;
    const checks = [
      check("non-empty description", desc.length > 0, 3),
      check(`names the essentials (${mustHits}/${img.must.length})`, mustHits === img.must.length, 4, desc.slice(0, 160)),
      check(`rich in detail (${shouldHits}/${img.should.length} details)`, shouldHits >= Math.ceil(img.should.length / 2), 2),
      check("plain text, no markdown/preamble", !/[*#`]|^(here|this image|the image shows)/i.test(desc), 1),
      check("1–2 sentences, ≤ 600 chars", sentences >= 1 && sentences <= 3 && desc.length <= 600, 1, `${sentences} sentences, ${desc.length} chars`),
    ];
    const j = await judge(ctx.apiKey, ctx.judgeModel, {
      rubric: "Look at the attached image. Score the description below as a MEDIA-LIBRARY SEARCH ENTRY: factual, keyword-rich, names the concrete subject, colors and any visible text exactly, no hallucinated elements.",
      content: desc || "(empty)",
      imageDataUrl: url,
    });
    checks.push(judgeCheck("judge: factual + complete", j, 3));
    return { checks, usage: res.usage, latencyMs: res.latencyMs, transcript: { description: desc, requests } };
  },
}));

export const purpose = "imageDescribe";
export const modelKind = "vision";
