---
description: Generate real images (cover art, scene illustrations, app imagery, icon concepts) via the OpenRouter image API at build time. Load when a task involves producing visual/image assets or replacing placeholder graphics.
argument-hint: "(optional) which images to generate"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# OpenRouter image generation (build-time)

Your task touches **visual assets** — cover art, scene illustrations, onboarding imagery, app graphics, icon concepts. This skill gives you an image generator: the [OpenRouter image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), turning text prompts into bundled `.png` assets the app ships.

## The architecture (same as the audio capability — don't fight it)

Images are generated at **build time**, not runtime:
- The app's visual assets are known ahead of time. Generate them once, bundle them.
- A repo script renders each prompt into a `.png`; those files ship in the app bundle (wherever the project keeps its image resources).
- At runtime the app just **loads the local image** — it never calls OpenRouter, so the API key never leaves your machine.

This mirrors the `orc-elevenlabs` audio capability exactly. If you've used that, this is the same shape with images instead of audio.

> **Orient first.** This is a generic capability — before generating, read the project's source (and its goal/design docs, if any) to learn where image resources live, what aspect ratios / dimensions the UI expects, and how views reference an image asset. Fit the project's existing structure; don't invent one.

## The key — from `.env`, never committed

The API key is read from **`.env` in the project root** (`OPENROUTER_API_KEY=...`). This file is gitignored. Rules:
- **Never** print, echo, log, `cat`, or commit the key. Don't paste it into code, manifests, or notes.
- If `.env` is missing or the key is the `your-key-here` placeholder, you're **blocked** — record the blocker, tell the user to add `OPENROUTER_API_KEY` to `.env` (a committed `.env.example` template is the convention), and stop. Do not invent a key.
- Generated `.png` files are fine to commit (they're just images, no secret).

## The tool — `Tools/ImageGen/openrouter.sh`

A thin wrapper over the API. It loads the key from `.env` itself; you never pass it.

> **First run:** if `Tools/ImageGen/openrouter.sh` doesn't exist yet, creating it (per the endpoint spec in the caveats below) is itself a good first slice — a thin `curl` wrapper that loads `.env`, decodes the base64 data URL, masks the key on error, and guards HTTP≠200. Generate the actual assets after it works.

```bash
# List image-capable models (id + name) so you can pick one.
./Tools/ImageGen/openrouter.sh models

# One prompt -> one file.
./Tools/ImageGen/openrouter.sh gen <out_dir>/cover.png \
  "WW2 trench at dawn, lone soldier silhouette, cinematic, dramatic light, 3:2" \
  google/gemini-3.1-flash-image-preview

# Batch from a JSON manifest (recommended for a whole art set).
./Tools/ImageGen/openrouter.sh manifest Tools/ImageGen/images.manifest.json <out_dir>
```

Manifest entry: `{ "id": "<filename-stem>", "prompt": "<prompt>", "model_id": "<optional>" }` → writes `<out_dir>/<id>.png`. The script **skips an id whose .png already exists** so you don't spend credits regenerating.

## Picking a model (you choose)

Run `models`, or use these picks (OpenRouter rankings as of June 2026 — re-check the web/`models` if unsure):
- **`google/gemini-3.1-flash-image-preview`** (Nano Banana 2) — **default.** Pro-level quality at Flash speed/price. Best all-rounder.
- **`google/gemini-3-pro-image-preview`** (Nano Banana Pro) — max quality, pricier. Use for a hero asset if it matters.
- **`google/gemini-2.5-flash-image`** (Nano Banana) — GA, proven, cheap.
- **`bytedance-seed/seedream-4.5`** — flat **$0.04/image**, predictable cost.
- **`black-forest-labs/flux.2-max`** — open-weights, top FLUX quality.

The Gemini models also support **image editing / reference images** if you want iterative or style-consistent art across a set.

If you pick a non-default model for a reason, record the choice + rationale in a small committed note (e.g. a comment in the manifest). Model ids are not secret — safe to commit.

## Prompting

Lean into the project's visual identity (read its design notes / goal docs for tone). General craft:
- State the subject, setting, mood, lighting, and style explicitly.
- Aim for a consistent aspect ratio per use (covers ~3:2 or 2:3 portrait for cards; full-screen backgrounds ~9:19.5). State the ratio in the prompt; some models honor it.
- For a coherent set (a series of covers, a themed illustration pack), reuse a style phrase across prompts, or use a reference image with the Gemini models.

## A sensible first slice

If this is the project's first image work, a good single slice is: ensure the tool exists, generate one coherent batch of images (e.g. the covers the UI needs) into the project's image resource dir via a small manifest, and eyeball each file's size (`ls -la`, plus `sips -g pixelWidth -g pixelHeight <file>` to confirm real dimensions). Wiring the images into the views (and bundling the resource dir into the build target) can be the next slice.

## Verify before you commit

- Each generated `.png` is a real image: size > a few KB, and `sips -g pixelWidth -g pixelHeight <file>` reports plausible dimensions (the script warns if a file is < 1 KB).
- Record exactly what you could and couldn't verify (you can't *see* the image, but valid dimensions + plausible size is good signal).
- Generated images + any manifest get committed with the rest of the work.

## Caveats worth carrying forward

Durable facts future sessions need. Record them wherever the project keeps such notes — a Meeseeks worker seeds them into its goal's `CAVEATS.md` (goal-agnostic ones also into `goals/main/CAVEATS.md`):

- Image gen is BUILD-TIME via `Tools/ImageGen/openrouter.sh`; the app never calls OpenRouter at runtime. Key is in `.env` (gitignored) — never print/commit it.
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`, auth `Authorization: Bearer <key>`, body needs `"modalities": ["image","text"]`; the image comes back as a base64 data URL in `choices[0].message.images[0].image_url.url` (the script decodes it for you).
- OpenRouter spends credits per generation — the manifest skips ids whose `.png` already exists; don't regenerate existing art.
- Default model `google/gemini-3.1-flash-image-preview`; `models` lists current image-capable options. Re-check rankings on the web if quality matters.
