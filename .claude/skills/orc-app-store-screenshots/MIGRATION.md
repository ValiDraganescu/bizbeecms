# Migration path — upgrading an older screenshots project

The goal is an in-place UI/template upgrade, not a redesign. Preserve the user's existing app name, copy, screenshot paths, app icon, uploaded assets, locales, and device decks wherever they already exist. Replace the old UI implementation with the current template. Keep legacy decks in isolated export mode unless the project already explicitly opted into connected canvas.

Migration rules:

1. **Do not ask further product/design questions.** The user already has a project. Infer from existing files and report any non-blocking gaps at the end.
2. **Never delete user assets.** Preserve `public/screenshots/`, `public/app-icon.png`, uploaded screenshots, and any existing `app-store-screenshots.json`.
3. **Preserve recoverability.** If the worktree is not clean, do not revert unrelated changes. Before overwriting template files, copy replaced project-state/assets/code snapshots to a temporary backup outside the repo (for example `/tmp/app-store-screenshots-migration-<timestamp>/`) and mention the path in the final response.
4. **Prefer structured migration.** Read and write `app-store-screenshots.json` with JSON tooling. Do not regex-edit JSON.
5. **Set `schemaVersion: 2` and keep legacy `connectedCanvas` safe.** If the existing project already has an explicit boolean `connectedCanvas`, preserve it. If the project is pre-v2 or lacks the flag, write `"connectedCanvas": false` so offscreen/clipped legacy mockups do not leak into neighboring exports. New projects still default to connected canvas.
6. **Keep screenshots pointed at existing files.** Do not rename screenshot files unless the old project already depended on numeric names and the migration needs them. Existing static paths are fine.
7. **Handle custom themes without asking.** If the old project references a custom `themeId`, merge the matching theme object into the new `src/lib/constants.ts` when it can be found. If it cannot be recovered, leave the `themeId` in project JSON; the editor will fall back to `clean-light` and warn, and you should note that a custom theme needs manual restoration.
8. **Merge package metadata when possible.** The template's dependencies and scripts must win for the screenshot editor, but preserve unrelated existing `dependencies`, `devDependencies`, and useful scripts unless they directly conflict.
9. **Do not import template sample decks into real migrations.** If the old project already has decks or screenshots, use the template for UI/code only. Keep template sample screenshots/decks out of the migrated project so the user's app does not inherit unrelated example content.
10. **Use a disposable copy for dogfooding.** If the user asks to test or review the migration instead of actually migrating their project, copy the app to a temp directory or worktree and run the migration there. Only touch the real checkout when the user explicitly asks for the real migration and answers **Yes**.

Recommended migration sequence:

```bash
# 1. Snapshot useful old files outside the repo.
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/app-store-screenshots-migration-$STAMP"
mkdir -p "$BACKUP_DIR"
cp -R app-store-screenshots.json public src package.json tailwind.config.ts next.config.mjs "$BACKUP_DIR/" 2>/dev/null || true

# 2. Preserve project state and assets that must survive template copy.
PRESERVE_DIR="$BACKUP_DIR/preserve"
mkdir -p "$PRESERVE_DIR"
cp app-store-screenshots.json "$PRESERVE_DIR/" 2>/dev/null || true
cp -R public/screenshots "$PRESERVE_DIR/screenshots" 2>/dev/null || true
cp public/app-icon.png "$PRESERVE_DIR/app-icon.png" 2>/dev/null || true

# 3. Copy the current template over the old UI implementation.
cp -R "<SKILL_DIR>/template/." "$PWD/"
cp app-store-screenshots.json "$BACKUP_DIR/template-app-store-screenshots.json" 2>/dev/null || true

# 4. Restore preserved user state/assets over template samples.
cp "$PRESERVE_DIR/app-store-screenshots.json" app-store-screenshots.json 2>/dev/null || true
mkdir -p public
if [ -d "$PRESERVE_DIR/screenshots" ]; then
  mkdir -p "$BACKUP_DIR/template-samples/public"
  mv public/screenshots "$BACKUP_DIR/template-samples/public/screenshots" 2>/dev/null || true
  cp -R "$PRESERVE_DIR/screenshots" public/screenshots
else
  mkdir -p public/screenshots
fi
cp "$PRESERVE_DIR/app-icon.png" public/app-icon.png 2>/dev/null || true
```

After copying, upgrade or create `app-store-screenshots.json`. If an existing project file exists, coerce it in place. If no project file exists but old slide data is embedded in `src/lib/defaults.ts` or `src/app/page.tsx`, extract it best-effort into the template's project JSON before falling back to starter slides. Prefer old arrays or objects named `slides`, `screens`, `features`, `defaultSlides`, `appName`, `tagline`, `theme`, and screenshot paths. If the old implementation only has image files, sort `public/screenshots/**` by path and seed slides from those files.

Use a small JSON script like this for the final project-state coercion:

```bash
BACKUP_DIR="$BACKUP_DIR" node <<'NODE'
const fs = require("fs");
const path = require("path");

const PROJECT_FILE = "app-store-screenshots.json";
const DEFAULT_LOCALE = "en";
const DEVICE_KEYS = ["iphone", "ipad", "android", "android-7", "android-10", "feature-graphic"];
const LAYOUTS = ["hero", "device-bottom", "device-top", "two-devices", "no-device", "split-landscape", "feature-graphic"];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const templateState =
  readJson(path.join(process.env.BACKUP_DIR || "", "template-app-store-screenshots.json")) ||
  readJson(PROJECT_FILE) ||
  {};
const existingState = readJson(PROJECT_FILE) || {};
const hasExplicitConnectedCanvas = typeof existingState.connectedCanvas === "boolean";
const existingDecks =
  existingState.slidesByDevice && typeof existingState.slidesByDevice === "object"
    ? existingState.slidesByDevice
    : {};
const hasExistingDecks = Object.keys(existingDecks).length > 0;
const state = {
  ...templateState,
  ...existingState,
  slidesByDevice: hasExistingDecks ? existingDecks : templateState.slidesByDevice || {},
};

const legacySlides =
  Array.isArray(existingState.slides) ? existingState.slides :
  Array.isArray(existingState.screens) ? existingState.screens :
  Array.isArray(existingState.features) ? existingState.features :
  null;

if (legacySlides && !hasExistingDecks) {
  state.slidesByDevice = {
    iphone: legacySlides,
  };
}

function localized(value) {
  if (typeof value === "string") return { [DEFAULT_LOCALE]: value };
  if (value && typeof value === "object") return value;
  return {};
}

function cleanTransform(value) {
  if (!value || typeof value !== "object") return undefined;
  const { x, y, width, height, rotation, zIndex } = value;
  if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  return {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
    ...(typeof rotation === "number" && Number.isFinite(rotation) ? { rotation } : {}),
    ...(typeof zIndex === "number" && Number.isFinite(zIndex) ? { zIndex } : {}),
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string") || "";
}

function migrateSlide(slide) {
  if (!slide || typeof slide !== "object") return null;
  const transforms = {};
  const rawTransforms = slide.transforms && typeof slide.transforms === "object" ? slide.transforms : {};
  for (const [id, transform] of Object.entries(rawTransforms)) {
    const cleaned = cleanTransform(transform);
    if (cleaned) transforms[id] = cleaned;
  }
  const textElements = Array.isArray(slide.textElements)
    ? slide.textElements
        .map((element) => {
          const transform = cleanTransform(element.transform);
          if (!element || typeof element.id !== "string" || !transform) return null;
          return {
            ...element,
            text: localized(element.text),
            transform,
          };
        })
        .filter(Boolean)
    : undefined;

  return {
    ...slide,
    id: typeof slide.id === "string" ? slide.id : `migrated-${Math.random().toString(36).slice(2, 10)}`,
    layout: LAYOUTS.includes(slide.layout) ? slide.layout : "device-bottom",
    label: localized(slide.label),
    headline: localized(slide.headline || slide.title || slide.caption || slide.copy),
    screenshot: firstString(slide.screenshot, slide.image, slide.src, slide.path),
    ...(Object.keys(transforms).length ? { transforms } : { transforms: undefined }),
    ...(textElements && textElements.length ? { textElements } : { textElements: undefined }),
  };
}

state.schemaVersion = 2;
state.connectedCanvas = hasExplicitConnectedCanvas ? existingState.connectedCanvas : false;
state.locales = Array.isArray(state.locales) && state.locales.length ? state.locales : [DEFAULT_LOCALE];
state.locale = state.locales.includes(state.locale) ? state.locale : state.locales[0];
state.device = DEVICE_KEYS.includes(state.device) ? state.device : "iphone";

if (state.slidesByDevice && typeof state.slidesByDevice === "object") {
  for (const [device, slides] of Object.entries(state.slidesByDevice)) {
    if (!DEVICE_KEYS.includes(device)) continue;
    state.slidesByDevice[device] = Array.isArray(slides) ? slides.map(migrateSlide).filter(Boolean) : [];
  }
}

if (!state.slidesByDevice[state.device]) {
  const firstDeviceWithSlides = DEVICE_KEYS.find((device) => state.slidesByDevice[device]?.length);
  if (firstDeviceWithSlides) state.device = firstDeviceWithSlides;
}

fs.writeFileSync(PROJECT_FILE, JSON.stringify(state, null, 2) + "\n");
NODE
```

If `package.json` existed before the template copy, merge it after the project-state coercion instead of leaving a blind overwrite. Keep the template's `dev`, `build`, and `start` scripts and all editor dependencies, then add any old non-conflicting scripts and dependencies from the backed-up `package.json`.

```bash
BACKUP_DIR="$BACKUP_DIR" node <<'NODE'
const fs = require("fs");
const path = require("path");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const oldPkg = readJson(path.join(process.env.BACKUP_DIR || "", "package.json"));
const templatePkg = readJson("package.json");

if (oldPkg && templatePkg) {
  const merged = {
    ...oldPkg,
    ...templatePkg,
    scripts: {
      ...(oldPkg.scripts || {}),
      ...(templatePkg.scripts || {}),
    },
    dependencies: {
      ...(oldPkg.dependencies || {}),
      ...(templatePkg.dependencies || {}),
    },
    devDependencies: {
      ...(oldPkg.devDependencies || {}),
      ...(templatePkg.devDependencies || {}),
    },
  };

  fs.writeFileSync("package.json", JSON.stringify(merged, null, 2) + "\n");
}
NODE
```

Then install/update dependencies and verify:

```bash
bun install      # or pnpm install / yarn / npm install
set -o pipefail
bun run build 2>&1 | tee "$BACKUP_DIR/build.log"    # or the detected package-manager equivalent
```

Start the dev server and verify in the browser:

- The toolbar shows **Isolated** for migrated pre-v2 decks, unless the project file already explicitly had `"connectedCanvas": true`.
- Existing screens, copy, screenshot paths, and app icon are present.
- Referenced screenshot files exist for every configured locale, or the final report lists the missing paths.
- Device decks retained from the old project do not silently become template placeholders. If a retained deck has empty screenshots or lacks active-locale copy, report it as a follow-up instead of removing it.
- A bundle export succeeds for the active device.
- `app-store-screenshots.json` contains `"schemaVersion": 2` and a boolean `"connectedCanvas"` value.
