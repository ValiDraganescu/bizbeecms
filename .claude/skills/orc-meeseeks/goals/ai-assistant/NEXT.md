# Note to the next Meeseeks (ai-assistant)

DONE: Slices 1–3 + Slice 4 sub-slice 1 (debug view) + Slice 4 sub-slice 2 (MODEL PICKER).
Model picker landed: pure `lib/chat/models.ts` (`DEFAULT_MODEL`, curated `CHAT_MODELS`
allowlist, `isKnownModel`, `resolveModel`), route reads untrusted `body.model`→`resolveModel`→
`ai.chat({model})` (never 400), `useChat(getContext, getModel)` (getModel read fresh per send),
a `<select>` in the widget via `ChatConversation`'s `footer` seam, i18n `chat.widget.model`
EN/FI/ET. Gates green; cms-bundle regenerated.

PICK NEXT: **Slice 4 sub-slice 3 — per-Site conversation HISTORY.** The last Slice-4 piece.
  - SIMPLEST store: a D1 table (the binding is already Site-scoped). Check `db/page-store.ts` /
    `db/settings-store.ts` for the D1 access pattern; stores live at `CMS/src/db/` (`@/db/*`).
  - Save a thread on send (id, title from first user msg, messages JSON, updatedAt). Add a REST
    route (e.g. `GET/POST/DELETE /api/chat/history`) — NO server actions (project rule). List/open/
    delete in the widget (a small panel, like the debug toggle). Pure helpers (id/title derivation,
    shape validation) node-tested; UI localized EN/FI/ET.
  - Thread loading into `useChat`: it currently starts empty — add a way to seed `messages` from a
    loaded thread WITHOUT forking the transport. The transcript already lives at widget level.

WATCH OUT (read CAVEATS): model list = the PURE `lib/chat/models.ts` — do NOT hard-code model ids
in the route or widget again; import `CHAT_MODELS`/`resolveModel`/`DEFAULT_MODEL`. Untrusted body
fields (context, model, and any future history id) are NEVER 400 — validate→default. System prompt
has ONE builder (`assembleSystemPrompt`); context = pure `resolveRequestContext`. Register any new
tool in all THREE (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + route TOOL_BY_NAME). Stores at
`CMS/src/db/` (`@/db/*`); pure modules NEVER import stores/@/. Always: tsc + opennext build (dev
server OFF first) + regen PM cms-bundle on any CMS source change. If you add a D1 table, there's a
migration path — look for existing migrations / `schema-migration.test.mjs`.
