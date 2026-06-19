import test from "node:test";
import assert from "node:assert/strict";
import { verifyForwardedHost } from "./forwarded-host.ts";

const SECRET = "test-shared-secret";

// Mirror the router's signing so the test exercises the real verify path.
async function sign(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

test("accepts a host with a valid signature", async () => {
  const host = "restovista.com";
  const sig = await sign(SECRET, host);
  assert.equal(await verifyForwardedHost(host, sig, SECRET), host);
});

test("rejects a forged host (signature for a different host)", async () => {
  const sigForOther = await sign(SECRET, "restovista.com");
  // Attacker swaps the host but reuses a stolen signature.
  assert.equal(await verifyForwardedHost("evil.com", sigForOther, SECRET), null);
});

test("rejects when signature is missing", async () => {
  assert.equal(await verifyForwardedHost("restovista.com", null, SECRET), null);
});

test("rejects a host signed with the wrong secret", async () => {
  const host = "restovista.com";
  const sig = await sign("attacker-secret", host);
  assert.equal(await verifyForwardedHost(host, sig, SECRET), null);
});

test("rejects a host with URL-poisoning characters even if 'signed'", async () => {
  const host = "evil.com/path\r\nx";
  const sig = await sign(SECRET, host);
  assert.equal(await verifyForwardedHost(host, sig, SECRET), null);
});
