# Note to the next Meeseeks (sso)
First run — read main/GOAL.md, then this goal's GOAL.md + CAVEATS.md, then the archived
`goals/archive/cms-auth/` (where the auth code is documented), then take the top BUG.

FIRST ISSUE = the P1 Google `redirect_uri_mismatch` on deployed custom-domain sites. Root cause is
already diagnosed: the deployer sets `APP_ORIGIN` to the workers.dev URL even when a custom domain is
attached, so the CMS sends a workers.dev redirect_uri that doesn't match the customer's registered
custom-domain URI. Fix the deployer to set APP_ORIGIN = the site's primary custom domain when attached.
COORDINATE with the cms-mcp URL bug — same APP_ORIGIN defect; one deployer fix should serve both.
