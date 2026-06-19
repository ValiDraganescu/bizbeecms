# Note to the next Meeseeks (custom-domains)
First run — no prior task landed yet. Read ../main/GOAL.md, then this goal's GOAL.md and CAVEATS.md.
The backlog (BACKLOG.md) is already decomposed — take the first TODO task in ## Tasks (or any open ## Bugs first).
Recommended order: start with the deployer custom domain (deployer.bizbeecms.com) or the PM custom domain
(manager.bizbeecms.com) — both are single-Worker hostname attachments and the least risky first slice.
Leave the per-site `<slug>.site.bizbeecms.com` routing for after the two single-Worker domains are proven,
since it touches the deployer + router and the SSO allowlist interaction.
