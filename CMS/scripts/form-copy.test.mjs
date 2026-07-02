/**
 * Form slice (b) UI copy locks (external-data-sources):
 *  - `pageBuilder.form` + `pageBuilder.layoutForm` + the collections
 *    `publicSubmissions*` keys exist with EN/FI/ET parity (a missing locale key
 *    crashes next-intl at render).
 *  - No literal `{braces}` in the form panel copy: next-intl treats them as ICU
 *    arguments and throws at format time when unfilled (the goal's standing ICU
 *    caveat). Placeholder syntax is shown via input `placeholder=` attrs instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

test("pageBuilder.form / layoutForm / collections.publicSubmissions* have EN/FI/ET key parity", () => {
  const en = load("en");
  const enFormKeys = Object.keys(en.pageBuilder.form).sort();
  assert.ok(enFormKeys.length > 0, "en declares pageBuilder.form keys");
  for (const l of ["fi", "et"]) {
    const m = load(l);
    assert.deepEqual(
      Object.keys(m.pageBuilder.form).sort(),
      enFormKeys,
      `${l}: pageBuilder.form keys match en`,
    );
    assert.equal(typeof m.pageBuilder.layoutForm, "string", `${l}: layoutForm exists`);
    assert.equal(typeof m.collections.publicSubmissions, "string", `${l}: publicSubmissions exists`);
    assert.equal(
      typeof m.collections.publicSubmissionsHint,
      "string",
      `${l}: publicSubmissionsHint exists`,
    );
  }
});

test("form panel copy carries no literal ICU braces", () => {
  for (const l of ["en", "fi", "et"]) {
    const m = load(l);
    const strings = [
      m.pageBuilder.layoutForm,
      ...Object.values(m.pageBuilder.form),
      m.collections.publicSubmissions,
      m.collections.publicSubmissionsHint,
    ];
    for (const s of strings) {
      assert.ok(!/[{}]/.test(s), `${l}: literal brace in form copy: "${s}"`);
    }
  }
});
