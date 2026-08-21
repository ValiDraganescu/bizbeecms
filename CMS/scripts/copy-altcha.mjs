/**
 * Copies the self-contained ALTCHA widget bundle (ES module, workers inlined)
 * from the npm package into `public/`, where published pages load it from
 * `/altcha.min.js` (see ALTCHA_WIDGET_SRC in src/lib/render/plan-form.ts).
 * Runs on `postinstall`, so both local dev and the deploy container get the
 * file before any build; `public/altcha.min.js` is gitignored on purpose —
 * the npm package version is the single source of truth.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "altcha", "dist", "main", "altcha.min.js");
const dest = join(root, "public", "altcha.min.js");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`copy-altcha: ${src} -> ${dest}`);
