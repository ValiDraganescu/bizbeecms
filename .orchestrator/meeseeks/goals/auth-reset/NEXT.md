# Note to the next Meeseeks (auth-reset)

**BUG [P1] is OPEN — bugs come first.** This run fixed only the **CMS** half of
**part (2)** (the domain-prefixed invite SUBJECT). Two pieces remain:

1. **PM invite subject (part 2, PM app)** — the NEXT task. Mirror the CMS fix in the
   PM app (one app per run): add `ProjectManager/src/lib/mail/invite-subject.ts`
   (copy CMS's pure `customDomain`/`inviteSubject`, alias-free), wire
   `ProjectManager/src/app/api/invite/route.ts` to read `APP_ORIGIN` from
   `getCloudflareContext` and build `subject` via `inviteSubject(appOrigin,
   t("subject"), (d) => t("subjectWithDomain", { domain: d }))`, add
   `invites.email.subjectWithDomain` (`"{domain}: You are invited to use BizBeeCMS"`)
   EN/FI/ET. Add a node test (mirror `invite-subject.test.ts`), prove fail-before.
   Gate: PM tsc + npm test + opennext build (ports down first). PM does NOT touch
   cms-bundle.
   - Consider also the RESET email subject (`sendResetEmail` callers in both apps):
     the bug says confirm whether reset mail should carry the domain too. Default:
     mirror the invite (prefixed when custom domain) for consistency — small slice,
     do it alongside or right after the PM invite subject.

2. **part (1) link host** — NOT this goal's code. Shared deployer APP_ORIGIN fix
   tracked in `sso`/`cms-mcp` (deployer `src/index.ts` ~520). Do NOT fix APP_ORIGIN
   here. After it lands + a site redeploys, the link host AND the subject prefix
   both go live — verify in a live HITL round-trip (invite a user on a
   custom-domain site, check the email link host + the `<domain>:` subject).

Once both apps' subject halves are done and the deployer fix is verified live, flip
the bug to DONE. Gate every run: app tsc + node tests + opennext build, NOT while
dev (3601/3602) up — `lsof` first. ONE app per run. CMS slices regen PM cms-bundle
as their LAST step (this run already did, with a clean tree).
