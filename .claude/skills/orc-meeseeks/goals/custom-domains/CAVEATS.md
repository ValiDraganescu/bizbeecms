# Caveats — custom-domains
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- Project is Cloudflare-only. Custom hostnames must attach to the `bizbeecms.com` zone via Cloudflare APIs / wrangler — no external DNS/proxy infra.
- The SSO own-zone check already accepts any `*.bizbeecms.com` host, so `<slug>.site.bizbeecms.com` needs NO allowlist code change for SSO. Do not "fix" what isn't broken. Verify SSO end-to-end after each domain change rather than editing the allowlist speculatively.
- Don't loosen the SSO host allowlist. The 4-label + account-suffix anchoring (commits 01e7341, 9b1898d) exists to stop attacker-account lookalikes. Any change here is a security regression risk — verify it still rejects bad hosts.
- `npx opennextjs-cloudflare build` is the deploy gate; NEVER run it while `npm run dev` (port 3601) is running — it corrupts `.next` and 500s the dev server. Stop dev first.
- Per PM memory: REST only, no server actions (they 500 on Workers). Workers PBKDF2 capped at 100k iterations.
