# hang_watcher.py (HangBuster) — deep reference

Full modes, filters, resilience, storage layout, and jq recipes for the hang recorder. The summary entry lives in [`SKILL.md`](./SKILL.md).

**hang_watcher.py** — record + summarise os_log hang events with progressive disclosure
    - **Session mode (HangBuster, agent-native):** start a detached recorder, interact with the simulator, stop for a token-tight summary
      - `--start` → returns a session ID; detached worker normalises + thresholds events on the fly
      - `--stop SESSION_ID` → emits ~80–120 token L1 summary (header + top-N clusters + drill hint)
      - `--get-details SESSION_ID [--cluster N | --raw]` → L2 full clusters or L3 per-event detail
      - `--list-sessions` / `--clear-sessions [--older-than 24h]` / `--diff A B` (cross-session regression report)
      - Filter pipeline: parse → normalise → threshold → bucket → cluster → aggregate → rank → format (in `common/hang_pipeline.py`)
      - `--budget-tokens N` picks the densest level (L0/L1/L2) that fits; `--terse` forces L0
      - `--auto-sample` captures a main-thread stack on first event per cluster (soft dependency: `main_thread_sampler.py` #62; graceful no-op if absent)
    - **Raw capture mode (full fidelity for `jq` exploration):** skip the clustering pipeline, dump every matching log line verbatim to `raw.ndjson`
      - `--start --raw-capture [--max-size-mb 10] [--no-gzip]` — spawns `log stream --style ndjson`
      - Per-session size cap (`--max-size-mb`, default 10) — worker stops cleanly on cap; `extras.truncated=true`
      - `--stop` gzips `raw.ndjson` → `raw.ndjson.gz` (~15–19× compression; `--no-gzip` opts out)
      - `--get-details SESSION_ID` on a raw session prints the path with a `zcat | jq ...` hint
    - **Resilience (auto-restart on stream death):** EOF or subprocess death triggers a `stream_died` event then a bounded restart with 2s backoff. After `IOS_SIM_HANG_MAX_RESTARTS` (default 3) the session is marked `crashed`, never left in stale `running` state. `--list-sessions` shows `capture=Xs` and `restarts=N`.
    - **Cleanup is automatic:** TTL prune (`IOS_SIM_HANG_SESSION_TTL_HOURS`, default 24h) + aggregate cap (`IOS_SIM_HANG_TOTAL_CAP_MB`, default 100 MB, oldest-first eviction) both run on every `--start`.
    - **Legacy modes (unchanged for backward compat):** `--watch [--duration N]` (live stream) and `--since 5m` (historical)
    - Filters: `--bundle-id` (post-parse — hang capture stays simulator-global so RunningBoard/SpringBoard events are kept), `--predicate` (also via `IOS_SIM_HANG_PREDICATE`)
    - All output supports `--json`; session storage at `~/.ios-simulator-skill/sessions/<id>/{meta.json,events.jsonl,summary.json,raw.ndjson.gz}`

    **Quick start (summarised mode):**
    ```bash
    SID=$(python scripts/hang_watcher.py --start --min-hang-ms 200)
    # ... interact with the simulator (open sheets, scroll, navigate) ...
    python scripts/hang_watcher.py --stop $SID                  # token-tight L1 summary
    python scripts/hang_watcher.py --get-details $SID --cluster 1  # drill into cluster 1
    python scripts/hang_watcher.py --diff $SID_BASELINE $SID    # cross-session regression
    ```

    **Quick start (raw capture + `jq` exploration):**
    ```bash
    SID=$(python scripts/hang_watcher.py --start --raw-capture --max-size-mb 5)
    # ... interact with the simulator ...
    python scripts/hang_watcher.py --stop $SID
    # → "Session ...: raw mode, 737 lines, 0.96 MB → 0.05 MB gzipped"

    # Top processes by event count:
    zcat ~/.ios-simulator-skill/sessions/$SID/raw.ndjson.gz \
      | jq -s 'group_by(.processImagePath) | map({proc: (.[0].processImagePath | split("/") | last), n: length}) | sort_by(-.n) | .[:5]'

    # All RunningBoard assertion invalidations:
    zcat .../raw.ndjson.gz | jq -c 'select(.subsystem == "com.apple.runningboard" and (.eventMessage | startswith("Invalidating")))'

    # Hangs per minute:
    zcat .../raw.ndjson.gz | jq -r '.timestamp[:16]' | sort | uniq -c
    ```
