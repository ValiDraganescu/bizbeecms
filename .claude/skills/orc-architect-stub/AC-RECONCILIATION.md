# AC reconciliation — closed disposition vocabulary

The architect's `task-stubbing` `result` MUST reconcile every acceptance criterion (AC) from the task brief against the stubs the architect just wrote. The reconciliation is what the PM validates before dispatching the developer. A missing AC, a fictional defer target, or a paragraph-shaped disposition is treated as an incomplete pre-flight — the PM bounces back to the architect with the gap quoted.

This file is the contract. The PM enforces it.

# The closed set

For each AC, pick **exactly one** disposition:

## `covered: <stub-or-symbol>`

The AC is satisfied by a slot in a stub the architect just wrote. Name the file and the symbol so the dev knows where to implement it.

- **Required shape:** `covered: <repo-relative-path> → <symbol-name>`.
- **Example:** `covered: src/loaders/home.ts → HomeLoaderData.heroCopy`.
- **Example:** `covered: src/components/SignupForm.tsx → SignupForm props.onSubmit`.
- **Anti-example:** `covered: the home loader handles this` — no path, no symbol. The dev cannot find the slot. Bounce.
- **Anti-example:** `covered: see stubs` — points at nothing specific. Bounce.

If a single AC requires changes in two stubs (e.g. a backend handler + a frontend hook), emit one `covered:` line per stub-and-symbol pair — do not collapse them into prose.

## `deferred-to: <task-or-context>`

The AC is real but belongs to a different task or has already shipped elsewhere. Name the concrete target.

- **Required shape:** either `deferred-to: TASK_<n>` (a task key in the same PRD's task list — verify with `read_task({prd, key})`) OR `deferred-to: existing: <repo-relative-path[ → symbol]>` (capability that already exists in the codebase).
- **Example:** `deferred-to: TASK_7` — the AC is in scope for PRD but TASK_7 owns it.
- **Example:** `deferred-to: existing: src/seo/head.ts → setMetaDescription` — already shipped; the dev just calls it.
- **Anti-example:** `deferred-to: a future task` — no key, no path. The PM cannot verify the defer target. Bounce.
- **Anti-example:** `deferred-to: the SEO work` — vague. Bounce.

If the architect cannot name a concrete defer target — the AC needs to land somewhere but no specific task or existing capability owns it — `deferred-to` is **NOT** available. Use `propose-adjust` on the whole task instead (escalate scope ambiguity to the PM rather than guessing).

The PM verifies every `deferred-to: TASK_<n>` by calling `read_task({prd, key})` and confirming the body covers the AC. The PM verifies every `deferred-to: existing: <path>` by reading the file and confirming the symbol exists. A defer target that doesn't actually cover the AC is treated as fictional — the dispatch bounces back to the architect or escalates to the user.

## `out-of-scope: <one-line why>`

The AC is in the brief but the architect judges it is not in scope for this PRD. Rare; always surfaces to the user.

- **Required shape:** `out-of-scope: <one-line reason>`.
- **Example:** `out-of-scope: caching behaviour belongs to PRD_31, not this PRD`.
- **Example:** `out-of-scope: the brief mentions email verification; that capability lives in the auth PRD which has not started`.
- **Anti-example:** `out-of-scope: too big` — no reason the PM (or the user) can evaluate. Bounce.

The PM does not silently accept `out-of-scope`. Every `out-of-scope:` line surfaces to the user; the user accepts, pushes back, or amends the brief. If the user pushes back, the dispatch comes back to the architect (often with a revised brief).

# Reconciliation discipline

- **One disposition per AC.** Not zero, not two. If an AC is compound ("X happens AND Y appears"), split it into two AC entries with one disposition each — over-listing is fine, folding is not.
- **Verbatim AC text.** Quote the AC from the brief; do not paraphrase. The PM's validation is a textual cross-check against the brief — paraphrased ACs make the validation impossible.
- **Numbered list, in brief order.** Easier for the PM to walk through linearly and for the dev to scan.
- **No prose disposition.** Every line starts with one of `covered:` / `deferred-to:` / `out-of-scope:`. A line that starts with anything else is rejected by the PM as a malformed disposition.

# Example reconciliation block

```
AC reconciliation:
1. "Home page renders the hero copy from the loader."
   covered: src/loaders/home.ts → HomeLoaderData.heroCopy
2. "Hero copy is localised per the request's Accept-Language header."
   covered: src/loaders/home.ts → HomeLoaderData.heroCopy (loader receives request, applies i18n.resolve)
3. "Page has a localised meta description."
   deferred-to: existing: src/seo/head.ts → setMetaDescription
4. "Lighthouse SEO score ≥ 90."
   covered: src/loaders/home.ts → HomeLoaderData.heroCopy (the hero copy slot + the existing setMetaDescription wire-up together drive the SEO score; no separate stub)
5. "Sign-up CTA tracks a `home_cta_click` analytics event."
   deferred-to: TASK_5
6. "Page supports server-rendered preview of unpublished content."
   out-of-scope: preview-mode rendering belongs to PRD_22, not this PRD
```

The PM validates this block field by field: AC text matches the brief, every `covered:` names a file+symbol that exists in the stubs the architect just wrote, every `deferred-to: TASK_<n>` resolves to a real task row (verify via `read_task({prd, key})`) whose `body_md` covers the AC, every `deferred-to: existing:` resolves to a real file+symbol on disk, every `out-of-scope:` is surfaced to the user before the dev is dispatched.
