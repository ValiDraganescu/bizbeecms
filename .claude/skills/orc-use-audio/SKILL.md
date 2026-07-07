---
description: Speak text aloud to the user through the local mlx-audio (Kokoro) TTS model instead of printing it. Use on demand when the user asks you to "say", "read aloud", "speak", "tell me out loud", or otherwise wants a spoken reply rather than text — or when a hands-free / eyes-off moment makes voice the better channel.
argument-hint: [text to speak]
allowed-tools: Bash
---

# orc-use-audio — speak instead of print

This skill gives you a voice. It pipes text through the project's local
text-to-speech model (Kokoro-82M via [mlx-audio](https://github.com/Blaizzy/mlx-audio),
running natively on Apple Silicon's GPU) and plays the result back through the
Mac's speakers. Use it to **speak a line to the user instead of printing it**.

It is the same local model the in-app Narrator uses — but invoked on demand by
you, with no preselected app settings. Nothing is configured ahead of time; you
decide when to talk.

## How to speak

Run the bundled script, passing the text as a single argument:

```sh
bash ./say.sh "Your message here."
```

`$ARGUMENTS` holds whatever the user passed after `/orc-use-audio`. The typical
invocation is just:

```sh
bash ./say.sh "$ARGUMENTS"
```

The script is **blocking** — it returns only after the clip has finished
playing, so once the Bash call completes you know the user has heard it.

Playback **streams**: mlx-audio synthesises the passage in ~2-second segments
and plays each as it's produced, so the user hears the first sentence while
later sentences are still being generated. Time-to-first-sound is low, which
makes longer spoken replies feel responsive. (The model still reads the *input*
text in one shot — you can't feed it a growing prompt word-by-word — so compose
the full line, then call the script. Streaming is on the audio-output side.)

Text can also come via stdin if it's long or has awkward quoting:

```sh
printf '%s' "a longer passage…" | bash ./say.sh
```

> Path note: `./say.sh` is relative to this skill's directory
> (`.claude/skills/orc-use-audio/`). If your working directory is elsewhere,
> invoke it with the absolute path, e.g.
> `bash "$(git rev-parse --show-toplevel)/.claude/skills/orc-use-audio/say.sh" "text"`,
> or `cd` into the skill dir first.

## When to use it

- The user explicitly asks you to **say / speak / read aloud** something.
- The user is plausibly away from the screen and wants an audible signal
  (e.g. "tell me out loud when the build's done").
- A short status or summary is more useful spoken than printed.

When you speak, keep it **short and natural** — one or two sentences. This is a
spoken channel, not a transcript: don't read code, long lists, file paths, or
URLs aloud. Speak the *gist*; print the detail if the user also needs it.

You may both speak AND print when the user needs the words on screen too — call
the script, and include the text in your reply as well.

## Voice / model overrides

Defaults match the Orchestrator repo's `docs/narrator-mlx-audio-setup.md`
(model `mlx-community/Kokoro-82M-bf16`, voice `af_heart`). Override per-call via
environment variables — no config files:

```sh
ORC_AUDIO_VOICE=bm_george bash ./say.sh "A British male voice."
ORC_AUDIO_SPEED=1.15      bash ./say.sh "Slightly faster."
ORC_AUDIO_MODEL=mlx-community/Kokoro-82M-4bit bash ./say.sh "Smaller, faster model."
ORC_AUDIO_PYTHON=/path/to/other/mlx-audio/.venv/bin/python bash ./say.sh "Custom install."
ORC_AUDIO_INTERVAL=1.0    bash ./say.sh "Shorter streaming segments."
ORC_AUDIO_NOSTREAM=1      bash ./say.sh "Force the file + afplay path."
```

Voice prefixes: `af_*` American female, `am_*` American male, `bf_*` British
female, `bm_*` British male (full 54-voice list is in the mlx-audio README).

## Setup dependency

This skill needs a local mlx-audio install. If `say.sh` exits with a
"python not found" message, the backend isn't installed on this machine —
follow the Orchestrator repo's `docs/narrator-mlx-audio-setup.md` (clone mlx-audio, make the venv,
`pip install -e ".[tts]"`), then retry. First synthesis downloads ~325 MB of
Kokoro weights from HuggingFace; subsequent calls are ~2–3 s.

## What this skill does NOT do (v1)

- **It does not pause other audio.** Narration overlaps whatever is already
  playing (Spotify, YouTube, etc.). Ducking other apps requires posting a
  system media-key HID event, which a plain shell can't do without Accessibility
  permission; the in-app Narrator does it from Swift. If the user wants ducking
  here, that's a follow-up (a tiny compiled media-key helper shipped alongside
  this script).
- It is not speech *recognition* — it only speaks, it doesn't listen.
