/**
 * Tests for the PURE Google-OAuth core (cms-auth Slice 2b):
 *   - buildGoogleAuthUrl — endpoint + required params.
 *   - signState / verifyState — round-trip, tamper, wrong secret, expiry.
 *   - verifiedEmailFromIdToken — aud/iss/email_verified/exp enforcement.
 *   - decideGoogleSignIn — the no-self-signup rule (allowed ONLY if a CMS user
 *     OR a pending invite exists).
 *
 * dep-free node --test; loads the real `.ts` via native type-stripping. NO live
 * Google call — id_tokens are hand-built (we only decode the payload, and the
 * provenance is the TLS-authenticated direct token exchange in the route).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  GOOGLE_AUTH_ENDPOINT,
  STATE_TTL_MS,
  buildGoogleAuthUrl,
  signState,
  verifyState,
  verifiedEmailFromIdToken,
  verifyIdTokenSignature,
  decideGoogleSignIn,
} from "../src/lib/auth/google-core.ts";

const SECRET = "test-cms-auth-secret";
const CLIENT = "123.apps.googleusercontent.com";

// base64url-encode a JSON payload into a fake JWT (header.payload.sig).
function fakeIdToken(claims) {
  const b64u = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64u({ alg: "RS256" })}.${b64u(claims)}.sig`;
}

const validClaims = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  email: "Alice@Example.com",
  email_verified: true,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// ---- buildGoogleAuthUrl ------------------------------------------------------

test("buildGoogleAuthUrl targets Google + carries required params", () => {
  const url = buildGoogleAuthUrl({
    clientId: CLIENT,
    redirectUri: "https://x.workers.dev/api/auth/google/callback",
    state: "st",
  });
  assert.ok(url.startsWith(GOOGLE_AUTH_ENDPOINT + "?"));
  const p = new URL(url).searchParams;
  assert.equal(p.get("client_id"), CLIENT);
  assert.equal(p.get("redirect_uri"), "https://x.workers.dev/api/auth/google/callback");
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("scope"), "openid email");
  assert.equal(p.get("state"), "st");
});

// ---- signState / verifyState -------------------------------------------------

test("signState round-trips through verifyState", async () => {
  const st = await signState(SECRET);
  assert.equal(await verifyState(st, SECRET), true);
});

test("verifyState rejects a tampered state", async () => {
  const st = await signState(SECRET);
  const bad = st.slice(0, -1) + (st.endsWith("a") ? "b" : "a");
  assert.equal(await verifyState(bad, SECRET), false);
});

test("verifyState rejects a different secret", async () => {
  const st = await signState(SECRET);
  assert.equal(await verifyState(st, "other-secret"), false);
});

test("verifyState rejects an expired state", async () => {
  const now = Date.now();
  const st = await signState(SECRET, now - STATE_TTL_MS - 1);
  assert.equal(await verifyState(st, SECRET, now), false);
});

test("verifyState rejects garbage shapes", async () => {
  assert.equal(await verifyState("a.b", SECRET), false);
  assert.equal(await verifyState("", SECRET), false);
});

// ---- verifiedEmailFromIdToken ------------------------------------------------

test("verifiedEmailFromIdToken returns the normalised verified email", () => {
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(validClaims), CLIENT), "alice@example.com");
});

test("verifiedEmailFromIdToken accepts email_verified as the string 'true'", () => {
  const c = { ...validClaims, email_verified: "true" };
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(c), CLIENT), "alice@example.com");
});

test("verifiedEmailFromIdToken rejects a wrong audience", () => {
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(validClaims), "wrong-client"), null);
});

test("verifiedEmailFromIdToken rejects a non-Google issuer", () => {
  const c = { ...validClaims, iss: "https://evil.example" };
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(c), CLIENT), null);
});

test("verifiedEmailFromIdToken rejects unverified email", () => {
  const c = { ...validClaims, email_verified: false };
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(c), CLIENT), null);
});

test("verifiedEmailFromIdToken rejects an expired token", () => {
  const now = Math.floor(Date.now() / 1000);
  const c = { ...validClaims, exp: now - 10 };
  assert.equal(verifiedEmailFromIdToken(fakeIdToken(c), CLIENT, now), null);
});

test("verifiedEmailFromIdToken rejects a malformed token", () => {
  assert.equal(verifiedEmailFromIdToken("not-a-jwt", CLIENT), null);
  assert.equal(verifiedEmailFromIdToken("a.b.c", CLIENT), null);
});

// ---- verifyIdTokenSignature (JWK RS256 hardening) ----------------------------

const b64u = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Generate an RSA keypair, sign `header.payload` (RS256), return the full JWT +
// the PUBLIC key as a JWK (what the JWKS endpoint serves).
async function signedIdToken(claims, { kid = "kid-1", header } = {}) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const head = header ?? { alg: "RS256", kid };
  const signingInput = `${b64u(head)}.${b64u(claims)}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64u = Buffer.from(sig).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return { token: `${signingInput}.${sigB64u}`, jwk: { ...jwk, kid } };
}

test("verifyIdTokenSignature accepts a token signed by the matching JWK", async () => {
  const { token, jwk } = await signedIdToken(validClaims);
  assert.equal(await verifyIdTokenSignature(token, { keys: [jwk] }), true);
});

test("verifyIdTokenSignature picks the JWK by kid among several keys", async () => {
  const { token, jwk } = await signedIdToken(validClaims, { kid: "real" });
  const other = await signedIdToken(validClaims, { kid: "decoy" });
  assert.equal(await verifyIdTokenSignature(token, { keys: [other.jwk, jwk] }), true);
});

test("verifyIdTokenSignature rejects a token signed by a different key", async () => {
  const { token } = await signedIdToken(validClaims);
  const other = await signedIdToken(validClaims); // unrelated keypair, same kid
  assert.equal(await verifyIdTokenSignature(token, { keys: [other.jwk] }), false);
});

test("verifyIdTokenSignature rejects a tampered payload", async () => {
  const { token, jwk } = await signedIdToken(validClaims);
  const [h, , s] = token.split(".");
  const forged = `${h}.${b64u({ ...validClaims, email: "attacker@evil.com" })}.${s}`;
  assert.equal(await verifyIdTokenSignature(forged, { keys: [jwk] }), false);
});

test("verifyIdTokenSignature rejects when no JWK matches the kid", async () => {
  const { token, jwk } = await signedIdToken(validClaims, { kid: "missing" });
  assert.equal(await verifyIdTokenSignature(token, { keys: [{ ...jwk, kid: "other" }] }), false);
});

test("verifyIdTokenSignature rejects a non-RS256 (alg=none) token", async () => {
  const { jwk } = await signedIdToken(validClaims);
  const none = `${b64u({ alg: "none" })}.${b64u(validClaims)}.`;
  assert.equal(await verifyIdTokenSignature(none, { keys: [jwk] }), false);
});

test("verifyIdTokenSignature rejects a malformed token + empty JWKS", async () => {
  assert.equal(await verifyIdTokenSignature("not-a-jwt", { keys: [] }), false);
  const { token } = await signedIdToken(validClaims);
  assert.equal(await verifyIdTokenSignature(token, { keys: [] }), false);
});

// ---- decideGoogleSignIn (the no-self-signup rule) ----------------------------

test("decideGoogleSignIn: existing user → allowed", () => {
  const d = decideGoogleSignIn("a@b.com", { user: true, pendingInvite: false });
  assert.deepEqual(d, { ok: true, email: "a@b.com" });
});

test("decideGoogleSignIn: pending invite (no user yet) → allowed", () => {
  const d = decideGoogleSignIn("a@b.com", { user: false, pendingInvite: true });
  assert.deepEqual(d, { ok: true, email: "a@b.com" });
});

test("decideGoogleSignIn: uninvited (no user, no invite) → REJECTED", () => {
  const d = decideGoogleSignIn("a@b.com", { user: false, pendingInvite: false });
  assert.deepEqual(d, { ok: false, reason: "notInvited" });
});

test("decideGoogleSignIn: no verified email → rejected", () => {
  const d = decideGoogleSignIn(null, { user: true, pendingInvite: true });
  assert.deepEqual(d, { ok: false, reason: "noEmail" });
});
