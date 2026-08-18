// Pure, dependency-free helpers for the custom-hostname DCV upgrade that runs
// on every Site deploy (see ensureHttpDcv in index.ts). Split out so
// `node --test` can load it without the Worker-only imports in index.ts.

const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Sanitize the `hostnames` list PM sends with a deploy: lowercase, trimmed,
 * well-formed only. Junk entries are DROPPED (not rejected) — this is a
 * best-effort side task and must never block a deploy. Duplicates removed.
 */
export function parseDeployHostnames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const h of raw) {
    const hostname = String(h ?? "").trim().toLowerCase();
    if (HOSTNAME_RE.test(hostname) && !out.includes(hostname)) out.push(hostname);
  }
  return out;
}

export type DcvRecordView = {
  status?: string;
  ssl?: { status?: string; method?: string; type?: string; wildcard?: boolean };
};

/**
 * Should this CF-for-SaaS custom hostname be switched from TXT to HTTP DCV?
 *
 * WHY: hostnames are created with `ssl.method: "txt"` so the cert can be issued
 * BEFORE the customer cuts DNS over to us. But TXT tokens are per-issuance —
 * every ~90-day renewal mints new ones, CF can't write them into the customer's
 * (non-Cloudflare) DNS, and the customer gets a "validate your domain" email.
 * Once the hostname is `active` (DNS points at our edge), HTTP DCV renews
 * hands-off, so we flip it.
 *
 * Only when: hostname active, cert active, currently NOT http, and not a
 * wildcard (wildcards MUST use DNS validation by CA/B Forum rules).
 */
export function shouldUpgradeToHttpDcv(rec: DcvRecordView | null | undefined): boolean {
  if (!rec || rec.status !== "active") return false;
  const ssl = rec.ssl ?? {};
  if (ssl.wildcard) return false;
  if ((ssl.method ?? "").toLowerCase() === "http") return false;
  // Cert status: `active` = issued + serving. `pending_validation` here means
  // a RENEWAL is stuck on the (stale) TXT tokens — exactly the case that
  // triggers the email, and switching to http lets CF re-validate over HTTP.
  const s = (ssl.status ?? "").toLowerCase();
  return s === "active" || s === "pending_validation" || s === "pending_issuance";
}
