import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseOpenrouterMinting } from "./openrouter-minting.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("EN/FI/ET each carry every new sites.form minting string", () => {
  const keys = [
    "openrouterMinting",
    "openrouterMintingToggle",
    "openrouterMintingHint",
    "openrouterMonthlyLimit",
    "openrouterMonthlyLimitPlaceholder",
    "openrouterMonthlyLimitHint",
    "openrouterKeyDelete",
    "openrouterKeyMinted",
  ];
  for (const locale of ["en", "fi", "et"]) {
    const m = JSON.parse(
      readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
    );
    for (const k of keys) {
      assert.equal(
        typeof m.sites.form[k],
        "string",
        `${locale}: missing sites.form.${k}`,
      );
      assert.ok(m.sites.form[k].length > 0, `${locale}: empty sites.form.${k}`);
    }
  }
});

test("the paste-field strings are gone (replaced by minting controls)", () => {
  for (const locale of ["en", "fi", "et"]) {
    const m = JSON.parse(
      readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
    );
    // The old write-only paste UI keys must no longer exist.
    assert.equal(m.sites.form.openrouterKey, undefined, `${locale}: stale key`);
    assert.equal(m.sites.form.openrouterKeyClear, undefined, `${locale}: stale`);
  }
});

// Minting controls contract (the key value is NEVER user-entered now):
//   openrouterMintingEnabled (boolean toggle) + openrouterMonthlyLimitUsd
//   (whole-USD cap, null = no cap).

test("the toggle is === true only — truthy values do NOT enable", () => {
  assert.equal(
    parseOpenrouterMinting({ openrouterMintingEnabled: true })
      .openrouterMintingEnabled,
    true,
  );
  for (const v of ["true", 1, {}, "yes", undefined]) {
    assert.equal(
      parseOpenrouterMinting({ openrouterMintingEnabled: v })
        .openrouterMintingEnabled,
      false,
      `value ${JSON.stringify(v)}`,
    );
  }
});

test("a valid non-negative limit is floored to whole USD", () => {
  assert.equal(
    parseOpenrouterMinting({ openrouterMonthlyLimitUsd: 50 })
      .openrouterMonthlyLimitUsd,
    50,
  );
  assert.equal(
    parseOpenrouterMinting({ openrouterMonthlyLimitUsd: "50" })
      .openrouterMonthlyLimitUsd,
    50,
  );
  assert.equal(
    parseOpenrouterMinting({ openrouterMonthlyLimitUsd: 12.9 })
      .openrouterMonthlyLimitUsd,
    12,
  );
  assert.equal(
    parseOpenrouterMinting({ openrouterMonthlyLimitUsd: 0 })
      .openrouterMonthlyLimitUsd,
    0,
  );
});

test("blank / absent / invalid / negative limit → null (no cap)", () => {
  for (const v of ["", "  ", undefined, null, "abc", NaN, -5]) {
    assert.equal(
      parseOpenrouterMinting({ openrouterMonthlyLimitUsd: v })
        .openrouterMonthlyLimitUsd,
      null,
      `value ${JSON.stringify(v)}`,
    );
  }
});

test("empty body → minting off, no cap", () => {
  const op = parseOpenrouterMinting({});
  assert.equal(op.openrouterMintingEnabled, false);
  assert.equal(op.openrouterMonthlyLimitUsd, null);
});
