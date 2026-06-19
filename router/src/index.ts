type Env = {
  HOST_MAP: KVNamespace;
  WORKERS_SUBDOMAIN: string;
  // Shared secret (same value the deployer injects into every CMS Worker as
  // CMS_AUTH_SECRET). Used to HMAC-sign x-bizbee-host so the CMS can prove the
  // forwarded host came from THIS router, not a forged direct workers.dev hit.
  CMS_AUTH_SECRET: string;
};

/** HMAC-SHA256 of `msg` with `secret`, hex-encoded. */
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * bizbeecms-router — the single Worker every customer custom hostname resolves
 * to. Custom hostnames (Cloudflare for SaaS) bind to the bizbeecms.com ZONE, not
 * to a Worker, so we can't point customer.com straight at one per-Site Worker.
 * Instead this Worker reads the Host header, looks up which Site that hostname
 * belongs to (HOST_MAP KV, written by the deployer), and proxies to that Site's
 * existing `.workers.dev` URL.
 *
 * ponytail: proxy by .workers.dev URL, not service bindings — bindings are
 * static config but Sites are created at runtime, so a binding can't exist for a
 * Site that isn't deployed yet. The extra public hop is the price of not
 * redeploying this Worker on every new Site. Switch to service bindings only if
 * that hop's latency ever measurably matters.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const host = request.headers.get("host")?.toLowerCase() ?? "";

    // Every host this router serves is a customer-owned custom hostname; the Site
    // it maps to is looked up in HOST_MAP KV (written by the deployer on
    // /attach-domain). Per-Site CMS deployments are reached directly on their
    // own bizbeecms-cms-<slug>.workers.dev URL, NOT through this router (the
    // `<slug>.site.bizbeecms.com` scheme was ruled out — needed a paid ACM cert).
    const slug = await env.HOST_MAP.get(host);
    if (!slug) {
      return new Response("Unknown domain", { status: 404 });
    }

    // Rebuild the URL against the Site's worker, preserving path + query.
    const target = new URL(request.url);
    target.protocol = "https:";
    target.host = `bizbeecms-cms-${slug}.${env.WORKERS_SUBDOMAIN}.workers.dev`;

    // Forward the ORIGINAL host so the CMS can resolve its own context (SSO
    // return URL, canonical links) from the customer domain, not the internal
    // workers.dev name. OpenNext normalizes x-forwarded-host to the workers.dev
    // URL it actually serves, so we ALSO pass a private x-bizbee-host (left
    // untouched). It is HMAC-SIGNED with the shared CMS_AUTH_SECRET so the CMS can
    // verify it really came from this router — a direct workers.dev hit with a
    // forged x-bizbee-host has no valid signature and is rejected (no open
    // redirect / SSO-return spoof). Strip any inbound copies first.
    const headers = new Headers(request.headers);
    headers.delete("x-bizbee-host");
    headers.delete("x-bizbee-host-sig");
    headers.set("x-forwarded-host", host);
    headers.set("x-bizbee-host", host);
    headers.set("x-bizbee-host-sig", await hmacHex(env.CMS_AUTH_SECRET, host));

    return fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      }),
    );
  },
};
