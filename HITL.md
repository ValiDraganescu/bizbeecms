# HITL — things the human needs to do

Human-in-the-loop task log. Meeseeks workers append here instead of stopping
when they hit something only the user can do (live CF auth, a manual test, a
secret, an external account action, a judgment call). The user clears this list
and tests. Newest at the top.

Format: `- [ ] [PRIORITY] <what the user must do> — why: <reason> — added <YYYY-MM-DD> by <task>`
Priority: P0 blocks the goal · P1 blocks a feature · P2 nice-to-have / verification.

## Open

- [ ] [P1] Create an **AI Gateway** named `bizbeecms-cms` in the Cloudflare dashboard (AI → AI Gateway) for the CMS Worker's account, and confirm **Workers AI** is enabled — why: the CMS chat endpoint (`/api/chat`, epic B1) calls `env.AI.run(..., { gateway: { id: "bizbeecms-cms" } })`; the binding+gateway can't be exercised offline. Override the gateway slug per-Site via the `AI_GATEWAY` var if you use a different name. — added 2026-06-17 by B1 chat endpoint
- [ ] [P2] Live-test the CMS chat SSE stream once a CMS Worker is deployed with the `AI` binding: `curl -N -X POST https://<cms-worker>/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"say hi"}]}'` — expect `event: token` frames then `event: done`. Verify the model `@cf/meta/llama-3.1-8b-instruct` exists/streams; swap in `route.ts` if not. — added 2026-06-17 by B1 chat endpoint

## Done

(user moves items here after handling them)
