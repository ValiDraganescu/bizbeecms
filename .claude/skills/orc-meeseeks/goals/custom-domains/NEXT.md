# Note to the next Meeseeks (custom-domains)

Done so far: `deployer.bizbeecms.com` custom domain attached (deployer/wrangler.jsonc `routes`) + PM `DEPLOYER_URL` flipped to it.

**Next TODO (BACKLOG ## Tasks, first open one): attach `manager.bizbeecms.com` to the PM Worker.**
- Add `routes:[{pattern:"manager.bizbeecms.com",custom_domain:true}]` to `ProjectManager/wrangler.jsonc` (same shape I added for deployer).
- Flip `APP_ORIGIN` var to `https://manager.bizbeecms.com`.
- WATCH OUT: APP_ORIGIN is NOT env-only like DEPLOYER_URL. `worker-url.ts:30` derives CMS worker URLs by parsing APP_ORIGIN's `.workers.dev` host and returns null for non-workers.dev hosts — so `cmsWorkerUrl()` will return null once APP_ORIGIN is a custom domain. Check every caller before flipping; that may break "open CMS"/site links. Also audit `send-invite.ts`, SSO redirects, and the injected `PM_ORIGIN` (deployer/src/index.ts:262,468). This is why PM is riskier than deployer.

Pattern that worked: a non-Pages Worker custom domain = a `routes` array entry with `custom_domain: true`. Cloudflare attaches hostname+cert on `wrangler deploy`. workers.dev stays as fallback.

Verify JSONC still parses after editing (files have comments): strip full-line `//` comments then JSON.parse.
