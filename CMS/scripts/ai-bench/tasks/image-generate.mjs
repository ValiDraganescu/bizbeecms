/**
 * Purpose `imageGenerate` — text→image via the REAL `buildGenerateMessages`
 * + `parseGeneratedImageUrl` + `decodeDataUrl` and the same `modalities`
 * request. Prompts mirror what the CMS assistant sends (hero photo, cut-out
 * illustration with a white background). Scoring: an image came back, decodes,
 * reasonable size; a vision judge rates prompt adherence + quality; the cost
 * per image (from OpenRouter usage) is the other axis.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildGenerateMessages, parseGeneratedImageUrl, decodeDataUrl } from "../../../src/lib/chat/generate-image.ts";
import { withWhiteBackgroundInstruction } from "../../../src/lib/chat/cutout.ts";
import { chat } from "../openrouter.mjs";
import { judge } from "../judge.mjs";
import { check, judgeCheck } from "./shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const PROMPTS = [
  { id: "hero-photo", prompt: "Wide, photorealistic hero photograph for a modern Nordic restaurant website: a calm dining room with pale wood tables, linen napkins, soft northern daylight through tall windows, a plated pike-perch dish with dill in the foreground. No text, no people looking at camera, editorial food-magazine style.", rubric: "Prompt: photorealistic Nordic restaurant dining room, pale wood, linen, soft daylight, plated fish dish in foreground, no text. Score adherence + photographic quality + usability as a website hero." },
  { id: "flat-icon-cutout", prompt: withWhiteBackgroundInstruction("A simple flat vector-style illustration of a fork and knife crossed inside a circle, two colours only (dark navy and warm gold), clean edges, suitable as a small website icon."), rubric: "Prompt: flat vector fork+knife crossed in a circle, ONLY navy and gold, on a plain white background, clean edges, icon-like. Score adherence (colours, composition, plain white background, no extra elements) + crispness." },
];

export const tasks = PROMPTS.map((p) => ({
  id: p.id,
  run: async (ctx) => {
    const res = await chat(ctx.apiKey, { model: ctx.model, messages: buildGenerateMessages(p.prompt), modalities: ["image", "text"] }, { timeoutMs: 240_000 });
    const url = parseGeneratedImageUrl(JSON.stringify(res.raw));
    const decoded = url ? decodeDataUrl(url) : null;
    const bytes = decoded?.bytes?.byteLength ?? 0;
    const checks = [
      check("returned an image", !!url, 5),
      check("image decodes (data:image/*;base64)", !!decoded, 2, decoded?.contentType),
      check("plausible size (20 KB – 8 MB)", bytes > 20_000 && bytes < 8_000_000, 1, `${Math.round(bytes / 1024)} KB`),
    ];
    if (decoded && ctx.outDir) {
      const dir = join(ctx.outDir, "images");
      mkdirSync(dir, { recursive: true });
      const ext = (decoded.contentType.split("/")[1] || "png").replace("jpeg", "jpg");
      writeFileSync(join(dir, `${ctx.model.replace(/[^a-z0-9]+/gi, "_")}__${p.id}.${ext}`), Buffer.from(decoded.bytes));
    }
    if (url) {
      const j = await judge(ctx.apiKey, ctx.judgeModel, { rubric: p.rubric, content: "(see attached image)", imageDataUrl: url });
      checks.push(judgeCheck("judge: adherence + quality", j, 6));
    }
    return { checks, usage: res.usage, latencyMs: res.latencyMs, transcript: { bytes, contentType: decoded?.contentType ?? null } };
  },
}));

export const purpose = "imageGenerate";
export const modelKind = "image-out";
