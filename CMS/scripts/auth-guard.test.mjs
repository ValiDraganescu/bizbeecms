/**
 * Dep-free unit tests for the CMS admin-auth guard pure core (Sec1).
 * Run: node --test scripts/auth-guard.test.mjs
 *
 * Only the PURE decision logic is testable offline; the cross-Worker fetch +
 * env wiring (guard.ts) needs a live deploy → HITL P1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isGuardConfigured,
  cmsValidateUrl,
  readSessionCookie,
  decideFromValidate,
} from "../src/lib/auth/guard-core.ts";

const here = dirname(fileURLToPath(import.meta.url));
const load = (l) => JSON.parse(readFileSync(join(here, "..", "messages", `${l}.json`), "utf8"));
function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

// ── adminAuth i18n parity (the forbidden-state strings) ─────────────────────
test("adminAuth namespace exists with identical non-empty keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.adminAuth, `${l}.json missing adminAuth namespace`);
  }
  const en = keys(cats.en.adminAuth).sort();
  assert.ok(en.length > 0);
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].adminAuth).sort(), en, `${l} adminAuth keys differ`);
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.adminAuth)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.adminAuth);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});

// ── config gate (fail-closed when unconfigured) ─────────────────────────────
test("isGuardConfigured: all three present → true", () => {
  assert.equal(
    isGuardConfigured({ pmOrigin: "https://pm", authSecret: "s", siteId: "id" }),
    true,
  );
});

test("isGuardConfigured: any missing/empty → false (deny)", () => {
  for (const cfg of [
    {},
    { pmOrigin: "https://pm" },
    { pmOrigin: "https://pm", authSecret: "s" },
    { pmOrigin: "", authSecret: "s", siteId: "id" },
    { pmOrigin: "https://pm", authSecret: "", siteId: "id" },
    { pmOrigin: "https://pm", authSecret: "s", siteId: "" },
  ]) {
    assert.equal(isGuardConfigured(cfg), false, JSON.stringify(cfg));
  }
});

// ── validate URL ────────────────────────────────────────────────────────────
test("cmsValidateUrl: appends path, trims trailing slashes", () => {
  assert.equal(cmsValidateUrl("https://pm.example.com"), "https://pm.example.com/api/auth/cms-validate");
  assert.equal(cmsValidateUrl("https://pm.example.com/"), "https://pm.example.com/api/auth/cms-validate");
  assert.equal(cmsValidateUrl("https://pm.example.com///"), "https://pm.example.com/api/auth/cms-validate");
});

// ── cookie extraction ───────────────────────────────────────────────────────
test("readSessionCookie: pulls bizbee_session out of a multi-cookie header", () => {
  assert.equal(readSessionCookie("a=1; bizbee_session=abc123; b=2"), "abc123");
  assert.equal(readSessionCookie("bizbee_session=xyz"), "xyz");
});

test("readSessionCookie: absent / null → empty string (deny path)", () => {
  assert.equal(readSessionCookie(null), "");
  assert.equal(readSessionCookie(""), "");
  assert.equal(readSessionCookie("other=1; foo=2"), "");
  // a cookie that merely CONTAINS the name as a substring isn't matched
  assert.equal(readSessionCookie("xbizbee_session=nope"), "");
});

// ── decision from PM's answer (fail-closed) ─────────────────────────────────
test("decideFromValidate: 200 + ok:true → allow (with userId)", () => {
  const d = decideFromValidate(200, { ok: true, userId: "u1" });
  assert.equal(d.allow, true);
  assert.equal(d.userId, "u1");
});

test("decideFromValidate: 200 + ok:true without userId → allow, no id", () => {
  const d = decideFromValidate(200, { ok: true });
  assert.equal(d.allow, true);
  assert.equal(d.userId, undefined);
});

test("decideFromValidate: ok:false → deny", () => {
  assert.equal(decideFromValidate(200, { ok: false }).allow, false);
});

test("decideFromValidate: non-200 (401 bad secret / 5xx PM down) → deny", () => {
  assert.equal(decideFromValidate(401, { ok: true }).allow, false);
  assert.equal(decideFromValidate(500, null).allow, false);
});

test("decideFromValidate: null/garbage body → deny (never throws)", () => {
  assert.equal(decideFromValidate(200, null).allow, false);
  assert.equal(decideFromValidate(200, {}).allow, false);
  assert.equal(decideFromValidate(200, { ok: "true" }).allow, false); // string, not bool
});
