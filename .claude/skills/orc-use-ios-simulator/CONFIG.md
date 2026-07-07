# Configuration — environment variables

Most operational limits can be tuned via environment variables. Defaults work for typical local development; raise them for slow CI runners, large monorepo builds, or accessibility audits on complex screens.

| Variable | Default | Controls |
|---|---|---|
| `IOS_SIM_A11Y_LABEL_MAX` | `80` | Max chars of `AXLabel` retained in accessibility audit output |
| `IOS_SIM_A11Y_TOP_ISSUES` | `10` | Top accessibility issues surfaced per audit |
| `IOS_SIM_APPS_PREVIEW` | `30` | App entries listed by `app_launcher.py` before truncation |
| `IOS_SIM_BOOT_SUBPROCESS_TIMEOUT` | `60` | Timeout for the `simctl boot` subprocess itself (seconds) |
| `IOS_SIM_BOOT_TIMEOUT` | `300` | Wait-for-ready timeout after boot (seconds) |
| `IOS_SIM_BUILD_JSON_CAP` | `50` | Max build errors / failed tests in JSON output |
| `IOS_SIM_BUILD_LOG_PREVIEW` | `4000` | Chars of build log preview in default output |
| `IOS_SIM_BUILD_TIMEOUT` | `1800` | Max seconds for an `xcodebuild build` invocation before kill |
| `IOS_SIM_INTROSPECT_TIMEOUT` | `60` | Timeout for `xcodebuild -list` and `simctl list` lookups (seconds) |
| `IOS_SIM_TEST_TIMEOUT` | `2700` | Max seconds for an `xcodebuild test` invocation before kill |
| `IOS_SIM_BUILD_SUMMARY_CAP` | `15` | Errors/failures in default build summary |
| `IOS_SIM_BUILD_VERBOSE_CAP` | `100` | Errors/warnings in verbose build output |
| `IOS_SIM_CACHE_MAX_ENTRIES` | `500` | Max entries in progressive disclosure cache (LRU eviction) |
| `IOS_SIM_CACHE_TTL_HOURS` | `1` | Cache entry expiration |
| `IOS_SIM_ERASE_TIMEOUT` | `90` | Wait-for-erase timeout (seconds) |
| `IOS_SIM_HANG_PREDICATE` | _(default)_ | Override the `os_log` predicate used by `hang_watcher.py` (default catches RunningBoard kills + "Hang detected" + main-thread hangs). Hang events originate from system daemons (RunningBoard, SpringBoard) so the predicate stays simulator-global — `--bundle-id` is applied post-parse, not ANDed in. |
| `IOS_SIM_HANG_MIN_MS` | `250` | HangBuster threshold — events below this duration never reach disk (smaller = more sensitive, larger summaries) |
| `IOS_SIM_HANG_SESSION_TTL_HOURS` | `24` | HangBuster session prune age; pruning runs on every `--start` |
| `IOS_SIM_HANG_DEFAULT_TOP_N` | `3` | Default top-N clusters in `--stop` L1 output |
| `IOS_SIM_HANG_BUDGET_TOKENS` | _(unset)_ | Default token budget for `--stop` (picks L0/L1/L2 to fit) |
| `IOS_SIM_HANG_MAX_RESTARTS` | `3` | HangBuster worker: max `log stream` respawn attempts on EOF/subprocess death before the session is marked `crashed` |
| `IOS_SIM_HANG_TOTAL_CAP_MB` | `100` | HangBuster aggregate disk cap. When total session-state exceeds this on `--start`, oldest sessions are dropped first. Set to `0` to disable. |
| `IOS_SIM_LOG_JSON_CAP` | `100` | Max errors/warnings in `log_monitor.py` JSON output |
| `IOS_SIM_LOG_LINE_MAX` | `300` | Per-line truncation in log summaries |
| `IOS_SIM_LOG_TAIL` | `200` | Lines of log tail in verbose / sample output |
| `IOS_SIM_LOG_TEXT_SUMMARY` | `15` | Errors/warnings shown in text-mode log summary |
| `IOS_SIM_MAX_ELEMENTS` | `25` | Tappable elements listed by `navigator.py` |
| `IOS_SIM_POLL_INTERVAL` | `0.5` | Boot/erase state polling interval (seconds) |
| `IOS_SIM_RELAUNCH_DELAY_MS` | `1000` | Delay between terminate and re-launch in `app_launcher.py` |
| `IOS_SIM_SCREEN_BUTTONS_PREVIEW` | `15` | Button names listed by `screen_mapper.py` |
| `IOS_SIM_SCREEN_SECTION_ITEMS` | `10` | Items per section shown by `screen_mapper.py` |
| `IOS_SIM_STATE_SUBPROCESS_TIMEOUT` | `15` | Subprocess timeout in `app_state_capture.py` (seconds) |
| `IOS_SIM_TAP_SETTLE_MS` | `500` | Post-tap settle delay in `navigator.py` |

Example:

```bash
# Slow GitHub Actions runner: give boot 10 minutes
IOS_SIM_BOOT_TIMEOUT=600 python scripts/simctl_boot.py --wait-ready
```
