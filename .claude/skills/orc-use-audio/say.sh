#!/usr/bin/env bash
# orc-use-audio: synthesise text to speech with the local mlx-audio (Kokoro)
# model and play it back. This is the script the /orc-use-audio skill shells
# out to so an agent can *speak* a line to the user instead of printing it.
#
# Playback is STREAMING: mlx-audio yields audio in ~2s segments and plays each
# as it's produced (via sounddevice), so the user hears the first sentence
# while later sentences are still being generated — low time-to-first-sound,
# no temp file. The model still reads the *input* text all at once (it can't be
# fed a growing prompt token-by-token); streaming is on the audio-output side.
# Falls back to file-synth + afplay if the streaming player is unavailable.
#
# Usage:
#   bash say.sh "the text to speak"
#   echo "the text to speak" | bash say.sh        # text via stdin
#
# Env overrides (all optional — defaults match docs/narrator-mlx-audio-setup.md):
#   ORC_AUDIO_PYTHON    absolute path to the mlx-audio venv python
#   ORC_AUDIO_MODEL     HuggingFace repo id of the MLX TTS model
#   ORC_AUDIO_VOICE     voice preset name
#   ORC_AUDIO_SPEED     speech speed (float, default 1.0)
#   ORC_AUDIO_INTERVAL  streaming segment interval in seconds (default 2.0)
#   ORC_AUDIO_NOSTREAM  set to 1 to force the file + afplay path
#
# Exit codes: 0 ok · 2 no text · 3 python/model missing · 4 synth failed.
#
# Note (v1): this does NOT pause other audio during playback. Narration
# overlaps whatever is already playing. Ducking other apps needs a posted
# media-key HID event which a plain shell can't emit without Accessibility;
# the in-app Narrator (Sources/OrchestratorCore/Narrator.swift) does it from
# Swift. Revisit with a tiny compiled helper if ducking is wanted here.

set -euo pipefail

# --- resolve text (arg wins, else stdin) -----------------------------------
TEXT="${1:-}"
if [[ -z "${TEXT}" ]] && [[ ! -t 0 ]]; then
  TEXT="$(cat)"
fi
# collapse surrounding whitespace
TEXT="$(printf '%s' "${TEXT}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [[ -z "${TEXT}" ]]; then
  echo "orc-use-audio: no text to speak (pass as arg or via stdin)" >&2
  exit 2
fi

# --- resolve config (env override → documented default) --------------------
PYTHON="${ORC_AUDIO_PYTHON:-$HOME/git/dev/mlx-audio/.venv/bin/python}"
MODEL="${ORC_AUDIO_MODEL:-mlx-community/Kokoro-82M-bf16}"
VOICE="${ORC_AUDIO_VOICE:-af_heart}"
SPEED="${ORC_AUDIO_SPEED:-1.0}"
INTERVAL="${ORC_AUDIO_INTERVAL:-2.0}"

if [[ ! -x "${PYTHON}" ]]; then
  cat >&2 <<EOF
orc-use-audio: mlx-audio python not found at:
  ${PYTHON}

Install the local TTS backend first — see:
  docs/narrator-mlx-audio-setup.md

Or point ORC_AUDIO_PYTHON at an existing mlx-audio venv python.
EOF
  exit 3
fi

# --- streaming playback path (preferred) -----------------------------------
# --stream --play yields audio segments and plays each as it's produced. Needs
# sounddevice in the venv; if it's missing we fall through to the file path.
can_stream() {
  [[ "${ORC_AUDIO_NOSTREAM:-0}" != "1" ]] && \
    "${PYTHON}" -c "import sounddevice" >/dev/null 2>&1
}

if can_stream; then
  if "${PYTHON}" -m mlx_audio.tts.generate \
        --model "${MODEL}" \
        --text "${TEXT}" \
        --voice "${VOICE}" \
        --speed "${SPEED}" \
        --stream \
        --play \
        --streaming_interval "${INTERVAL}" >/dev/null 2>/tmp/orc-use-audio.err; then
    exit 0
  fi
  echo "orc-use-audio: streaming playback failed, falling back to file path:" >&2
  cat /tmp/orc-use-audio.err >&2
fi

# --- fallback: synth to a temp wav, then afplay (blocking) -----------------
OUTDIR="$(mktemp -d "${TMPDIR:-/tmp}/orc-use-audio.XXXXXX")"
trap 'rm -rf "${OUTDIR}"' EXIT
PREFIX="utt"

if ! "${PYTHON}" -m mlx_audio.tts.generate \
      --model "${MODEL}" \
      --text "${TEXT}" \
      --voice "${VOICE}" \
      --speed "${SPEED}" \
      --output_path "${OUTDIR}" \
      --file_prefix "${PREFIX}" \
      --audio_format wav >/dev/null 2>"${OUTDIR}/err.log"; then
  echo "orc-use-audio: synthesis failed:" >&2
  cat "${OUTDIR}/err.log" >&2
  exit 4
fi

WAV="${OUTDIR}/${PREFIX}_000.wav"
if [[ ! -f "${WAV}" ]]; then
  echo "orc-use-audio: expected output missing at ${WAV}" >&2
  cat "${OUTDIR}/err.log" >&2
  exit 4
fi

afplay "${WAV}"
