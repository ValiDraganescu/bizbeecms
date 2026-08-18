import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizationServerMetadata,
  buildRedirect,
  chooseIssuer,
  isAcceptableRedirectUri,
  parseAuthorizeRequest,
  parseRegistration,
  parseTokenRequest,
  pkceChallenge,
  protectedResourceMetadata,
  randomToken,
  hashToken,
  redirectUriMatches,
  sameResource,
  verifyPkce,
  wwwAuthenticate,
} from "./core.ts";

const MCP = "https://manager.bizbeecms.com/mcp";
const client = { id: "cid_abc", redirectUris: ["http://localhost:3333/callback", "https://claude.ai/api/mcp/auth_callback"] };
const VERIFIER = "a".repeat(43);

test("redirect URI acceptance: https, loopback http, native scheme; not plain http/fragments/js", () => {
  assert.ok(isAcceptableRedirectUri("https://claude.ai/cb"));
  assert.ok(isAcceptableRedirectUri("http://localhost:1234/callback"));
  assert.ok(isAcceptableRedirectUri("http://127.0.0.1/callback"));
  assert.ok(isAcceptableRedirectUri("myapp://oauth"));
  assert.equal(isAcceptableRedirectUri("http://evil.com/cb"), false);
  assert.equal(isAcceptableRedirectUri("https://x.com/cb#frag"), false);
  assert.equal(isAcceptableRedirectUri("javascript:alert(1)"), false);
  assert.equal(isAcceptableRedirectUri("not a url"), false);
});

test("redirectUriMatches: exact, or loopback with any port", () => {
  assert.ok(redirectUriMatches("http://localhost:3333/callback", "http://localhost:51234/callback"));
  assert.equal(redirectUriMatches("http://localhost:3333/callback", "http://localhost:51234/other"), false);
  assert.equal(redirectUriMatches("https://a.com/cb", "https://a.com:444/cb"), false);
  assert.ok(redirectUriMatches("https://a.com/cb", "https://a.com/cb"));
});

test("parseRegistration: public client only, sane defaults", () => {
  const ok = parseRegistration({ client_name: " Claude Code ", redirect_uris: ["http://localhost:1/cb"] });
  assert.ok(ok.ok && ok.value.clientName === "Claude Code");
  const noName = parseRegistration({ redirect_uris: ["https://x.com/cb"], token_endpoint_auth_method: "none" });
  assert.ok(noName.ok && noName.value.clientName === "MCP client");
  assert.equal(parseRegistration({ redirect_uris: [] }).ok, false);
  assert.equal(parseRegistration({ redirect_uris: ["https://x.com/cb"], token_endpoint_auth_method: "client_secret_post" }).ok, false);
  assert.equal(parseRegistration({ redirect_uris: ["https://x.com/cb"], grant_types: ["implicit"] }).ok, false);
});

test("parseAuthorizeRequest: unknown client / bad redirect are NOT redirectable", async () => {
  const q = new URLSearchParams({ client_id: "nope", redirect_uri: client.redirectUris[0] });
  const r = parseAuthorizeRequest(q, null, MCP);
  assert.ok(!r.ok && r.redirectable === false && r.error === "invalid_client");
  const q2 = new URLSearchParams({ client_id: client.id, redirect_uri: "https://evil.com/cb" });
  const r2 = parseAuthorizeRequest(q2, client, MCP);
  assert.ok(!r2.ok && r2.redirectable === false);
});

test("parseAuthorizeRequest: PKCE S256 required, errors are redirectable with state", async () => {
  const base = { client_id: client.id, redirect_uri: "http://localhost:9999/callback", response_type: "code", state: "xyz" };
  const noPkce = parseAuthorizeRequest(new URLSearchParams(base), client, MCP);
  assert.ok(!noPkce.ok && noPkce.redirectable && noPkce.state === "xyz" && noPkce.error === "invalid_request");
  const plain = parseAuthorizeRequest(
    new URLSearchParams({ ...base, code_challenge: await pkceChallenge(VERIFIER), code_challenge_method: "plain" }),
    client, MCP);
  assert.ok(!plain.ok && plain.redirectable);
  const good = parseAuthorizeRequest(
    new URLSearchParams({ ...base, code_challenge: await pkceChallenge(VERIFIER), code_challenge_method: "S256", scope: "mcp", resource: MCP + "/" }),
    client, MCP);
  assert.ok(good.ok);
  assert.equal(good.value.redirectUri, "http://localhost:9999/callback");
  assert.equal(good.value.scope, "mcp");
  const badScope = parseAuthorizeRequest(
    new URLSearchParams({ ...base, code_challenge: await pkceChallenge(VERIFIER), scope: "admin" }), client, MCP);
  assert.ok(!badScope.ok && badScope.error === "invalid_scope");
  const badRes = parseAuthorizeRequest(
    new URLSearchParams({ ...base, code_challenge: await pkceChallenge(VERIFIER), resource: "https://other/mcp" }), client, MCP);
  assert.ok(!badRes.ok && badRes.error === "invalid_target");
});

test("PKCE verify round-trip; wrong verifier fails; malformed verifier fails", async () => {
  const ch = await pkceChallenge(VERIFIER);
  assert.equal(await verifyPkce(VERIFIER, ch), true);
  assert.equal(await verifyPkce("b".repeat(43), ch), false);
  assert.equal(await verifyPkce("short", ch), false);
});

test("parseTokenRequest covers both grants", () => {
  const ac = parseTokenRequest({ grant_type: "authorization_code", code: "c", redirect_uri: "http://localhost:1/cb", client_id: "x", code_verifier: VERIFIER });
  assert.ok(ac.ok && ac.value.grant === "authorization_code");
  assert.equal(parseTokenRequest({ grant_type: "authorization_code", code: "c", redirect_uri: "u", client_id: "x", code_verifier: "short" }).ok, false);
  const rt = parseTokenRequest({ grant_type: "refresh_token", refresh_token: "r" });
  assert.ok(rt.ok && rt.value.grant === "refresh_token");
  const bad = parseTokenRequest({ grant_type: "password" });
  assert.ok(!bad.ok && bad.error === "unsupported_grant_type");
});

test("tokens are prefixed random strings; hashes are 64-hex and stable", async () => {
  const t = randomToken("at");
  assert.ok(t.startsWith("at_") && t.length > 40);
  assert.notEqual(randomToken("at"), t);
  const h = await hashToken(t);
  assert.equal(h.length, 64);
  assert.equal(await hashToken(t), h);
});

test("metadata + challenge point at the right endpoints", () => {
  const as = authorizationServerMetadata("https://manager.bizbeecms.com/");
  assert.equal(as.issuer, "https://manager.bizbeecms.com");
  assert.equal(as.token_endpoint, "https://manager.bizbeecms.com/oauth/token");
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  const pr = protectedResourceMetadata("https://manager.bizbeecms.com");
  assert.equal(pr.resource, MCP);
  assert.deepEqual(pr.authorization_servers, ["https://manager.bizbeecms.com"]);
  assert.match(wwwAuthenticate("https://manager.bizbeecms.com", "invalid_token", 'expired "now"'),
    /^Bearer resource_metadata="https:\/\/manager\.bizbeecms\.com\/\.well-known\/oauth-protected-resource\/mcp", error="invalid_token", error_description="expired 'now'"$/);
});

test("buildRedirect / sameResource / chooseIssuer", () => {
  assert.equal(buildRedirect("http://localhost:1/cb?x=1", { code: "c", state: null }), "http://localhost:1/cb?x=1&code=c");
  assert.ok(sameResource("https://A.com/mcp/", "https://a.com/mcp"));
  assert.equal(chooseIssuer("", "localhost:3601", "http"), "http://localhost:3601");
  assert.equal(chooseIssuer("https://manager.bizbeecms.com/", "x", null), "https://manager.bizbeecms.com");
});
