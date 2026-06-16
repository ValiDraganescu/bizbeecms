---
description: Meeseeks capability — generate real, high-quality AUDIO assets using the ElevenLabs API (build-time). Three modes — Text to Speech (narration / voice lines), Sound Effects (gunfire/wind/footsteps/ambient beds, one-shot or looping), and Music Generation (studio-grade soundtrack beds). Load this when a Meeseeks task involves producing voice, sound-effect, or music audio files, picking voices, or replacing placeholder/silent audio. Reads the API key from .env (never committed); renders into bundled assets the app plays back locally.
argument-hint: "(optional) which voices / cues / sfx / music to generate"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# ElevenLabs audio generation (build-time)

You're a Meeseeks whose task touches **audio**. This skill gives the app a real soundtrack via the [ElevenLabs](https://elevenlabs.io/docs/overview/intro) API — three capabilities, all build-time, all producing bundled audio assets the app plays back:

- **Text to Speech** — narration / spoken lines from authored text. [[docs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)]
- **Sound Effects** — one-shot or seamless-looping SFX: distant gunfire, wind, footsteps, a trailer braam, ambient beds. [[docs](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)]
- **Music Generation** — studio-grade soundtrack beds from a prompt (tense strings, driving chase synth, ambient pads). [[docs](https://elevenlabs.io/docs/api-reference/music/compose)]

> Your API key must have the matching endpoints enabled (Text to Speech / Sound Effects / Music Generation). If a call returns 401/permission errors on one capability but others work, the key is missing that endpoint's access — record it as a caveat and tell the user.

The rest of this skill covers all three. They share the same architecture, key handling, and tool.

## The architecture (don't fight it)

Audio is generated at **build time**, not runtime:
- The text/prompts for the assets are **authored data** — they live in the project's source (wherever the app's narration / cue text is defined). They're known ahead of time.
- A repo script pre-renders each cue into an audio file; those files ship in the app bundle.
- At runtime the app just **plays the local file** — it never calls ElevenLabs, so the API key never leaves your machine.

So your job in an audio task is: pick voices → render the cues → wire the generated filenames into wherever the app references its audio assets → make the player prefer the generated asset. Do as much as fits one Meeseeks run; leave the rest in `BACKLOG.md`/`NEXT.md`.

> **Orient first.** This is a generic capability — before generating, read `GOAL.md` and the project's own source to learn where audio assets live, what model type the code expects (which audio container/path it loads), and how the player picks an asset. Don't invent a structure the project doesn't have; fit the project's existing seam.

## The key — from `.env`, never committed

The API key is read from **`.env` in the project root** (`ELEVENLABS_API_KEY=...`). This file is gitignored. Rules:
- **Never** print, echo, log, or commit the key. Don't `cat .env`. Don't paste it into code, tests, manifests, or a journal entry.
- If `.env` is missing or the key is the `your-key-here` placeholder, you're **blocked** — record it as a blocker (`CAVEATS.md` + `NEXT.md`), tell the user to add their key to `.env` (a committed `.env.example` template is the convention), and end the run. Do not invent a key.
- Generated audio files are fine to commit (they're just audio, no secret).

## The tool — `Tools/AudioGen/elevenlabs.sh`

A thin wrapper over all three capabilities. It loads the key from `.env` itself; you never pass it. Run with no args to see usage.

> **First run:** if `Tools/AudioGen/elevenlabs.sh` doesn't exist yet, creating it (per the endpoint spec in the caveats below) is itself a good single Meeseeks task — a thin `curl` wrapper that loads `.env`, masks the key on error, and guards HTTP≠200. Leave the actual asset generation to the next run.

### 1. Text to Speech (narration)
```bash
# List voices — pick narrators by name/labels (e.g. gruff/military for a commander).
./Tools/AudioGen/elevenlabs.sh voices        # -> voice_id <tab> name <tab> labels

# List TTS models (eleven_v3 is latest/most expressive; eleven_multilingual_v2 is a safe default).
./Tools/AudioGen/elevenlabs.sh models

# One line -> one file.
./Tools/AudioGen/elevenlabs.sh say <voice_id> <out_dir>/briefing.mp3 "Listen up, soldier." eleven_v3

# Batch from a JSON manifest (recommended for a whole set of cues).
./Tools/AudioGen/elevenlabs.sh manifest Tools/AudioGen/narration.manifest.json <out_dir>
```
Manifest entry: `{ "id": "<filename-stem>", "voice_id": "<id>", "text": "<line>", "model_id": "eleven_v3" }`. The manifest **skips an id whose .mp3 already exists** (don't spend credits regenerating).

### 2. Sound Effects
```bash
# sfx <out.mp3> "<description>" [duration_seconds 0.5-30] [loop true|false]
./Tools/AudioGen/elevenlabs.sh sfx <out_dir>/rifle-shot.mp3 "single distant rifle shot, WW2" 2
# A seamless LOOP for an ambient bed (wind, rain, crowd, distant battle):
./Tools/AudioGen/elevenlabs.sh sfx <out_dir>/wind-loop.mp3 "cold howling wind over a battlefield" 10 true
```
`loop true` makes a seamless loop (v2 model, the default) — ideal for ambient beds that play under a whole interval. Omit the duration to let the model decide. Model: `eleven_text_to_sound_v2`.

### 3. Music Generation
```bash
# music <out.mp3> "<prompt>" [length_ms 3000-600000]
./Tools/AudioGen/elevenlabs.sh music <out_dir>/main-theme.mp3 \
  "tense, driving orchestral score, low brass and snare, builds to a charge" 30000
```
Studio-grade soundtrack from a natural-language prompt. `length_ms` 3000–600000 (3s–10min); omit to let the model choose. Model: `music_v1` (a `music_v2` may exist — check `models`/the web if you want the newest). Keep beds long enough to cover a phase, or loop a shorter one in the player.

> All three return raw `.mp3` bytes and write straight to the output path. The script guards HTTP≠200 and masks the key in any error output.

## Picking voices (you choose, autonomously)

Run `voices`, then choose a fitting `voice_id` per role the project's narration model defines. A typical set:
- **commander / authoritative** — deep, firm, gruff, military. Barking orders.
- **ambient / neutral** — atmospheric narration, scene-setting, warnings.
- **inner / intimate** — closer, quieter, introspective.

Map these to whatever narrator roles the project's own domain model actually has — read its source first.

**Record your choices** so the next Meeseeks doesn't re-pick: write the chosen `voice_id`s into a small committed config (e.g. `Tools/AudioGen/voices.json` mapping role → voice_id + a human note on why) AND add a one-line caveat to your goal's `CAVEATS.md` (the `<GOAL_DIR>/CAVEATS.md` your core `orc-meeseeks` run resolved). Voice IDs are not secret — safe to commit.

## Where SFX & music fit in the app (domain note)

Narration usually has a home already — a per-cue audio-asset field and a player that prefers the bundled file. **Sound effects and music are often NEW asset types** the domain doesn't model yet. Don't force them into the narration cue type. A clean shape:
- A per-beat / per-event optional **sound-effect** reference (an asset name) alongside or instead of narration.
- **Music** as a per-screen / per-scene bed (an optional asset name for the soundtrack that loops underneath), played on a separate audio channel from narration so voice ducks over the music. The player/controller layer owns the mixing (AVAudioSession + multiple players on Apple platforms).
- **Looping ambient SFX** (wind, distant battle) behaves like music — a bed that loops for a phase.

Keep new domain fields in the project's core/domain module and add tests. Pick ONE slice per run: generating the assets is one task; wiring a new domain field + player channel is another. Leave the rest in `BACKLOG.md`/`NEXT.md`.

## A sensible one-run slice

If this is the first audio Meeseeks, a good single task is: ensure the tool exists, pick the voices, write `voices.json`, build a manifest for one batch of the project's narration cues (pull the exact text from the project's source), generate them into the project's audio asset dir, and play **one** generated file (`afplay <something>.mp3`) to sanity-check it's real audio. Wiring the assets into the narration model + player can be the next Meeseeks if you run out of room — leave it in `NEXT.md`.

Good follow-on single slices once narration exists: generate a **music bed** (`music`); generate a small **SFX set** (`sfx` → gunfire, whistle, a looping wind bed); then separately wire each into the domain + player.

## Verify before you commit

- Each generated audio file is non-trivial in size (a 422 error writes a tiny JSON-ish blob; the script already guards HTTP!=200, but eyeball `wc -c`).
- `afplay <file>` plays something audible (you can't *hear* it, but a clean exit + plausible size + correct duration via `afinfo <file>` is good signal). Record exactly what you could and couldn't verify in the JOURNAL.
- Generated audio + `voices.json` + any manifest get committed in your normal Meeseeks commit step.

## Caveats to carry forward (seed these into your goal's `CAVEATS.md` — `<GOAL_DIR>/CAVEATS.md` — if absent; a goal-agnostic one also belongs in `goals/main/CAVEATS.md`)

- Audio is BUILD-TIME via `Tools/AudioGen/elevenlabs.sh` (3 modes: `say`/`manifest` TTS, `sfx`, `music`); the app never calls ElevenLabs at runtime. Key is in `.env` (gitignored) — never print/commit it.
- `eleven_v3` = most expressive TTS model. SFX model = `eleven_text_to_sound_v2` (only model with seamless `loop`). Music model = `music_v1` (a newer `music_v2` may exist — check `models`/web).
- ElevenLabs spends credits per generation — don't regenerate assets that already exist; the `manifest` command skips existing files, and for `sfx`/`music` check the file exists before calling.
- Endpoints (all `xi-api-key` auth, all return raw audio bytes): TTS `POST /v1/text-to-speech/{voice_id}` body `{text, model_id, voice_settings}`; SFX `POST /v1/sound-generation` body `{text, duration_seconds, loop, prompt_influence, model_id}` (duration 0.5–30); Music `POST /v1/music` body `{prompt, music_length_ms, model_id}` (length 3000–600000ms).
- Your key needs each endpoint enabled (Text to Speech / Sound Effects / Music Generation). A 401 on one capability while others work = that endpoint isn't granted on the key — record it and tell the user.
- SFX & music are usually NEW asset types — model them separately from the narration cue type, keep them in the project's core/domain module, and mix on a separate audio channel so narration ducks over the bed.
