# Caveats — tableonline-home
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- Content/theme/page work goes through the HTTP MCP at `http://localhost:3602/mcp` (bearer token in repo-root `.mcp.json`, key `local-site`), NOT direct DB edits. Call `get_authoring_guide` before block-tree edits — `update_page_blocks` expects the FULL current tree back, so `get_page` first or you wipe sections.
- The dev server must be running for MCP calls (`npm run dev` in `CMS/`, port 3602). If :3602 is down, start it; don't switch to build mode. NEVER run `npx opennextjs-cloudflare build` while dev is running — it corrupts .next.
- Theme tokens are semantic (surface/foreground/primary/…): hex values are accepted; change tokens, don't hardcode colors in components.
- Collections are `content_*` D1 tables created via the fenced `create_collection` tool (100-table cap). Query/filter via `query_collection` and List `listSource.filter`.
- Killing terminals/processes is dangerous (you may kill your own session or the dev server) — check what a PID is before killing.
- `update_theme` MCP tool args are `{ light: {...}, dark: {...} }` at the TOP LEVEL — do NOT nest under a `theme` key (that fails with "supply 'light' and/or 'dark' as a token→color object"). Verify a theme change by curling `/` and grepping the inline compiled `<style>` block for `--color-<token>:` inside `:root{...}` (light) and `[data-theme="dark"]{...}` (dark) — the raw hex you set appears there directly, no build step needed.
