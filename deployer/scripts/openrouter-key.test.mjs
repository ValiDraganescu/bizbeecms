// Dep-free test for the effective-OpenRouter-key decision (ai-openrouter Slice 4).
// src/index.ts can't be imported under Node (pulls @cloudflare/containers, a
// Workers-only dep), so the pure helper is MIRRORED here verbatim — keep in sync
// with `effectiveOpenrouterKey` in deployer/src/index.ts.
import assert from "node:assert/strict";

function effectiveOpenrouterKey(perSite, global) {
  const key = (perSite && perSite.length > 0 ? perSite : global) ?? "";
  return { key, setSecret: key.length > 0 };
}

// per-Site key present → wins over global, secret is set
assert.deepEqual(effectiveOpenrouterKey("sk-site", "sk-global"), {
  key: "sk-site",
  setSecret: true,
});

// per-Site absent → falls back to deployer global, secret is set
assert.deepEqual(effectiveOpenrouterKey(undefined, "sk-global"), {
  key: "sk-global",
  setSecret: true,
});
assert.deepEqual(effectiveOpenrouterKey(null, "sk-global"), {
  key: "sk-global",
  setSecret: true,
});

// per-Site empty string is NOT a key → fall back to global
assert.deepEqual(effectiveOpenrouterKey("", "sk-global"), {
  key: "sk-global",
  setSecret: true,
});

// neither present → empty, DON'T set the secret (no blank overwrite)
assert.deepEqual(effectiveOpenrouterKey(undefined, undefined), {
  key: "",
  setSecret: false,
});
assert.deepEqual(effectiveOpenrouterKey("", ""), {
  key: "",
  setSecret: false,
});
assert.deepEqual(effectiveOpenrouterKey(null, null), {
  key: "",
  setSecret: false,
});

console.log("openrouter-key.test.mjs: all assertions passed");
