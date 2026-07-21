/**
 * Built-in `GuestChat` renderer (pure) + its one self-contained client script.
 *
 * A renderer primitive (no D1 row) like Section/List/Form. It renders a chat
 * SHELL — an inline panel or a floating launcher+panel per `props.mode` — whose
 * client script POSTs the transcript to the Worker's public-chat endpoint and
 * streams the reply back into a growing assistant message.
 *
 * SECURITY (mirrors the Form model, plan-form.ts): the shell carries ONLY the
 * PAGE + BLOCK identity (data-attrs). The `agent` prop is resolved SERVER-SIDE
 * from the PUBLISHED page's blocks by the public-chat endpoint — it is NEVER
 * emitted to the DOM, so a visitor can never point a conversation at an arbitrary
 * agent, model, prompt, or tool set.
 *
 * GRACEFUL: un-stamped (no page id — Develop/Page-Builder preview) → an INERT
 * placeholder panel showing the title, no client script shipped, posts nowhere.
 *
 * PURE — no `@/`, React, D1, or CF imports; `.ts` relative imports only, so it
 * runs under the dep-free `node --test` suite (project convention).
 */

import { type Block, type ElementPlan, GUEST_CHAT_COMPONENT, str } from "./plan-types.ts";

/** The one public endpoint the widget POSTs to (server builds it in parallel).
 *  Contract: POST JSON `{ pageId, blockId, messages: [{role,content}] }`; the
 *  response is the site's SSE protocol (see sse.ts `frameEvent`): frames of
 *  `event: <type>\ndata: <json>\n\n` with types
 *  token {text} · tool {name,ok} · usage {…} · done {} · error {message}. */
export const PUBLIC_CHAT_PATH = "/api/public-chat";

/** Marks a GuestChat shell element for the client script to wire (once). */
const CHAT_ATTR = "data-bb-guest-chat";

/** Identity data-attrs — the ONLY thing the browser carries (agent stays server-side). */
const PAGE_ATTR = "data-bb-page";
const BLOCK_ATTR = "data-bb-block";

/** Presentation + copy data-attrs the script reads to build the UI. */
const MODE_ATTR = "data-bb-mode";
const TITLE_ATTR = "data-bb-title";
const PLACEHOLDER_ATTR = "data-bb-placeholder";
const WELCOME_ATTR = "data-bb-welcome";

/** Client-side hard cap on a single user message (server re-enforces its own). */
const MAX_USER_LEN = 2000;

/** Stable asset key so planPage ships the script + CSS at most once per page. */
export const GUEST_CHAT_ASSET_KEY = "__builtin_guest_chat__";

/** Default copy when the author set none. */
const DEFAULT_TITLE = "Chat with us";
const DEFAULT_PLACEHOLDER = "Type a message…";

/**
 * Widget CSS — shipped once via the asset seam (planPage pushes it onto
 * `plan.styles`, exactly like the combobox-list asset). Theme-driven: every
 * color comes from a CSS var so the widget inherits the Site's palette. Scoped to
 * `[data-bb-guest-chat]` so it can never leak onto author markup.
 */
export const GUEST_CHAT_CSS = `
[${CHAT_ATTR}] { font-size: 0.875rem; color: var(--color-foreground); }
[${CHAT_ATTR}] .bb-gc-hidden { display: none !important; }
[${CHAT_ATTR}].bb-gc-inline { display: block; }
[${CHAT_ATTR}].bb-gc-floating { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 2147482000; }
[${CHAT_ATTR}] .bb-gc-launcher { display: inline-flex; align-items: center; gap: 0.5rem; border: none; border-radius: 9999px; background: var(--color-primary); color: var(--color-on-primary, #fff); padding: 0.625rem 1rem; font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(0,0,0,.2); }
[${CHAT_ATTR}] .bb-gc-panel { display: flex; flex-direction: column; width: 100%; max-width: 24rem; height: 28rem; max-height: 70vh; border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 0.75rem; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1); }
[${CHAT_ATTR}].bb-gc-floating .bb-gc-panel { position: absolute; right: 0; bottom: calc(100% + 0.75rem); }
[${CHAT_ATTR}] .bb-gc-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); font-weight: 600; }
[${CHAT_ATTR}] .bb-gc-close { border: none; background: transparent; color: var(--color-foreground-muted); font-size: 1.25rem; line-height: 1; cursor: pointer; padding: 0 0.25rem; }
[${CHAT_ATTR}] .bb-gc-messages { flex: 1 1 0%; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
[${CHAT_ATTR}] .bb-gc-msg { max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 0.75rem; white-space: pre-wrap; word-break: break-word; }
[${CHAT_ATTR}] .bb-gc-msg-user { align-self: flex-end; background: var(--color-primary); color: var(--color-on-primary, #fff); }
[${CHAT_ATTR}] .bb-gc-msg-assistant { align-self: flex-start; background: var(--color-background); border: 1px solid var(--color-border); }
[${CHAT_ATTR}] .bb-gc-msg-system { align-self: center; background: transparent; color: var(--color-foreground-muted); font-size: 0.8125rem; text-align: center; }
[${CHAT_ATTR}] .bb-gc-working { align-self: flex-start; color: var(--color-foreground-muted); font-size: 0.8125rem; font-style: italic; }
[${CHAT_ATTR}] .bb-gc-form { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--color-border); }
[${CHAT_ATTR}] .bb-gc-input { flex: 1 1 0%; resize: none; min-height: 2.5rem; max-height: 8rem; border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-foreground); border-radius: 0.5rem; padding: 0.5rem 0.625rem; font: inherit; }
[${CHAT_ATTR}] .bb-gc-input:focus { outline: none; border-color: var(--color-primary); }
[${CHAT_ATTR}] .bb-gc-send { flex: none; align-self: flex-end; border: none; border-radius: 0.5rem; background: var(--color-primary); color: var(--color-on-primary, #fff); padding: 0.5rem 0.875rem; font: inherit; font-weight: 600; cursor: pointer; }
[${CHAT_ATTR}] .bb-gc-send:disabled, [${CHAT_ATTR}] .bb-gc-input:disabled { opacity: .5; cursor: not-allowed; }
`.trim();

/**
 * The one client script for every GuestChat shell on the page (shipped once).
 * Fully SELF-CONTAINED: no imports, no outer-scope references, browser-safe —
 * same style as LANGUAGE_SWITCHER_SCRIPT / FORM_ENHANCE_SCRIPT. It carries its
 * OWN tiny SSE frame parser (independent of client-sse.ts).
 */
export const GUEST_CHAT_SCRIPT = `
(function () {
  var ENDPOINT = ${JSON.stringify(PUBLIC_CHAT_PATH)};
  var MAX_LEN = ${MAX_USER_LEN};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Minimal SSE frame parser: frames separated by a blank line; each frame has an
  // "event:" line and one or more "data:" lines carrying JSON.
  function parseFrame(frame) {
    var event = "", dataLines = [];
    frame.split("\\n").forEach(function (line) {
      if (line.indexOf("event:") === 0) event = line.slice(6).trim();
      else if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).replace(/^ /, ""));
    });
    if (!event) return null;
    var data = {};
    var raw = dataLines.join("\\n");
    if (raw) { try { data = JSON.parse(raw); } catch (e) { return null; } }
    return { event: event, data: data };
  }

  function wire(root) {
    if (root.__bbWired) return;
    root.__bbWired = true;

    var pageId = root.getAttribute(${JSON.stringify(PAGE_ATTR)}) || "";
    var blockId = root.getAttribute(${JSON.stringify(BLOCK_ATTR)}) || "";
    var mode = root.getAttribute(${JSON.stringify(MODE_ATTR)}) || "inline";
    var title = root.getAttribute(${JSON.stringify(TITLE_ATTR)}) || ${JSON.stringify(DEFAULT_TITLE)};
    var placeholder = root.getAttribute(${JSON.stringify(PLACEHOLDER_ATTR)}) || ${JSON.stringify(DEFAULT_PLACEHOLDER)};
    var welcome = root.getAttribute(${JSON.stringify(WELCOME_ATTR)}) || "";
    var storeKey = "bb-guest-chat:" + blockId;

    // transcript = server-visible turns only (welcome is display-only, never sent).
    var transcript = [];
    try {
      var saved = sessionStorage.getItem(storeKey);
      if (saved) { var p = JSON.parse(saved); if (Array.isArray(p)) transcript = p; }
    } catch (e) {}

    // ── build the shell ──────────────────────────────────────────────────────
    var panel = el("div", "bb-gc-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);

    var header = el("div", "bb-gc-header");
    header.appendChild(el("span", null, title));
    var closeBtn = null;
    if (mode === "floating") {
      closeBtn = el("button", "bb-gc-close", "\\u00d7");
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("aria-label", "Close chat");
      header.appendChild(closeBtn);
    }
    panel.appendChild(header);

    var list = el("div", "bb-gc-messages");
    list.setAttribute("aria-live", "polite");
    list.setAttribute("role", "log");
    panel.appendChild(list);

    var form = el("form", "bb-gc-form");
    var input = el("textarea", "bb-gc-input");
    input.setAttribute("rows", "1");
    input.setAttribute("maxlength", String(MAX_LEN));
    input.setAttribute("placeholder", placeholder);
    input.setAttribute("aria-label", "Message");
    var send = el("button", "bb-gc-send", "Send");
    send.setAttribute("type", "submit");
    send.setAttribute("aria-label", "Send message");
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(form);

    // ── message rendering ────────────────────────────────────────────────────
    function bubble(role, text) {
      return el("div", "bb-gc-msg bb-gc-msg-" + role, text);
    }
    function scrollDown() { list.scrollTop = list.scrollHeight; }
    function render() {
      list.innerHTML = "";
      if (welcome) list.appendChild(bubble("assistant", welcome));
      transcript.forEach(function (m) { list.appendChild(bubble(m.role, m.content)); });
      scrollDown();
    }
    function persist() {
      try { sessionStorage.setItem(storeKey, JSON.stringify(transcript)); } catch (e) {}
    }
    render();

    // ── send / stream ────────────────────────────────────────────────────────
    var busy = false;
    function setBusy(on) {
      busy = on;
      input.disabled = on;
      send.disabled = on;
    }

    function send_message(text) {
      if (busy) return;
      text = (text || "").trim();
      if (!text) return;
      if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);
      transcript.push({ role: "user", content: text });
      persist();
      list.appendChild(bubble("user", text));
      input.value = "";
      setBusy(true);

      var working = el("div", "bb-gc-working", "working\\u2026");
      working.classList.add("bb-gc-hidden");
      list.appendChild(working);

      var assistantEl = null;
      var assistantText = "";
      function ensureAssistant() {
        if (!assistantEl) { assistantEl = bubble("assistant", ""); list.insertBefore(assistantEl, working); }
      }
      function notice(msg) {
        list.appendChild(bubble("system", msg));
        scrollDown();
      }

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: pageId, blockId: blockId, messages: transcript }),
      }).then(function (resp) {
        if (!resp.ok || !resp.body) {
          return resp.json().then(function (j) {
            // The endpoint's JSON failures carry { error } (429 rate/budget,
            // 400/409 sanitize, 404/503) — surface them verbatim.
            throw new Error((j && (j.error || j.message)) || "The assistant is unavailable right now.");
          }, function () {
            throw new Error("The assistant is unavailable right now.");
          });
        }
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        function handle(fr) {
          if (!fr) return;
          if (fr.event === "token" && typeof fr.data.text === "string") {
            ensureAssistant();
            assistantText += fr.data.text;
            assistantEl.textContent = assistantText;
            scrollDown();
          } else if (fr.event === "tool") {
            working.classList.remove("bb-gc-hidden");
            scrollDown();
          } else if (fr.event === "error") {
            notice((fr.data && fr.data.message) || "Something went wrong.");
          }
        }
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) {
              var last = parseFrame(buffer); if (last) handle(last);
              return;
            }
            buffer += decoder.decode(res.value, { stream: true });
            var sep;
            while ((sep = buffer.indexOf("\\n\\n")) !== -1) {
              handle(parseFrame(buffer.slice(0, sep)));
              buffer = buffer.slice(sep + 2);
            }
            working.classList.add("bb-gc-hidden");
            return pump();
          });
        }
        return pump();
      }).then(function () {
        working.remove();
        if (assistantText) {
          transcript.push({ role: "assistant", content: assistantText });
          persist();
        }
      }).catch(function (err) {
        working.remove();
        // Drop the just-appended failed user turn from the sent transcript so a
        // retry doesn't stack it twice; the visible bubble stays as history.
        if (transcript.length && transcript[transcript.length - 1].role === "user") {
          transcript.pop();
          persist();
        }
        notice((err && err.message) || "The assistant is unavailable right now.");
      }).then(function () {
        setBusy(false);
        input.focus();
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      send_message(input.value);
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send_message(input.value); }
    });

    // ── mount: inline shows the panel in place; floating toggles it ──────────
    if (mode === "floating") {
      var launcher = el("button", "bb-gc-launcher", title);
      launcher.setAttribute("type", "button");
      launcher.setAttribute("aria-label", title);
      panel.classList.add("bb-gc-hidden");
      function open() { panel.classList.remove("bb-gc-hidden"); launcher.classList.add("bb-gc-hidden"); input.focus(); scrollDown(); }
      function close() { panel.classList.add("bb-gc-hidden"); launcher.classList.remove("bb-gc-hidden"); }
      launcher.addEventListener("click", open);
      if (closeBtn) closeBtn.addEventListener("click", close);
      root.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
      root.appendChild(launcher);
      root.appendChild(panel);
    } else {
      root.appendChild(panel);
    }
  }

  document.querySelectorAll("[${CHAT_ATTR}]").forEach(wire);
})();
`.trim();

/**
 * Plan one GuestChat block into its shell. `onUse` is called (once) so the host
 * ships the client script + CSS.
 *
 * Un-stamped (no page id — Develop / Page-Builder preview) → an INERT placeholder
 * panel showing the title, so the builder shows something; NO onUse (no live
 * widget wires there, nothing to post to).
 *
 * The `agent` prop is deliberately NOT emitted — only page + block identity reach
 * the DOM (Form security model). The endpoint resolves the agent server-side.
 */
/**
 * Every distinct `props.agent` ref on the page's GuestChat blocks (recursive).
 * Pure — the render host resolves each ref to its agent row and feeds the
 * welcome texts back through `applyGuestChatWelcome`.
 */
export function collectGuestChatAgentRefs(blocks: Block[]): string[] {
  const refs = new Set<string>();
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.component === GUEST_CHAT_COMPONENT) {
        const ref = b.props?.agent;
        if (typeof ref === "string" && ref !== "") refs.add(ref);
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return [...refs];
}

/**
 * Hydrate each GuestChat block's welcome text from its AGENT's configured
 * `welcomeMessage` (the primary source — see the builtin description): a
 * non-empty block prop `welcome` is an explicit per-placement override and
 * wins; otherwise the agent's welcome (by `props.agent` ref) is written into
 * `props.welcome` for `planGuestChat` to emit. PURE — same array back when
 * nothing changes (zero-cost for pages without a GuestChat block).
 */
export function applyGuestChatWelcome(
  blocks: Block[],
  welcomeByRef: ReadonlyMap<string, string>,
): Block[] {
  let changed = false;
  const out = blocks.map((b) => {
    const children = b.children ? applyGuestChatWelcome(b.children, welcomeByRef) : b.children;
    if (b.component === GUEST_CHAT_COMPONENT && str(b.props?.welcome, "") === "") {
      const ref = b.props?.agent;
      const welcome = typeof ref === "string" ? (welcomeByRef.get(ref) ?? "") : "";
      if (welcome !== "") {
        changed = true;
        return {
          ...b,
          props: { ...(b.props ?? {}), welcome },
          ...(children ? { children } : {}),
        };
      }
    }
    if (children !== b.children) {
      changed = true;
      return { ...b, children };
    }
    return b;
  });
  return changed ? out : blocks;
}

export function planGuestChat(block: Block, onUse?: () => void): ElementPlan {
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const title = str(props.title, DEFAULT_TITLE);
  const mode = props.mode === "floating" ? "floating" : "inline";

  // Un-stamped (preview/Develop): inert placeholder — a static panel with the
  // title so the builder canvas shows the block. No script, posts nowhere.
  if (!block.guestChatPageId) {
    return {
      kind: "element",
      tag: "div",
      props: {
        [CHAT_ATTR]: "",
        "data-bb-inert": "",
        className: `bb-guest-chat-inert border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-foreground)] rounded-xl p-4 text-sm`,
      },
      children: [
        {
          kind: "element",
          tag: "div",
          props: { className: "font-semibold" },
          children: [{ kind: "text", text: title }],
        },
        {
          kind: "element",
          tag: "div",
          props: {
            className: "text-[color:var(--color-foreground-muted)] mt-1",
          },
          children: [{ kind: "text", text: "Chat preview (published page only)" }],
        },
      ],
    };
  }

  onUse?.();

  const placeholder = str(props.placeholder, DEFAULT_PLACEHOLDER);
  const welcome = str(props.welcome, "");

  return {
    kind: "element",
    tag: "div",
    props: {
      [CHAT_ATTR]: "",
      className: mode === "floating" ? "bb-gc-floating" : "bb-gc-inline",
      [PAGE_ATTR]: block.guestChatPageId,
      [BLOCK_ATTR]: block.id,
      [MODE_ATTR]: mode,
      [TITLE_ATTR]: title,
      [PLACEHOLDER_ATTR]: placeholder,
      ...(welcome ? { [WELCOME_ATTR]: welcome } : {}),
    },
    children: [],
  };
}
