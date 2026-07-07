/**
 * Regression fence: the (site) route group — published pages — must never
 * consume the admin-UI locale context (next-intl). The admin locale resolver
 * is NEXT_LOCALE cookie → Accept-Language, so any next-intl usage in the
 * published render path makes response bytes vary per visitor and poisons
 * edge-cached HTML with the FIRST visitor's browser language (the html[lang]
 * defect and the NextIntlClientProvider flight-payload leak were both this
 * class). Admin i18n lives in the (admin) route group's own root layout.
 *
 * Dep-free source scan (fs only) so it runs under plain `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ESM under node --test: no __dirname.
const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "(site)");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("(site) route group has its own root layout (published pages never share the admin intl layout)", () => {
  assert.ok(
    existsSync(join(SITE_DIR, "layout.tsx")),
    "src/app/(site)/layout.tsx is missing — published pages would fall back to " +
      "an admin next-intl root layout and re-open the Accept-Language cache poison",
  );
});

test("no file under src/app/(site) imports next-intl", () => {
  const files = sourceFiles(SITE_DIR);
  assert.ok(files.length >= 2, "expected at least layout.tsx + the [[...slug]] page");
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.ok(
      !/from\s+["']next-intl/.test(src),
      `${file} imports next-intl — published bytes must not vary with the ` +
        "visitor's admin locale (cookie/Accept-Language); use the URL content locale",
    );
  }
});
