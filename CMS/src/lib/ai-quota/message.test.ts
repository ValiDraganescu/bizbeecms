/**
 * The builtin guest quota refusal (pure): locale fallback chain + the
 * content-locale cookie read. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUOTA_REACHED,
  guestQuotaMessage,
  readContentLocaleCookie,
} from "./message.ts";

test("guestQuotaMessage speaks the visitor's content locale", () => {
  assert.match(guestQuotaMessage("fi", "en"), /kuukausittaisen/);
  assert.match(guestQuotaMessage("et", "en"), /igakuise/);
  assert.match(guestQuotaMessage("en", "en"), /monthly usage limit/);
});

test("guestQuotaMessage falls back to the Site default, then English", () => {
  // A content locale we ship no translation for → the Site's default locale…
  assert.equal(guestQuotaMessage("ro-ro", "fi"), guestQuotaMessage("fi", "fi"));
  // …and when that is unshipped too, English rather than a raw key.
  assert.equal(guestQuotaMessage("ro-ro", "sv"), guestQuotaMessage("en", "en"));
});

test("guestQuotaMessage matches locale codes case-insensitively", () => {
  assert.equal(guestQuotaMessage("FI", "en"), guestQuotaMessage("fi", "en"));
  assert.equal(guestQuotaMessage("zz", "ET"), guestQuotaMessage("et", "en"));
});

test("guestQuotaMessage is a visitor-readable sentence, never the admin key", () => {
  for (const locale of ["en", "fi", "et", "ro-ro"]) {
    const msg = guestQuotaMessage(locale, "en");
    assert.notEqual(msg, QUOTA_REACHED);
    assert.ok(msg.length > 20, `${locale}: ${msg}`);
  }
});

test("readContentLocaleCookie picks bb_content_locale out of a Cookie header", () => {
  assert.equal(
    readContentLocaleCookie("bizbee_session=abc; bb_content_locale=fi; other=1"),
    "fi",
  );
  assert.equal(readContentLocaleCookie("bb_content_locale=pt-br"), "pt-br");
  // Percent-encoded values round-trip (the switcher script encodeURIComponents).
  assert.equal(readContentLocaleCookie("bb_content_locale=zh%2Dhans"), "zh-hans");
});

test("readContentLocaleCookie returns '' when the cookie is absent or headerless", () => {
  assert.equal(readContentLocaleCookie(null), "");
  assert.equal(readContentLocaleCookie(""), "");
  assert.equal(readContentLocaleCookie("bizbee_session=abc"), "");
  // A name that merely CONTAINS the cookie name must not match.
  assert.equal(readContentLocaleCookie("xbb_content_locale=fi"), "");
});
