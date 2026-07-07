import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The regenerate route returns these STABLE codes (regenerateOgImageForPage +
// the route's badLocale). Every one MUST have a localized message key in ALL
// three locale files, or the SEO tab shows a blank/throwing error. This guards
// the OG_ERR_KEY map in seo-form.tsx against a code with no message.
const SERVER_CODES = ["manualWins", "noUrl", "noBinding", "noOrigin", "error", "badLocale"];
const KEY_BY_CODE = {
  manualWins: "ogErrManualWins",
  noUrl: "ogErrNoUrl",
  noBinding: "ogErrNoBinding",
  noOrigin: "ogErrNoOrigin",
  error: "ogErrError",
  badLocale: "ogErrError",
};
const UI_KEYS = [
  "ogAutoTitle",
  "ogAutoHint",
  "ogSourceManual",
  "ogSourceAuto",
  "ogSourceNone",
  "ogRegenerate",
  "ogRegenerating",
  "ogRegenerated",
  ...Object.values(KEY_BY_CODE),
];

for (const loc of ["en", "fi", "et"]) {
  test(`every OG-regenerate error code has a ${loc} message`, () => {
    const pb = JSON.parse(readFileSync(new URL(`../messages/${loc}.json`, import.meta.url))).pageBuilder;
    for (const code of SERVER_CODES) {
      const key = KEY_BY_CODE[code];
      assert.ok(key, `no UI key mapped for code ${code}`);
      assert.equal(typeof pb[key], "string", `missing ${loc} pageBuilder.${key}`);
      assert.ok(pb[key].length > 0, `empty ${loc} pageBuilder.${key}`);
    }
  });

  test(`all OG-autogen UI keys present in ${loc}`, () => {
    const pb = JSON.parse(readFileSync(new URL(`../messages/${loc}.json`, import.meta.url))).pageBuilder;
    for (const key of new Set(UI_KEYS)) {
      assert.equal(typeof pb[key], "string", `missing ${loc} pageBuilder.${key}`);
    }
  });
}
