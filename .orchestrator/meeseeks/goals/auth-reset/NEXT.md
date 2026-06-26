# Note to the next Meeseeks (auth-reset)

**BUG [P1] is STILL OPEN but ALL CODE is now done in both apps.** Full subject
parity landed: PM invite, PM reset, CMS invite, AND CMS reset (this run) all
domain-prefix their email subject when a custom domain is attached. The only
remaining work is NOT codeable here — a live verification gated on another goal's
deployer fix:

1. **part (1) link host** — shared deployer `APP_ORIGIN` fix tracked in
   `sso`/`cms-mcp` (deployer `src/index.ts` ~520 always sets APP_ORIGIN to
   workers.dev even when a custom domain is attached). Do NOT fix APP_ORIGIN here.
   When it lands + a custom-domain site redeploys, BOTH the email link host AND the
   subject prefix go live together (the subject is derived from APP_ORIGIN, so it
   auto-activates — no code change needed in this goal).

2. **Live HITL verify, then flip the bug DONE** — once the deployer fix lands +
   redeploy: invite a user AND request a reset on a custom-domain site (e.g.
   restovista.com) in BOTH apps → confirm (a) email link host is the custom domain
   (not workers.dev), (b) invite subject is `<domain>: You are invited to use
   BizBeeCMS`, (c) reset subject is `<domain>: Reset your password`. If all check
   out, flip BUG [P1] to DONE in BACKLOG.md.

**OUTSTANDING CODE LOOSE END (the ONLY codeable item left):**
- **`bundle:cms` was DEFERRED this run** because the tree had OTHER workers'
  in-flight PM changes (migrations 0015 + `schema.ts` + `deploy-events.ts`). The
  committed PM `cms-bundle.generated.js` does NOT yet contain the CMS reset-subject
  change. A later CMS run on a CLEAN tree must run `bundle:cms` (from PM) as its
  LAST step to bake it in. The change is inert until the deployer APP_ORIGIN fix, so
  no rush, but the bundle is stale until then. **Check `git status` is clean of
  others' files before running bundle:cms** (BUNDLE:CMS CONCURRENCY caveat).

**Code status (all DONE):**
- PM invite + reset subjects: domain-prefixed via
  `ProjectManager/src/lib/mail/invite-subject.ts`.
- CMS invite subject: `CMS/src/app/api/invite/route.ts` via
  `CMS/src/lib/mail/invite-subject.ts`.
- CMS reset subject (this run): `CMS/src/app/api/auth/forgot/route.ts` via the same
  `inviteSubject` helper + `resetEmail.subjectWithDomain` EN/FI/ET.

Gate every run: app tsc + node tests + opennext build, NOT while dev (3601/3602)
up — `lsof` first. ONE app per run. CMS slices regen PM cms-bundle LAST (clean
tree only); PM slices never touch cms-bundle.
