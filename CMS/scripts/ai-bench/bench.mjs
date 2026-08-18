#!/usr/bin/env node
/**
 * bizbeecms AI model benchmark — scores OpenRouter models on OUR five AI
 * purposes using the CMS's real prompts, tool schemas and validators.
 *
 *   node scripts/ai-bench/bench.mjs --purpose translate
 *   node scripts/ai-bench/bench.mjs --purpose chatAgent --models google/gemini-3.7-flash,x-ai/grok-4.6 --repeat 2
 *   node scripts/ai-bench/bench.mjs --all
 *
 * Options
 *   --purpose <p>       chatAgent | assistant | translate | imageDescribe | imageGenerate
 *   --all               every purpose
 *   --models a,b,c      override the candidate list (default: models.default.json[purpose])
 *   --tasks id1,id2     run only these task ids
 *   --repeat N          run each task N times (default 1); scores/latency averaged, cost summed
 *   --judge <model>     judge model (default openai/gpt-5.4); --no-judge skips judge checks
 *   --concurrency N     parallel model×task cells (default 4)
 *   --out <dir>         results dir (default scripts/ai-bench/results/<timestamp>)
 *   --key <sk-or-…>     API key (default: OPENROUTER_API_KEY env, else CMS/.dev.vars)
 *
 * Output: a Markdown leaderboard per purpose (score %, cost per run, latency,
 * failed checks) on stdout + `report.md` and `results.json` in --out.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_JUDGE } from "./judge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PURPOSES = ["chatAgent", "assistant", "translate", "imageDescribe", "imageGenerate"];
const TASK_FILES = { chatAgent: "chat-agent", assistant: "assistant", translate: "translate", imageDescribe: "image-describe", imageGenerate: "image-generate" };

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes(`--${name}`);
const purposes = flag("all") ? PURPOSES : [opt("purpose")].filter(Boolean);
if (purposes.length === 0 || purposes.some((p) => !PURPOSES.includes(p))) {
  console.error(`usage: --purpose <${PURPOSES.join("|")}> | --all   [--models a,b] [--repeat N] [--judge m|--no-judge] [--tasks ids] [--out dir]`);
  process.exit(2);
}
const modelsOverride = opt("models") ? opt("models").split(",").map((s) => s.trim()).filter(Boolean) : null;
const taskFilter = opt("tasks") ? new Set(opt("tasks").split(",")) : null;
const repeat = Math.max(1, Number(opt("repeat", "1")) || 1);
const judgeModel = flag("no-judge") ? null : opt("judge", DEFAULT_JUDGE);
const concurrency = Math.max(1, Number(opt("concurrency", "4")) || 4);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = resolve(opt("out", join(HERE, "results", stamp)));
mkdirSync(outDir, { recursive: true });

function loadKey() {
  const k = opt("key") || process.env.OPENROUTER_API_KEY;
  if (k) return k;
  const dv = join(HERE, "..", "..", ".dev.vars");
  if (existsSync(dv)) {
    const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync(dv, "utf8"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  console.error("No OpenRouter key: pass --key, set OPENROUTER_API_KEY, or put it in CMS/.dev.vars");
  process.exit(2);
}
const apiKey = loadKey();
const defaults = JSON.parse(readFileSync(join(HERE, "models.default.json"), "utf8"));

// ── eligibility: hard capability requirements per purpose (mirrors PM's picker
// filter, PURPOSE_CAPABILITY_FILTERS). A model that can't take image input is
// NOT an assistant candidate no matter how well it uses tools.
const REQUIRE = {
  assistant: { input: ["image"], tools: true },
  chatAgent: { tools: true },
  translate: {},
  imageDescribe: { input: ["image"] },
  imageGenerate: { output: ["image"] },
};
let catalogById = null;
async function catalog() {
  if (catalogById) return catalogById;
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const json = await res.json();
  catalogById = new Map((json.data ?? []).map((m) => [m.id, m]));
  return catalogById;
}
async function eligible(purpose, models) {
  const req = REQUIRE[purpose] ?? {};
  const cat = await catalog();
  const keep = [];
  for (const id of models) {
    const m = cat.get(id);
    if (!m) { console.error(`  ⤫ ${id}: not in the OpenRouter catalog — skipped`); continue; }
    const inMods = m.architecture?.input_modalities ?? ["text"];
    const outMods = m.architecture?.output_modalities ?? ["text"];
    const missing = [];
    for (const x of req.input ?? []) if (!inMods.includes(x)) missing.push(`input:${x}`);
    for (const x of req.output ?? []) if (!outMods.includes(x)) missing.push(`output:${x}`);
    if (req.tools && !(m.supported_parameters ?? []).includes("tools")) missing.push("tools");
    if (missing.length) { console.error(`  ⤫ ${id}: not eligible for ${purpose} (lacks ${missing.join(", ")}) — skipped`); continue; }
    keep.push(id);
  }
  return keep;
}

// ── run ──────────────────────────────────────────────────────────────────────
async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }));
  return results;
}

function scoreChecks(checks) {
  const usable = checks.filter((c) => !(c.name.startsWith("judge:") && !judgeModel));
  const max = usable.reduce((s, c) => s + c.weight, 0);
  const got = usable.reduce((s, c) => s + (c.points ?? (c.pass ? c.weight : 0)), 0);
  return { got, max, pct: max ? (100 * got) / max : 0 };
}

const fmtUsd = (v) => (v == null ? "?" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);
const all = {};

for (const purpose of purposes) {
  const mod = await import(`./tasks/${TASK_FILES[purpose]}.mjs`);
  const tasks = mod.tasks.filter((t) => !taskFilter || taskFilter.has(t.id));
  const models = await eligible(purpose, modelsOverride ?? defaults[purpose] ?? []);
  console.error(`\n▶ ${purpose}: ${models.length} models × ${tasks.length} tasks × ${repeat} run(s)${judgeModel ? ` · judge ${judgeModel}` : " · no judge"}`);

  const cells = [];
  for (const model of models) for (const task of tasks) for (let r = 0; r < repeat; r += 1) cells.push({ model, task, r });

  const runs = await pool(cells, concurrency, async ({ model, task, r }) => {
    // With --no-judge, judge() short-circuits (ctx.judgeModel null) and judge checks are dropped from scoring.
    const ctx = { apiKey, model, judgeModel, outDir, purpose };
    const t0 = Date.now();
    try {
      const res = await task.run(ctx);
      const sc = scoreChecks(res.checks);
      const judgeCost = res.checks.reduce((s, c) => s + (c.judgeCostUsd ?? 0), 0);
      console.error(`  ${sc.pct.toFixed(0).padStart(3)}%  ${model.padEnd(36)} ${task.id.padEnd(32)} ${(res.latencyMs / 1000).toFixed(1)}s ${fmtUsd(res.usage.costUsd)}${r ? ` (run ${r + 1})` : ""}`);
      return { model, task: task.id, run: r, ok: true, ...sc, checks: res.checks, usage: res.usage, latencyMs: res.latencyMs, judgeCostUsd: judgeCost, transcript: res.transcript, wallMs: Date.now() - t0 };
    } catch (e) {
      console.error(`  ERR   ${model.padEnd(36)} ${task.id.padEnd(32)} ${String(e.message).slice(0, 120)}`);
      return { model, task: task.id, run: r, ok: false, error: `${e.message} ${e.body ?? ""}`.slice(0, 400), got: 0, max: 0, pct: 0, checks: [], usage: { costUsd: 0 }, latencyMs: 0, judgeCostUsd: 0 };
    }
  });

  // aggregate per model
  const perModel = models.map((model) => {
    const mine = runs.filter((x) => x.model === model);
    const okRuns = mine.filter((x) => x.ok);
    const byTask = tasks.map((t) => {
      const tr = mine.filter((x) => x.task === t.id);
      const pct = tr.length ? tr.reduce((s, x) => s + x.pct, 0) / tr.length : 0;
      const failed = [...new Set(tr.flatMap((x) => x.ok ? x.checks.filter((c) => !c.pass && !(c.name.startsWith("judge:") && !judgeModel)).map((c) => c.name) : ["ERROR: " + (x.error ?? "")]))];
      return { task: t.id, pct, failed, errors: tr.filter((x) => !x.ok).length };
    });
    const score = byTask.length ? byTask.reduce((s, t) => s + t.pct, 0) / byTask.length : 0;
    const costKnown = okRuns.every((x) => x.usage.costUsd != null && x.usage.costKnown !== false);
    const cost = okRuns.reduce((s, x) => s + (x.usage.costUsd ?? 0), 0);
    const perRun = okRuns.length ? cost / okRuns.length : null;
    const lat = okRuns.length ? okRuns.reduce((s, x) => s + x.latencyMs, 0) / okRuns.length : null;
    const errors = mine.filter((x) => !x.ok).length;
    return { model, score, costPerRun: costKnown ? perRun : null, costTotal: cost, latencyMs: lat, errors, byTask };
  }).sort((a, b) => b.score - a.score || (a.costPerRun ?? 9) - (b.costPerRun ?? 9));

  all[purpose] = { models: perModel, runs, tasks: tasks.map((t) => t.id) };
}

// ── report ───────────────────────────────────────────────────────────────────
const lines = [`# AI model benchmark — ${stamp}`, "", `Judge: ${judgeModel ?? "none"} · repeat ${repeat} · tasks use the CMS's real prompts/tools/validators.`, ""];
for (const [purpose, data] of Object.entries(all)) {
  lines.push(`## ${purpose}`, "", `Tasks: ${data.tasks.join(", ")}`, "", "| # | model | score | $/run | latency | errors | weakest tasks (failed checks) |", "|---|---|---|---|---|---|---|");
  data.models.forEach((m, i) => {
    const weak = m.byTask.filter((t) => t.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 3)
      .map((t) => `${t.task} ${t.pct.toFixed(0)}%${t.failed.length ? ` (${t.failed.slice(0, 3).join("; ")})` : ""}`).join("<br>");
    lines.push(`| ${i + 1} | ${m.model} | **${m.score.toFixed(1)}%** | ${fmtUsd(m.costPerRun)} | ${m.latencyMs == null ? "—" : (m.latencyMs / 1000).toFixed(1) + "s"} | ${m.errors || ""} | ${weak} |`);
  });
  lines.push("");
  // value view: score per cent
  const priced = data.models.filter((m) => m.costPerRun != null && m.costPerRun > 0 && m.score > 0);
  if (priced.length) {
    lines.push(`Value (score ÷ $/run, higher = more score per dollar): ` + priced.map((m) => ({ m: m.model, v: m.score / (m.costPerRun * 100) })).sort((a, b) => b.v - a.v).slice(0, 5).map((x) => `${x.m} ${x.v.toFixed(0)}`).join(" · "), "");
  }
}
const report = lines.join("\n");
writeFileSync(join(outDir, "report.md"), report);
writeFileSync(join(outDir, "results.json"), JSON.stringify({ stamp, judgeModel, repeat, purposes: all }, null, 2));
console.log(report);
console.error(`\nSaved ${join(outDir, "report.md")} (+ results.json${existsSync(join(outDir, "images")) ? ", images/" : ""})`);
