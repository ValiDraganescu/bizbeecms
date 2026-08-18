# AI model benchmark (`scripts/ai-bench`)

Scores OpenRouter models on **our five AI purposes** — `chatAgent`, `assistant`,
`translate`, `imageDescribe`, `imageGenerate` — using the CMS's **real** prompt
builders, tool schemas and validators (imported from `src/lib` via Node type
stripping, same as the `scripts/*.test.mjs` suite). It exists so the curated
catalog in PM → Settings → AI models is chosen from measurements, not vibes.

```bash
cd CMS
node scripts/ai-bench/bench.mjs --purpose translate                 # default cheap-tier matrix
node scripts/ai-bench/bench.mjs --purpose chatAgent --models google/gemini-3.7-flash,x-ai/grok-4.3 --repeat 3
node scripts/ai-bench/bench.mjs --all                               # everything (~$3 with judge)
node scripts/ai-bench/bench.mjs --purpose assistant --no-judge      # deterministic checks only
```

Key: `--key`, `OPENROUTER_API_KEY`, or `CMS/.dev.vars` (in that order). Cost is
whatever OpenRouter reports in `usage.cost` — no local price tables. Output:
Markdown leaderboard on stdout + `results/<stamp>/report.md`, `results.json`
(every check, tool call and reply per run) and `images/` for generated images.

## What each purpose tests

| purpose | real code used | tasks | scored on |
|---|---|---|---|
| **assistant** | `buildSystemPrompt` + `contextPrompt`, real tool schemas, `validateComponentArtifact`, `validateBlocks`, `validateEditText`; mocked read tools (fixture Site: Hero/MenuItemCard/Footer, a Home page, en/fi/et) | create a Testimonial component · add a 3-column section to a page · patch one Tailwind class in the Hero with `edit_text` · answer a question without writing · retitle the hero via `set_block_props` (one block, per-locale) · FeatureRow with `search_icons` + `generate_image` (transparent cut-out) wired into the artifact | correct tool chosen, artifact/blocks/edit args pass the CMS validators, translatable slots + per-locale defaults, theme tokens only (no raw palette/hex), keeps existing blocks, no code pasted in chat |
| **chatAgent** | `assembleGuestPrompt` + `buildGuestTools` + `timeContextLine` + `stampForModel`; fixture restaurant agent (reservations create, menu query); mocked results | reservation with relative date · Finnish allergen question · prompt injection inside a tool result · off-topic request · prompt/tool leak attempt | tool called with the right args (date resolved from the `[at …]` stamp), guardrails held, answers in the visitor's language (judge), concise |
| **translate** | `buildTranslateMessages`, `parseTranslateResponse`, `validateTranslationInput` | UI strings with `{placeholders}` + `<strong>` · marketing copy · Markdown/rich text | parses, nothing missing, placeholders/markup preserved verbatim, not left untranslated, judge scores fi + et fluency/accuracy |
| **imageDescribe** | `buildDescribeMessages`, `parseDescription`, `max_tokens 300` | 3 fixture PNGs with known content (logo with text, bar chart, shop sign) | must-have keywords, detail recall, plain 1–2 sentences ≤600 chars, vision judge for factuality |
| **imageGenerate** | `buildGenerateMessages`, `withWhiteBackgroundInstruction`, `parseGeneratedImageUrl`, `decodeDataUrl`, `modalities:["image","text"]` | hero photo · flat icon cut-out | image returned + decodes + size; vision judge for adherence/quality; $/image |

Scores are weighted check pass-rates (0–100 %) averaged over tasks; judge checks
(1–5) contribute proportionally and are dropped entirely with `--no-judge`.
Latency is end-to-end per task (all tool rounds), non-streaming.

## Reading the results

- **score** first, then **$/run**, then latency. The "Value" line is score per
  cent — a rough "good enough and cheap" ranking.
- The `weakest tasks` column names the failed checks — that is the actual
  behaviour to worry about (e.g. `edit_text args validate` = the model mixed
  replace/replaceBetween modes; `theme tokens only` = raw palette classes).
- One run per cell is noisy for the tool-use tasks; use `--repeat 3` on the
  short-list before deciding.
- The judge is a fixed model (`--judge`, default `openai/gpt-5.4`) so every
  candidate is graded on the same scale; keep it out of the candidate list.

## Adding a task / model

- Tasks: `tasks/<purpose>.mjs` exports `tasks: [{ id, run(ctx) → { checks, usage, latencyMs, transcript } }]`;
  build checks with `check(name, pass, weight, note)` / `judgeCheck(name, judgeResult, weight)` from `tasks/shared.mjs`.
  Import prompt builders/validators from `src/lib` — never re-implement them.
- Models: `models.default.json` (cheap tier by default), or `--models` ad hoc.
- Fixture images: `fixtures/*.png` (rendered from hand-written SVG via `qlmanage -t`).

## Eligibility gate

The runner checks each candidate against the OpenRouter catalog before running
(mirrors PM's `PURPOSE_CAPABILITY_FILTERS`): **assistant = image input + tool
calling** (the CMS assistant receives screenshots/reference images — vision is a
hard product rule), chatAgent = tools, imageDescribe = image input,
imageGenerate = image output. Ineligible models are skipped with a `⤫` note.
