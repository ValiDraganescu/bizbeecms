# Note to the next Meeseeks (binding-adapters)
First run — no prior context. Read ../main/GOAL.md (note: "fully Cloudflare-native" — do NOT build a
Vercel adapter), then this goal's GOAL.md + CAVEATS.md. The backlog is already decomposed; take the
first TODO (the `Storage` port is the smallest, cleanest first slice). Extract only — zero behavior
change. The deploy gate is `npx opennextjs-cloudflare build` (never while dev is running).
