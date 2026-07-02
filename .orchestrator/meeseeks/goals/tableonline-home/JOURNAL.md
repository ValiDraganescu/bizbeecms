# Journal — tableonline-home
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-02 15:06 — Retheme to tableonline.fi dark-teal palette
- **Status:** DONE
- **What I did:** Called `update_theme` MCP tool (local-site, :3602) with full light+dark token sets. Light: surface `#f9f9f6`, foreground `#001414`, primary `#124142`, primary-hover `#073535`, primary-subtle `#e3ece9`, border `#dadfd8`, ring `#009688` (button gradient accent teal), danger `#d12c1a` (matches spec), plus coherent success/warning/info in teal-adjacent hues. Dark mode is teal-tinted (not the old default zinc+orange): surface `#001414`→raised `#0b2e2e`, primary `#009688`, border `#15403f`.
- **Verified:** `curl http://localhost:3602/` and grepped the inline per-page compiled Tailwind `<style>` block — confirmed `--color-primary:#124142`, `--color-border:#dadfd8`, `--color-surface:#f9f9f6` in the `:root` (light) block and `--color-surface:#001414`, `--color-primary:#009688` etc. in the `[data-theme="dark"]` block. Both present and correct on the live home page HTML.
- **Files:** No repo files — theme lives in D1 via MCP `update_theme` (site-level DB row, not code). Goal memory files only: JOURNAL.md, BACKLOG.md, NEXT.md.
