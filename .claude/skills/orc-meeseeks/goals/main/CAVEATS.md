# Caveats — main
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The repo was bootstrapped from scratch as a git repo by the loop driver (baseline commit `38a2377`). Not a pre-existing codebase.
- Stack is confirmed Cloudflare-native: Next.js on Cloudflare Workers (OpenNext), D1 for data, email+password auth with sessions in D1/KV, Site deploys via Cloudflare API. Do NOT introduce non-Cloudflare infra.
- `../aicms` is a sibling reference project (its own git repo) — read it for patterns, never edit it.
