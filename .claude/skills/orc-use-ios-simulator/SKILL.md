---
name: orc-use-ios-simulator
version: 1.5.0
description: Build, test, and automate iOS apps in the Simulator via accessibility-driven navigation (not pixel coordinates). 29 bundled scripts under scripts/ for semantic UI navigation, build automation, accessibility/localization audits, and simulator lifecycle management. Use when driving the iOS Simulator, running an iOS app, tapping/typing through iOS UI, or building/testing an Xcode project.
---

# iOS Simulator Skill

Build, test, and automate iOS applications using accessibility-driven navigation and structured data instead of pixel coordinates.

## Quick Start

```bash
# 1. Check environment
bash scripts/sim_health_check.sh

# 2. Launch app
python scripts/app_launcher.py --launch com.example.app

# 3. Map screen to see elements
python scripts/screen_mapper.py

# 4. Tap button
python scripts/navigator.py --find-text "Login" --tap

# 5. Enter text
python scripts/navigator.py --find-type TextField --enter-text "user@example.com"
```

All scripts support `--help` for detailed options and `--json` for machine-readable output.

## Navigation Strategy

**Always prefer the accessibility tree over screenshots for navigation.** The accessibility tree gives you element types, labels, frames, and tap targets — structured data that's cheaper and more reliable than image analysis.

Use this priority:
1. `screen_mapper.py` → structured element list (5-7 lines, ~10 tokens)
2. `navigator.py --find-text/--find-type/--find-id` → semantic interaction
3. Screenshots → only for visual verification, bug reports, or visual diff

Screenshots cost 1,600–6,300 tokens depending on size. The accessibility tree costs 10–50 tokens in default mode.

## 29 Production Scripts

### Build & Development (2 scripts)

1. **build_and_test.py** - Build Xcode projects, run tests, parse results with progressive disclosure
   - Build with live result streaming
   - Parse errors and warnings from xcresult bundles
   - Retrieve detailed build logs on demand
   - Options: `--project`, `--scheme`, `--clean`, `--test`, `--verbose`, `--json`

2. **log_monitor.py** - Real-time log monitoring with intelligent filtering
   - Stream logs or capture by duration
   - Filter by severity (error/warning/info/debug)
   - Deduplicate repeated messages
   - Options: `--app`, `--severity`, `--follow`, `--duration`, `--output`, `--json`

### Device State (2 scripts)

3. **appearance.py** - Control simulator appearance: dark mode, Dynamic Type size, and locale/region
   - Toggle light/dark theme via `xcrun simctl ui`
   - Set Dynamic Type size with friendly aliases (XS through AX5)
   - Write locale and region defaults; optional app restart via `--bundle-id`
   - RTL flagged automatically for ar/he/fa/ur/yi locales
   - Options: `--theme`, `--text-size`, `--locale`, `--region`, `--reset`, `--bundle-id`, `--udid`, `--json`, `--verbose`

4. **location.py** - Simulate GPS coordinates, named city presets, and GPX scenario playback
   - Fix a coordinate with `--lat`/`--lng` or pick a city with `--city`
   - Play a built-in scenario (City Run, Freeway Drive, etc.) via `--gpx <scenario>`
   - Animate multi-waypoint paths with configurable speed via `--waypoints` and `--speed`
   - Clear simulated location with `--clear`; list available scenarios with `--list-scenarios`
   - Options: `--lat`, `--lng`, `--city`, `--gpx`, `--waypoints`, `--speed`, `--clear`, `--list-scenarios`, `--udid`, `--json`, `--verbose`

### Navigation & Interaction (5 scripts)

5. **screen_mapper.py** - Analyze current screen and list interactive elements
   - Element type breakdown
   - Interactive button list
   - Text field status
   - Options: `--verbose`, `--hints`, `--json`

6. **navigator.py** - Find and interact with elements semantically
   - Find by text (fuzzy matching)
   - Find by element type
   - Find by accessibility ID
   - Enter text or tap elements
   - Options: `--find-text`, `--find-type`, `--find-id`, `--tap`, `--enter-text`, `--json`

7. **gesture.py** - Perform swipes, scrolls, pinches, and complex gestures
   - Directional swipes (up/down/left/right)
   - Multi-swipe scrolling
   - Pinch zoom
   - Long press
   - Pull to refresh
   - Options: `--swipe`, `--scroll`, `--pinch`, `--long-press`, `--refresh`, `--json`

8. **keyboard.py** - Text input and hardware button control
   - Type text (fast or slow)
   - Special keys (return, delete, tab, space, arrows)
   - Hardware buttons (home, lock, volume, screenshot)
   - Key combinations
   - Options: `--type`, `--key`, `--button`, `--slow`, `--clear`, `--dismiss`, `--json`

9. **app_launcher.py** - App lifecycle management
   - Launch apps by bundle ID
   - Terminate apps
   - Install/uninstall from .app bundles
   - Deep link navigation
   - List installed apps
   - Check app state
   - Options: `--launch`, `--terminate`, `--install`, `--uninstall`, `--open-url`, `--list`, `--state`, `--json`

### Testing & Analysis (9 scripts)

10. **accessibility_audit.py** - Check WCAG compliance on current screen
    - Critical issues (missing labels, empty buttons, no alt text)
    - Warnings (missing hints, small touch targets)
    - Info (missing IDs, deep nesting)
    - Options: `--verbose`, `--output`, `--json`

11. **visual_diff.py** - Compare two screenshots for visual changes
    - Pixel-by-pixel comparison
    - Threshold-based pass/fail
    - Generate diff images
    - Options: `--threshold`, `--output`, `--details`, `--json`

12. **test_recorder.py** - Automatically document test execution
    - Capture screenshots and accessibility trees per step
    - Generate markdown reports with timing data
    - Options: `--test-name`, `--output`, `--verbose`, `--json`

13. **app_state_capture.py** - Create comprehensive debugging snapshots
    - Screenshot, UI hierarchy, app logs, device info
    - Markdown summary for bug reports
    - Options: `--app-bundle-id`, `--output`, `--log-lines`, `--json`

14. **sim_health_check.sh** - Verify environment is properly configured
    - Check macOS, Xcode, simctl, IDB, Python
    - List available and booted simulators
    - Verify Python packages (Pillow)

15. **model_inspector.py** - Inspect Core Data and SwiftData models from project files
    - Parse .xcdatamodeld packages (entities, attributes, relationships)
    - Detect model versions and current active version
    - Best-effort SwiftData @Model class extraction
    - Raw source dump for any model on demand (`--raw ModelName`)
    - Options: `--project-path`, `--core-data-only`, `--swiftdata-only`, `--show-versions`, `--raw`, `--verbose`, `--json`

16. **container.py** - Inspect app sandbox: files, UserDefaults, and Core Data store paths
    - List data container files at configurable depth via `--ls`
    - Read files with auto-detected plist decoding via `--cat` (large files cached)
    - Dump UserDefaults as key=value or JSON via `--userdefaults`
    - Locate `.sqlite` / `.sqlite-wal` / `.sqlite-shm` stores via `--core-data-path`
    - Export full container snapshot via `--export`
    - Options: `--ls`, `--cat`, `--userdefaults`, `--core-data-path`, `--export`, `--udid`, `--json`, `--verbose`

17. **hang_watcher.py** (HangBuster) - Record + summarise os_log hang events with progressive disclosure
    - Session mode: `--start` → session ID; interact with the simulator; `--stop SID` → token-tight summary; `--get-details SID [--cluster N | --raw]` to drill
    - Raw capture mode (`--start --raw-capture`) dumps every matching log line to a gzipped ndjson for `jq` exploration
    - Sessions auto-restart a dead log stream, TTL-prune, and cap total disk; `--diff A B` gives a cross-session regression report
    - Full modes, filters, env-var tuning, storage layout, and jq recipes: [`HANGBUSTER.md`](./HANGBUSTER.md)

18. **localization_audit.py** - Detect string catalog gaps, missing keys, and placeholder mismatches
    - Report missing and `needs_review`/`new` keys per locale in `.xcstrings` catalogs
    - Cross-reference catalog keys against Swift source (`String(localized:)` / `NSLocalizedString`) via `--source`
    - Flag placeholder count mismatches (`%d`, `%@`, `%s`, `%lld`) across locales
    - Legacy `.strings` and `.stringsdict` support via `plistlib`
    - CI-friendly `--strict` exits 2 on any finding
    - Options: `--catalog`, `--source`, `--locale`, `--strict`, `--json`, `--verbose`

### Advanced Testing & Permissions (4 scripts)

19. **clipboard.py** - Manage simulator clipboard for paste testing
    - Copy text to clipboard
    - Test paste flows without manual entry
    - Options: `--copy`, `--test-name`, `--expected`, `--json`

20. **status_bar.py** - Override simulator status bar appearance
    - Presets: clean (9:41, 100% battery), testing (11:11, 50%), low-battery (20%), airplane (offline)
    - Custom time, network, battery, WiFi settings
    - Options: `--preset`, `--time`, `--data-network`, `--battery-level`, `--clear`, `--json`

21. **push_notification.py** - Send simulated push notifications
    - Simple mode (title + body + badge)
    - Custom JSON payloads
    - Test notification handling and deep links
    - Options: `--bundle-id`, `--title`, `--body`, `--badge`, `--payload`, `--json`

22. **privacy_manager.py** - Grant, revoke, and reset app permissions
    - 13 supported services (camera, microphone, location, contacts, photos, calendar, health, etc.)
    - Batch operations (comma-separated services)
    - Audit trail with test scenario tracking
    - Options: `--bundle-id`, `--grant`, `--revoke`, `--reset`, `--list`, `--json`

### Simulator Discovery (2 scripts)

23. **sim_list.py** - List simulators with progressive disclosure
    - Concise summary by default (total / available / booted)
    - Full details on demand via cache IDs
    - Filter by device type
    - Suggest recommended simulators with `--suggest`
    - 96% token reduction vs raw `simctl list` (57k → 2k tokens)
    - Options: `--get-details`, `--suggest`, `--device-type`, `--json`

24. **simulator_selector.py** - Suggest the best simulator for the job
    - Ranks candidates by recent use (from `config.json`), latest iOS, common test models, and boot status
    - List all available simulators with `--list`
    - Boot a selected simulator directly with `--boot`
    - JSON output for programmatic use
    - Options: `--suggest`, `--list`, `--boot`, `--json`

### Device Lifecycle Management (5 scripts)

25. **simctl_boot.py** - Boot simulators with optional readiness verification
    - Boot by UDID or device name
    - Wait for device ready with timeout
    - Batch boot operations (--all, --type)
    - Performance timing
    - Options: `--udid`, `--name`, `--wait-ready`, `--timeout`, `--all`, `--type`, `--json`

26. **simctl_shutdown.py** - Gracefully shutdown simulators
    - Shutdown by UDID or device name
    - Optional verification of shutdown completion
    - Batch shutdown operations
    - Options: `--udid`, `--name`, `--verify`, `--timeout`, `--all`, `--type`, `--json`

27. **simctl_create.py** - Create simulators dynamically
    - Create by device type and iOS version
    - List available device types and runtimes
    - Custom device naming
    - Returns UDID for CI/CD integration
    - Options: `--device`, `--runtime`, `--name`, `--list-devices`, `--list-runtimes`, `--json`

28. **simctl_delete.py** - Permanently delete simulators
    - Delete by UDID or device name
    - Safety confirmation by default (skip with --yes)
    - Batch delete operations
    - Smart deletion (--old N to keep N per device type)
    - Options: `--udid`, `--name`, `--yes`, `--all`, `--type`, `--old`, `--json`

29. **simctl_erase.py** - Factory reset simulators without deletion
    - Preserve device UUID (faster than delete+create)
    - Erase all, by type, or booted simulators
    - Optional verification
    - Options: `--udid`, `--name`, `--verify`, `--timeout`, `--all`, `--type`, `--booted`, `--json`

## Common Patterns

**Auto-UDID Detection**: Most scripts auto-detect the booted simulator if --udid is not provided.

**Device Name Resolution**: Use device names (e.g., "iPhone 16 Pro") instead of UDIDs - scripts resolve automatically.

**Batch Operations**: Many scripts support `--all` for all simulators or `--type iPhone` for device type filtering.

**Output Formats**: Default is concise human-readable output. Use `--json` for machine-readable output in CI/CD.

**Help**: All scripts support `--help` for detailed options and examples.

**Screenshot Sizing**: Screenshots are resized to save tokens. Presets: `full` (3-4 tiles, ~5K tokens), `half` (1 tile, ~1.6K tokens, default), `quarter` (1 tile, ~800 tokens, less detail). Use `quarter` for quick visual checks, `half` for readable UI, `full` only when pixel-level detail matters. Scripts that capture screenshots (`app_state_capture.py`, `test_recorder.py`) default to `half`.

## Typical Workflow

1. Verify environment: `bash scripts/sim_health_check.sh`
2. Launch app: `python scripts/app_launcher.py --launch com.example.app`
3. Analyze screen: `python scripts/screen_mapper.py`
4. Interact: `python scripts/navigator.py --find-text "Button" --tap`
5. Verify: `python scripts/accessibility_audit.py`
6. Debug if needed: `python scripts/app_state_capture.py --app-bundle-id com.example.app`

## Configuration

Most operational limits tune via `IOS_SIM_*` environment variables — defaults suit typical local development; raise them for slow CI runners, large monorepo builds, or complex screens. The full variable table lives in [`CONFIG.md`](./CONFIG.md). Example:

```bash
# Slow GitHub Actions runner: give boot 10 minutes
IOS_SIM_BOOT_TIMEOUT=600 python scripts/simctl_boot.py --wait-ready
```

## Requirements

- macOS 12+
- Xcode Command Line Tools
- Python 3
- IDB (optional, for interactive features)

## Documentation

- **SKILL.md** (this file) - script reference and quick start
- **HANGBUSTER.md** - deep reference for the hang recorder
- **CONFIG.md** - environment-variable tuning table
- **scripts/** - the 29 scripts themselves; every one answers `--help` with detailed options and examples

## Key Design Principles

**Semantic Navigation**: Find elements by meaning (text, type, ID) not pixel coordinates. Survives UI changes.

**Token Efficiency**: Concise default output (3-5 lines) with optional verbose and JSON modes for detailed results.

**Accessibility-First**: Built on standard accessibility APIs for reliability and compatibility.

**Zero Configuration**: Works immediately on any macOS with Xcode. No setup required.

**Structured Data**: Scripts output JSON or formatted text, not raw logs. Easy to parse and integrate.

**Auto-Learning**: Build system remembers your device preference. Configuration stored per-project.

---

Use these scripts directly or let Claude Code invoke them automatically when your request matches the skill description.
