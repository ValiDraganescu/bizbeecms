/**
 * ALTCHA form bot protection — pure parameter/helper logic. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  altchaCounter,
  altchaExpiresAt,
  altchaReplayKey,
  altchaSecrets,
  pickGuestMessage,
  ALTCHA_COUNTER_MIN,
  ALTCHA_COUNTER_MAX,
  ALTCHA_EXPIRY_MS,
  ALTCHA_MISSING_ERROR,
  ALTCHA_FAILED_ERROR,
} from "./altcha-core.ts";

test("altchaCounter keeps the work floor and ceiling for any roll", () => {
  assert.equal(altchaCounter(0), ALTCHA_COUNTER_MIN);
  assert.equal(altchaCounter(0.9999999), ALTCHA_COUNTER_MAX);
  // Out-of-range rolls (defensive) clamp instead of escaping the band.
  assert.equal(altchaCounter(-1), ALTCHA_COUNTER_MIN);
  assert.equal(altchaCounter(2), ALTCHA_COUNTER_MAX);
  const mid = altchaCounter(0.5);
  assert.ok(mid >= ALTCHA_COUNTER_MIN && mid <= ALTCHA_COUNTER_MAX);
});

test("altchaExpiresAt is now + the challenge lifetime", () => {
  const now = 1_700_000_000_000;
  assert.equal(altchaExpiresAt(now).getTime(), now + ALTCHA_EXPIRY_MS);
  // The replay guard rides the 15-min login_attempt window — a challenge must
  // expire before its used-marker row ages out.
  assert.ok(ALTCHA_EXPIRY_MS <= 15 * 60 * 1000);
});

test("altchaReplayKey namespaces challenge ids away from form:<ip> rate keys", () => {
  assert.equal(altchaReplayKey("abc123"), "altcha:abc123");
});

test("altchaSecrets derives distinct, deterministic signature/key secrets", () => {
  const a = altchaSecrets("kek-1");
  assert.notEqual(a.signature, a.key);
  assert.deepEqual(a, altchaSecrets("kek-1"));
  assert.notDeepEqual(a, altchaSecrets("kek-2"));
});

test("pickGuestMessage: active locale → site default → English, case-insensitive", () => {
  assert.equal(pickGuestMessage(ALTCHA_FAILED_ERROR, "fi", "en"), ALTCHA_FAILED_ERROR.fi);
  assert.equal(pickGuestMessage(ALTCHA_FAILED_ERROR, "FI", "en"), ALTCHA_FAILED_ERROR.fi);
  // Unshipped visitor locale → the Site's default.
  assert.equal(pickGuestMessage(ALTCHA_FAILED_ERROR, "sv", "et"), ALTCHA_FAILED_ERROR.et);
  // Unshipped default too → English.
  assert.equal(pickGuestMessage(ALTCHA_FAILED_ERROR, "sv", "de"), ALTCHA_FAILED_ERROR.en);
  // No cookie at all → default chain.
  assert.equal(pickGuestMessage(ALTCHA_MISSING_ERROR, "", "fi"), ALTCHA_MISSING_ERROR.fi);
});

test("every guest refusal ships the full translation coverage (en/fi/et)", () => {
  for (const dict of [ALTCHA_MISSING_ERROR, ALTCHA_FAILED_ERROR]) {
    for (const code of ["en", "fi", "et"]) {
      assert.equal(typeof dict[code], "string");
      assert.ok(dict[code].length > 0);
    }
  }
});
