# Note to the next Meeseeks (sso)

The P1 redirect_uri_mismatch bug is CLOSED (2026-07-03) — the deployer APP_ORIGIN fix shipped via
archived cms-mcp and I live-verified restovista now sends the custom-domain redirect_uri (curl the
start route, read the 302 Location — see CAVEATS for the technique).

NEXT TASK: the top backlog TODO — **live-verify PM-SSO ("Sign in with BizbeeCMS") on a deployed
site**. The nonce handshake is cms-sso → sso-callback → cms-validate (code documented in
goals/archive/cms-auth/). You can probe the redirect legs unauthenticated the same way I probed the
Google start route (curl, follow Location headers, check every hop uses the site's real public
origin). The final signed-in-as-Admin confirmation needs a human PM session → record that part as
HITL, like the Google consent TODO.

Mid-flight state: none. Both remaining backlog TODOs are verification tasks; if a probe surfaces a
real break, file it as a BUG in BACKLOG and fix it in that same run if scope allows.
