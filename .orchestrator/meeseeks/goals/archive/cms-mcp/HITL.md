# HITL — cms-mcp live spot-check (the ONLY open item)

All codeable slices (1–5) are DONE and gate-green. What remains is a human-in-the-
loop verification that cannot be done from a Meeseeks run — it needs a DEPLOYED
CMS Worker and a key minted through the live UI.

## Steps for the user
1. Deploy a Site's CMS (PM → deploy) so its Worker is live at
   `https://bizbeecms-cms-<slug>.<acct>.workers.dev`.
2. In the CMS, go to **Settings → API Keys** (Admin), create a key, copy it once.
3. The same page now shows a **Connect Claude Code** section with this site's
   `/mcp` URL pre-filled. Copy the `claude mcp add` command (or the `.mcp.json`
   block) and replace `bzb_YOUR_KEY` with the key from step 2.
4. Run it / add it to Claude Code, then confirm:
   - **tools/list**: all the assistant tools appear (create/update component,
     page/blocks, translate, list/get, brand/theme, assets…).
   - **tools/call**: invoke one read tool (e.g. list components) and confirm a real
     round-trip against that site's D1.
   - An invalid/missing bearer is rejected (401).

## Expected
Identical behavior to the in-CMS chat tools (same shared `runTool` dispatch),
auth-gated by the bearer key, browser chat unaffected.
