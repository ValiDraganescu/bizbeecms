# Goal: ai-assistant
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Build the CMS's **page-aware AI assistant** — an Intercom-style chat widget embedded across the CMS
admin that helps the operator build pages/components, edit settings, and translate, by calling tools.
Modeled on the previous CMS's `admin-chat` module (`/Users/valentindraganescu/git/dev/aicms`,
`src/modules/admin-chat/`).

## What we're adopting from aicms `admin-chat`
- **Intercom-style widget** — a floating bubble (bottom-right) that opens a compact chat panel over any
  admin page; close/minimize; conversation **history**; a **debug** view (shows the assembled system
  prompt + the active tool list); a **model picker**. (Today bizbee's assistant is a full-page route —
  `/admin` AI Assistant + `app/api/chat/route.ts` + `lib/chat/*`.)
- **Page-awareness** — the assistant detects which admin page it's on (page-builder / components /
  settings / pages / general) and switches BOTH its system prompt AND its available tool set per page.
  Reference: aicms `lib/chat/tool_scopes.ts` (`detect_admin_context` + `get_tools_for_context` +
  `get_context_prompt`) and `lib/chat/assemble_prompt.ts`.
- **A tool catalog** scoped per page. ONLY the CMS-structural tools port to bizbeecms (see CAVEATS) —
  aicms's gallery tools (artwork/product/discount/order) have NO bizbee equivalent and are out of scope.

## What "good" looks like
- The floating widget works on every CMS admin page, fits the PM/CMS design system (purpose tokens,
  EN/FI/ET), builds clean (`opennextjs-cloudflare build`), and runs on the Cloudflare AI REST API path
  (depends on the binding-adapters REST-`Ai`-adapter task — do NOT re-implement the model call here).
- On the page-builder page it can create/update components + page blocks; on settings it can read/write
  brand/theme/locales; everywhere it stays scoped to that page's tools + prompt. Debug view shows what
  prompt + tools are live. History persists per Site.

## Out of scope
- The model-call transport itself (that's binding-adapters' REST `Ai` adapter — this goal CONSUMES it).
- Gallery/e-commerce tools (artworks/products/discounts/orders) — bizbeecms has no such entities.
- AI persona editing UI unless a settings store for it already exists (check before assuming).
