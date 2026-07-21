/**
 * Built-in `Form` block → a real `<form>` wrapping the block's children
 * (external-data-sources Form slice (a)).
 *
 * The Form is an IMPLICIT container like List: any components render inside it,
 * their `<input name=…>` elements become the form's fields, and a
 * `type="submit"` button inside a child component triggers the form via native
 * `<form>` semantics — no JS wiring. The form posts to the Worker's ONE submit
 * endpoint in two modes:
 *   - NATIVE (baseline, no JS): a normal form-data POST; the endpoint answers
 *     with a 303 redirect (back to the page, or `formTarget.redirect`).
 *   - FETCH (progressive enhancement): `FORM_ENHANCE_SCRIPT` intercepts submit
 *     and sends the same FormData with `Accept: application/json`; the endpoint
 *     returns JSON and the script renders the success/error message inline in
 *     the `[data-form-status]` region.
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

/** The one submit endpoint both modes post to. */
export const FORM_SUBMIT_PATH = "/api/forms/submit";

/** Hidden identity field names (double-underscore = never collides with real
 *  visitor fields; the endpoint strips them before validation). */
export const FORM_PAGE_FIELD = "__bb_page";
export const FORM_BLOCK_FIELD = "__bb_block";

/** Default inline messages (fetch mode) when the author set none. */
export const FORM_DEFAULT_SUCCESS = "Thank you! Your submission was received.";
export const FORM_DEFAULT_ERROR = "Something went wrong. Please try again.";

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
      fetch(f.getAttribute('action'), {
        method: 'POST',
        body: new FormData(f),
        headers: { Accept: 'application/json' },
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) {
            show(true, f.getAttribute('data-form-success') || 'Thank you!');
            f.reset();
          } else {
            show(false, f.getAttribute('data-form-error') || 'Something went wrong.');
          }
        })
        .catch(function () {
          show(false, f.getAttribute('data-form-error') || 'Something went wrong.');
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
      status,
    ],
  };
}
