/**
 * Purpose `translate` — EN → FI/ET. Real `buildTranslateMessages` +
 * `parseTranslateResponse` + `validateTranslationInput` over CMS-flavoured
 * fields (UI strings with {placeholders}, inline markup, marketing copy).
 * Deterministic checks (parse, completeness, placeholder/markup preservation,
 * non-identity) + a judge for fluency/accuracy per language.
 */
import { buildTranslateMessages, parseTranslateResponse } from "../../../src/lib/chat/translate-request.ts";
import { validateTranslationInput } from "../../../src/lib/chat/translate-tool.ts";
import { chat, messageText } from "../openrouter.mjs";
import { judge } from "../judge.mjs";
import { check, judgeCheck } from "./shared.mjs";

const FROM = "en";
const TO = ["fi", "et"];

const SETS = {
  "ui-strings": {
    fields: {
      bookCta: "Book a table",
      guestsLine: "Your reservation for {count} guests on {date} at {time}",
      freeDelivery: "<strong>Free</strong> delivery on orders over 30 €",
      openHours: "Open Tue–Sat 12:00–22:00 · Kitchen closes at 21:30",
      errorRequired: "Please fill in all required fields.",
    },
    rubric: "Short website UI strings for a restaurant. Score fluency, correct register (natural UI wording, not word-for-word), and exactness — {placeholders} and <strong> tags must be kept verbatim, times/prices unchanged.",
  },
  "marketing-copy": {
    fields: {
      heroTitle: "Taste the North",
      heroBody: "Seasonal menus built around what our producers bring in this week — pike-perch from Lake Peipus, elk from the forests of Võru, mushrooms foraged the morning you eat them.",
      aboutBody: "Restovista opened in 2019 in a former print house on Pikk street. The room is calm and unhurried; the food is honest, precise and rooted in Estonian and Finnish tradition without being stuck in it.",
    },
    rubric: "Marketing copy for a Nordic restaurant. Score for idiomatic, evocative native-quality prose (not literal), preservation of all facts (places, years, dishes), and tone (warm, confident, plain).",
  },
  "richtext-markdown": {
    fields: {
      allergenNote: "Ask our staff about allergens — see the [full allergen list](/allergens) or call **+372 555 0123**.",
      footerNote: "© 2026 Restovista OÜ · All rights reserved",
    },
    rubric: "Rich text with Markdown. Score for correct translation with the Markdown link syntax, URL, bold marker and phone number preserved exactly.",
  },
};

const PLACEHOLDER_RE = /\{[a-zA-Z]+\}/g;
const MARKUP_RE = /<\/?[a-z]+>|\[[^\]]+\]\([^)]+\)|\*\*/g;

function preserved(src, out, re) {
  const want = [...src.matchAll(re)].map((m) => m[0]).sort();
  const got = [...String(out ?? "").matchAll(re)].map((m) => m[0]).sort();
  // Markdown link text may be translated: compare only the (url) parts for links.
  const norm = (arr) => arr.map((s) => s.replace(/^\[[^\]]+\]/, "[…]"));
  return JSON.stringify(norm(want)) === JSON.stringify(norm(got));
}

async function runSet(ctx, key) {
  const set = SETS[key];
  const messages = buildTranslateMessages(FROM, TO, set.fields);
  const res = await chat(ctx.apiKey, { model: ctx.model, messages, maxTokens: 8000 });
  const text = messageText(res.message);
  const parsed = parseTranslateResponse(text, FROM, TO, set.fields);
  const checks = [
    check("response parsed as JSON object", parsed.fields && Object.keys(parsed.fields).length > 0, 3),
    check("no missing field/locale", parsed.missing.length === 0, 4, parsed.missing.join(", ")),
  ];
  const v = validateTranslationInput({ kind: "page", target: "page_home_01", fromLocale: FROM, fields: parsed.fields }, { allowedLocales: [FROM, ...TO] });
  checks.push(check("passes validateTranslationInput", v.ok, 2, v.ok ? "" : (v.errors ?? []).join("; ")));

  let identity = 0, phOk = 0, mkOk = 0, n = 0;
  for (const [name, src] of Object.entries(set.fields)) {
    for (const loc of TO) {
      const out = parsed.fields?.[name]?.[loc];
      n += 1;
      if (typeof out === "string" && out.trim() === src.trim()) identity += 1;
      if (preserved(src, out, PLACEHOLDER_RE)) phOk += 1;
      if (preserved(src, out, MARKUP_RE)) mkOk += 1;
    }
  }
  const hasPh = Object.values(set.fields).some((s) => PLACEHOLDER_RE.test(s));
  const hasMk = Object.values(set.fields).some((s) => MARKUP_RE.test(s));
  checks.push(check("no untranslated (identical) strings", identity === 0, 2, `${identity}/${n} identical`));
  if (hasPh) checks.push(check("{placeholders} preserved verbatim", phOk === n, 3, `${phOk}/${n}`));
  if (hasMk) checks.push(check("markup/markdown preserved", mkOk === n, 3, `${mkOk}/${n}`));

  let judgeCost = 0;
  for (const loc of TO) {
    const pairs = Object.entries(set.fields).map(([k, src]) => `[${k}]\nEN: ${src}\n${loc.toUpperCase()}: ${parsed.fields?.[k]?.[loc] ?? "(missing)"}`).join("\n\n");
    const j = await judge(ctx.apiKey, ctx.judgeModel, {
      rubric: `Evaluate the ${loc === "fi" ? "Finnish" : "Estonian"} translations below as a native professional translator would. ${set.rubric}`,
      content: pairs,
    });
    judgeCost += j.costUsd;
    checks.push(judgeCheck(`judge: ${loc} quality`, j, 4));
  }
  return { checks, usage: res.usage, latencyMs: res.latencyMs, transcript: { text: text.slice(0, 2000) } };
}

export const tasks = Object.keys(SETS).map((key) => ({ id: key, run: (ctx) => runSet(ctx, key) }));
export const purpose = "translate";
export const modelKind = "text";
