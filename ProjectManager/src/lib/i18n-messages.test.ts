import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Message-catalog parity. The PM admin UI ships EN/FI/ET and next-intl throws at
 * render time on a missing key — a locale that lags behind is a 500 on a page
 * nobody tested in that language. One structural check over the whole catalog
 * beats a per-feature "does my new namespace exist in all three" assertion.
 *
 * EN is the reference: every EN leaf must exist in every other locale, and no
 * locale may carry a key EN dropped (that's a dead string).
 */
const messagesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../messages",
);

const LOCALES = ["en", "fi", "et"] as const;

type Catalog = { [k: string]: string | Catalog };

function load(locale: string): Catalog {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
}

/** Dotted paths of every leaf (string) in the catalog. */
function leafPaths(node: Catalog, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? leafPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

test("every locale has exactly the keys EN has", () => {
  const reference = new Set(leafPaths(load("en")));
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    const actual = new Set(leafPaths(load(locale)));
    assert.deepEqual(
      [...reference].filter((k) => !actual.has(k)),
      [],
      `${locale}: missing keys`,
    );
    assert.deepEqual(
      [...actual].filter((k) => !reference.has(k)),
      [],
      `${locale}: keys not in EN`,
    );
  }
});

test("no locale ships a blank string", () => {
  for (const locale of LOCALES) {
    const catalog = load(locale);
    for (const path of leafPaths(catalog)) {
      const value = path
        .split(".")
        .reduce<string | Catalog>((node, key) => (node as Catalog)[key], catalog);
      assert.equal(typeof value, "string", `${locale}: ${path} is not a string`);
      assert.notEqual((value as string).trim(), "", `${locale}: ${path} is blank`);
    }
  }
});
