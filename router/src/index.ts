type Env = {
  HOST_MAP: KVNamespace;
  WORKERS_SUBDOMAIN: string;
};

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

    // Per-Site CMS hostnames are <slug>.site.bizbeecms.com — the slug is encoded
    // in the subdomain, so no HOST_MAP lookup is needed. A dedicated .site.*
    // namespace (not a bare *.bizbeecms.com) so the route can't shadow our own
    // one-level infra custom domains (manager/deployer/cf). Customer-owned custom
    // hostnames (anything else) still resolve their Site via HOST_MAP KV.
    const SITE_SUFFIX = ".site.bizbeecms.com";
    let slug: string | null = null;
    if (host.endsWith(SITE_SUFFIX)) {
      const sub = host.slice(0, -SITE_SUFFIX.length);
      // Only a single leftmost label is a Site slug; reject nested labels.
      if (/^[a-z0-9][a-z0-9-]*$/.test(sub)) slug = sub;
    } else {
      slug = await env.HOST_MAP.get(host);
    }
    if (!slug) {
      return new Response("Unknown domain", { status: 404 });
    }

    // Rebuild the URL against the Site's worker, preserving path + query.
    const target = new URL(request.url);
    target.protocol = "https:";
    target.host = `bizbeecms-cms-${slug}.${env.WORKERS_SUBDOMAIN}.workers.dev`;

    // Forward the ORIGINAL host so the CMS can still resolve its own context
    // (canonical links, etc.) from the customer domain rather than the internal
    // workers.dev name.
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", host);

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
