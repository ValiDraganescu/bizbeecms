/**
 * Built-in `Form` block → a real `<form>` wrapping the block's children
 * (external-data-sources Form slice (a)).
 *
 * The Form is an IMPLICIT container like List: any components render inside it,
 * their `<input name=…>` elements become the form's fields, and a
 * `type="submit"` button inside a child component triggers the form via native
 * `<form>` semantics — no JS wiring. The form posts to the Worker's ONE submit
 * endpoint in two modes:
 *   - NATIVE (form-data POST, JS still required — see below): the endpoint
 *     answers with a 303 redirect (back to the page, or `formTarget.redirect`).
 *   - FETCH (progressive enhancement): `FORM_ENHANCE_SCRIPT` intercepts submit
 *     and sends the same FormData with `Accept: application/json`; the endpoint
 *     returns JSON and the script renders the success/error message inline in
 *     the `[data-form-status]` region.
 *
 * BOT PROTECTION: every targeted Form carries an `<altcha-widget>` (self-hosted
 * ALTCHA proof-of-work) whose solved payload the submit endpoint REQUIRES and
 * burns single-use. Solving needs JS, so a no-JS visitor can render the form
 * but not submit it — an accepted trade (USER DECISION 2026-08-20).
 *
 * SECURITY: the form carries only the PAGE + BLOCK identity (hidden inputs).
 * The submit endpoint re-reads the target from the PUBLISHED page's blocks
 * server-side — a visitor can never point a submission at an arbitrary saved
 * request or collection. The api secret stays server-side (central engine).
 *
 * GRACEFUL: no target / un-hydrated page id → the children still render inside
 * a plain container (no dead `<form>` posting nowhere). PURE — no I/O.
 */
import {
  type Block,
  type ElementPlan,
  FORM_COMPONENT,
  GUEST_CHAT_COMPONENT,
  str,
} from "./plan-types.ts";
import { ALTCHA_FIELD, FORM_CHALLENGE_PATH } from "../forms/altcha-core.ts";

/** The one submit endpoint both modes post to. */
export const FORM_SUBMIT_PATH = "/api/forms/submit";

/** Hidden identity field names (double-underscore = never collides with real
 *  visitor fields; the endpoint strips them before validation). */
export const FORM_PAGE_FIELD = "__bb_page";
export const FORM_BLOCK_FIELD = "__bb_block";

/** Default inline messages (fetch mode) when the author set none. */
export const FORM_DEFAULT_SUCCESS = "Thank you! Your submission was received.";
export const FORM_DEFAULT_ERROR = "Something went wrong. Please try again.";

/** Where the self-hosted ALTCHA widget bundle is served from (copied into
 *  `public/` from the npm package by `scripts/copy-altcha.mjs` on install —
 *  no third-party host, published pages stay self-contained). */
export const ALTCHA_WIDGET_SRC = "/altcha.min.js";

/** Loader that ships the ALTCHA custom element once per document. The bundle
 *  is an ES module, so it rides in via a `type="module"` script tag appended
 *  by this tiny inline loader (the plan's script pipeline is inline-only). */
export const ALTCHA_LOADER_SCRIPT = `
(function () {
  if (window.customElements && customElements.get('altcha-widget')) return;
  if (document.querySelector('script[data-altcha-loader]')) return;
  var s = document.createElement('script');
  s.type = 'module';
  s.src = '${ALTCHA_WIDGET_SRC}';
  s.setAttribute('data-altcha-loader', '');
  document.head.appendChild(s);
})();
`.trim();

/** Stable asset key + client script for the fetch/JSON progressive enhancement. */
export const FORM_ENHANCE_ASSET_KEY = "__builtin_form_enhance__";

export const FORM_ENHANCE_SCRIPT = `
(function () {
  document.querySelectorAll('form[data-form]').forEach(function (f) {
    if (f.__bbForm) return;
    f.__bbForm = true;
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var status = f.querySelector('[data-form-status]');
      var show = function (ok, msg) {
        if (!status) return;
        status.hidden = false;
        status.setAttribute('data-state', ok ? 'ok' : 'error');
        status.textContent = msg;
      };
      var buttons = f.querySelectorAll('button[type="submit"],input[type="submit"]');
      buttons.forEach(function (b) { b.disabled = true; });
      var widget = f.querySelector('altcha-widget');
      var resetWidget = function () {
        if (widget && typeof widget.reset === 'function') widget.reset();
      };
      // Solve the PoW first if the visitor submitted before the widget
      // finished (or before its onfocus trigger ever fired).
      var payload = f.querySelector('input[name="${ALTCHA_FIELD}"]');
      var ready =
        widget && (!payload || !payload.value) && typeof widget.verify === 'function'
          ? widget.verify().catch(function () { return null; })
          : Promise.resolve(null);
      ready
        .then(function () {
          return fetch(f.getAttribute('action'), {
            method: 'POST',
            body: new FormData(f),
            headers: { Accept: 'application/json' },
          });
        })
        .then(function (r) {
          return r.json().then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          var j = res.body;
          if (j && j.ok) {
            show(true, f.getAttribute('data-form-success') || 'Thank you!');
            f.reset();
            resetWidget();
          } else {
            // 429 (one-per-window) and 403 (bot-protection) carry a
            // server-localized, self-correcting message — show it verbatim;
            // everything else shows the authored error. A used/failed PoW
            // payload can't be resubmitted — reset the widget so a retry
            // re-solves.
            var msg = (res.status === 429 || res.status === 403) && j && j.error
              ? j.error
              : f.getAttribute('data-form-error') || 'Something went wrong.';
            show(false, msg);
            resetWidget();
          }
        })
        .catch(function () {
          show(false, f.getAttribute('data-form-error') || 'Something went wrong.');
          resetWidget();
        })
        .finally(function () {
          buttons.forEach(function (b) { b.disabled = false; });
        });
    });
  });
})();
`.trim();

/**
 * Stamp the hosting page's id onto every identity-carrying built-in block
 * (recursively) so its planner can emit the hidden identity field:
 *   - Form      → `formPageId`      (hidden `__bb_page` input)
 *   - GuestChat → `guestChatPageId` (chat shell's identity data-attr)
 *
 * Renderer-host concern (buildPlanFromPage knows the page; the pure walk
 * doesn't). Both endpoints re-read the block from the PUBLISHED page server-side,
 * so the browser only ever carries page + block ids — never the target/agent.
 * PURE — returns the SAME array when no such block exists (zero-cost common page).
 */
export function stampBuiltinPageIds(blocks: Block[], pageId: string): Block[] {
  let changed = false;
  const out = blocks.map((b) => {
    const children = b.children ? stampBuiltinPageIds(b.children, pageId) : b.children;
    const withChildren = children ? { children } : {};
    if (b.component === FORM_COMPONENT) {
      changed = true;
      return { ...b, formPageId: pageId, ...withChildren };
    }
    if (b.component === GUEST_CHAT_COMPONENT) {
      changed = true;
      return { ...b, guestChatPageId: pageId, ...withChildren };
    }
    if (children !== b.children) {
      changed = true;
      return { ...b, children };
    }
    return b;
  });
  return changed ? out : blocks;
}

/**
 * Back-compat alias — the original Form-only name. Now that GuestChat needs the
 * same stamping walk, the generalized `stampBuiltinPageIds` is the canonical
 * entry point; this wrapper keeps the existing Form call sites/tests working.
 */
export function stampFormPageId(blocks: Block[], pageId: string): Block[] {
  return stampBuiltinPageIds(blocks, pageId);
}

/** Hidden input element plan. */
function hiddenInput(name: string, value: string): ElementPlan {
  return {
    kind: "element",
    tag: "input",
    props: { type: "hidden", name, value },
    children: [],
  };
}

/**
 * Plan one Form block. Children are planned via the shared `planBlock` (so
 * nested Sections/components/Lists render normally inside the form).
 */
export function planForm(
  block: Block,
  planBlock: (b: Block) => ElementPlan,
  useFormAssets?: () => void,
): ElementPlan {
  const children = (block.children ?? []).map(planBlock);
  const target = block.formTarget;

  // Un-targeted or un-hydrated (no page id — e.g. Develop preview) → a plain
  // container. The children still render; there's just nothing to submit to.
  if (!target?.kind || !block.formPageId) {
    return {
      kind: "element",
      tag: "div",
      props: { "data-form": block.id },
      children,
    };
  }

  useFormAssets?.();

  // ALTCHA proof-of-work widget (bot protection): fetches a challenge from
  // the Worker, solves it in-browser (auto-starts when the visitor focuses a
  // field), and drops the solved payload into a hidden `altcha` input the
  // submit endpoint REQUIRES. Self-hosted bundle — no third-party origin.
  const altcha: ElementPlan = {
    kind: "element",
    tag: "altcha-widget",
    props: {
      challenge: FORM_CHALLENGE_PATH,
      auto: "onfocus",
      name: ALTCHA_FIELD,
    },
    children: [],
  };

  const status: ElementPlan = {
    kind: "element",
    tag: "div",
    props: {
      "data-form-status": "",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    },
    children: [],
  };

  return {
    kind: "element",
    tag: "form",
    props: {
      "data-form": block.id,
      method: "POST",
      action: FORM_SUBMIT_PATH,
      "data-form-success": str(target.successMessage, FORM_DEFAULT_SUCCESS),
      "data-form-error": str(target.errorMessage, FORM_DEFAULT_ERROR),
    },
    children: [
      hiddenInput(FORM_PAGE_FIELD, block.formPageId),
      hiddenInput(FORM_BLOCK_FIELD, block.id),
      ...children,
      altcha,
      status,
    ],
  };
}
