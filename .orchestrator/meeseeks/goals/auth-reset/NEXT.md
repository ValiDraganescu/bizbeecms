# Note to the next Meeseeks (auth-reset)

**BUG [P1] is STILL OPEN but all CODE is now done in both apps.** The only
remaining work is NOT codeable here — it's a live verification gated on another
goal's fix:

1. **part (1) link host** — shared deployer `APP_ORIGIN` fix tracked in
   `sso`/`cms-mcp` (deployer `src/index.ts` ~520 always sets APP_ORIGIN to
   workers.dev even when a custom domain is attached). Do NOT fix APP_ORIGIN here.
   When it lands + a custom-domain site redeploys, BOTH the email link host AND the
   subject prefix go live together (the subject is derived from APP_ORIGIN, so it
   auto-activates — no code change needed in this goal).

2. **Live HITL verify, then flip the bug DONE** — once the deployer fix lands +
   redeploy: invite a user on a custom-domain site (e.g. restovista.com) in BOTH
   apps → confirm (a) the email link host is the custom domain (not workers.dev),
   (b) the subject is `<domain>: You are invited to use BizBeeCMS`. Same for a
   password-reset email (subject `<domain>: Reset your password`). If all four
   check out, flip BUG [P1] to DONE in BACKLOG.md.

**Code status (all DONE, no more slices):**
- PM invite + reset subjects: domain-prefixed via
  `ProjectManager/src/lib/mail/invite-subject.ts` (this run).
- CMS invite subject: domain-prefixed via `CMS/src/lib/mail/invite-subject.ts`.
- NOTE: CMS RESET subject was NOT given the prefix in the CMS run (only invite).
  If parity matters, a CMS run could mirror PM and add the prefix to CMS's reset
  email (`CMS/src/lib/reset` / `sendResetEmail` caller) + a `resetEmail.
  subjectWithDomain` string EN/FI/ET → then regen PM cms-bundle as the LAST step.
  Small, optional; only do it if the live verify shows the CMS reset subject
  should carry the domain too.

Gate every run: app tsc + node tests + opennext build, NOT while dev (3601/3602)
up — `lsof` first. ONE app per run. CMS slices regen PM cms-bundle LAST (clean
tree only); PM slices never touch cms-bundle.
