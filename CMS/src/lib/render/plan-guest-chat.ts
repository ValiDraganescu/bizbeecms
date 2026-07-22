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

/** Present (empty value) when the block opts into the chat icon (props.showIcon). */
const ICON_ATTR = "data-bb-icon";
const PLACEHOLDER_ATTR = "data-bb-placeholder";
const WELCOME_ATTR = "data-bb-welcome";

/** Client-side hard cap on a single user message (server re-enforces its own). */
const MAX_USER_LEN = 2000;

/**
 * A stored conversation is abandoned after this much visitor inactivity: on the
 * next load OR the next send in a long-idle open tab, the transcript is
 * discarded and a fresh conversationId minted (each turn stamps `lastAt`).
 */
export const GUEST_CHAT_IDLE_RESET_MS = 30 * 60 * 1000;

/**
 * DOM-free markdown tokenizer for assistant bubbles (models format replies in
 * markdown). Shared verbatim between the widget script (interpolated below) and
 * the pure tests (evaluated via `new Function`) so there is ONE implementation.
 * Deliberately tiny: paragraphs, #-headings, dash/star and 1. lists, fenced
 * code, \`code\`, **bold**, star or underscore emphasis, [links](url). Emits a
 * token TREE only — the
 * DOM is built element-by-element in the script (model text never reaches
 * innerHTML), and mdSafeHref allowlists http(s)/mailto/site-relative hrefs
 * (NOT protocol-relative //host, which would leave the site).
 */
export const GUEST_CHAT_MD_SOURCE = `
  function mdSafeHref(h) {
    return /^(https?:\\/\\/|mailto:|\\/(?!\\/))/i.test(h || "") ? h : "";
  }
  function mdInline(s) {
    var out = [];
    var re = /(\`([^\`]+)\`)|(\\*\\*([^*]+)\\*\\*)|(\\[([^\\]]+)\\]\\(([^)\\s]+)\\))|(\\*([^*\\s][^*]*)\\*)|(\\b_([^_]+)_\\b)/;
    while (s) {
      var m = re.exec(s);
      if (!m) { out.push({ t: "text", s: s }); break; }
      if (m.index > 0) out.push({ t: "text", s: s.slice(0, m.index) });
      if (m[2]) out.push({ t: "code", s: m[2] });
      else if (m[4]) out.push({ t: "strong", kids: mdInline(m[4]) });
      else if (m[6]) out.push({ t: "link", s: m[6], href: m[7] });
      else if (m[9]) out.push({ t: "em", kids: mdInline(m[9]) });
      else out.push({ t: "em", kids: mdInline(m[11]) });
      s = s.slice(m.index + m[0].length);
    }
    return out;
  }
  function mdParse(text) {
    var blocks = [];
    var lines = String(text == null ? "" : text).replace(/\\r\\n?/g, "\\n").split("\\n");
    var i = 0, m;
    var structural = /^(\`\`\`|#{1,6}\\s|\\s*[-*]\\s+|\\s*\\d+[.)]\\s+)/;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\`\`\`/.test(line)) {
        var buf = [];
        i++;
        while (i < lines.length && !/^\`\`\`/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        blocks.push({ t: "pre", s: buf.join("\\n") });
        continue;
      }
      if (!line.trim()) { i++; continue; }
      if ((m = /^(#{1,6})\\s+(.*)$/.exec(line))) {
        blocks.push({ t: "h", kids: mdInline(m[2]) });
        i++;
        continue;
      }
      if (/^\\s*[-*]\\s+/.test(line)) {
        var items = [];
        while (i < lines.length && (m = /^\\s*[-*]\\s+(.*)$/.exec(lines[i]))) { items.push(mdInline(m[1])); i++; }
        blocks.push({ t: "ul", items: items });
        continue;
      }
      if (/^\\s*\\d+[.)]\\s+/.test(line)) {
        var oItems = [];
        while (i < lines.length && (m = /^\\s*\\d+[.)]\\s+(.*)$/.exec(lines[i]))) { oItems.push(mdInline(m[1])); i++; }
        blocks.push({ t: "ol", items: oItems });
        continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() && !structural.test(lines[i])) { para.push(mdInline(lines[i])); i++; }
      blocks.push({ t: "p", lines: para });
    }
    return blocks;
  }
`;

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
/* Floating: the panel is absolutely positioned inside the fixed root, and once
   the launcher hides the root has NO in-flow content — its width collapses to 0
   and a percentage width would resolve to 0 (the zero-width-panel bug). So the
   floating panel sizes ITSELF: 24rem, clamped to the viewport on small screens. */
[${CHAT_ATTR}].bb-gc-floating .bb-gc-panel { position: absolute; right: 0; bottom: calc(100% + 0.75rem); width: min(24rem, calc(100vw - 2.5rem)); max-width: none; }
[${CHAT_ATTR}] .bb-gc-htitle { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; }
[${CHAT_ATTR}] .bb-gc-icon { display: inline-flex; flex: none; }
[${CHAT_ATTR}] .bb-gc-icon svg { width: 1.125em; height: 1.125em; }
[${CHAT_ATTR}] .bb-gc-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); font-weight: 600; }
[${CHAT_ATTR}] .bb-gc-close { border: none; background: transparent; color: var(--color-foreground-muted); font-size: 1.25rem; line-height: 1; cursor: pointer; padding: 0 0.25rem; }
[${CHAT_ATTR}] .bb-gc-messages { flex: 1 1 0%; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
[${CHAT_ATTR}] .bb-gc-msg { max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 0.75rem; white-space: pre-wrap; word-break: break-word; }
[${CHAT_ATTR}] .bb-gc-msg-user { align-self: flex-end; background: var(--color-primary); color: var(--color-on-primary, #fff); }
[${CHAT_ATTR}] .bb-gc-msg-assistant { align-self: flex-start; background: var(--color-background); border: 1px solid var(--color-border); }
[${CHAT_ATTR}] .bb-gc-msg-system { align-self: center; background: transparent; color: var(--color-foreground-muted); font-size: 0.8125rem; text-align: center; }
/* Markdown inside assistant bubbles (built from the safe token tree). */
[${CHAT_ATTR}] .bb-gc-msg p { margin: 0; }
[${CHAT_ATTR}] .bb-gc-msg p + p, [${CHAT_ATTR}] .bb-gc-msg p + ul, [${CHAT_ATTR}] .bb-gc-msg p + ol, [${CHAT_ATTR}] .bb-gc-msg p + pre, [${CHAT_ATTR}] .bb-gc-msg ul + p, [${CHAT_ATTR}] .bb-gc-msg ol + p, [${CHAT_ATTR}] .bb-gc-msg pre + p { margin-top: 0.5em; }
[${CHAT_ATTR}] .bb-gc-msg ul, [${CHAT_ATTR}] .bb-gc-msg ol { margin: 0.25em 0; padding-left: 1.25em; }
[${CHAT_ATTR}] .bb-gc-msg li { margin: 0.125em 0; }
[${CHAT_ATTR}] .bb-gc-msg code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; background: color-mix(in srgb, currentColor 10%, transparent); border-radius: 0.25rem; padding: 0.0625rem 0.25rem; }
[${CHAT_ATTR}] .bb-gc-msg pre { margin: 0.25em 0; padding: 0.5rem 0.625rem; overflow-x: auto; background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 0.5rem; }
[${CHAT_ATTR}] .bb-gc-msg pre code { background: transparent; padding: 0; }
[${CHAT_ATTR}] .bb-gc-msg a { color: inherit; text-decoration: underline; }
[${CHAT_ATTR}] .bb-gc-time { font-size: 0.6875rem; color: var(--color-foreground-muted); margin-top: 0.125rem; }
[${CHAT_ATTR}] .bb-gc-time-user { align-self: flex-end; text-align: right; }
[${CHAT_ATTR}] .bb-gc-time-assistant { align-self: flex-start; text-align: left; }
/* Typing indicator: three pulsing dots below the streamed text, visible from
   send until the stream ends (covers pauses between tool calls). */
[${CHAT_ATTR}] .bb-gc-working { align-self: flex-start; display: flex; gap: 0.25rem; padding: 0.25rem 0.125rem; color: var(--color-foreground-muted); }
[${CHAT_ATTR}] .bb-gc-dot { width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: currentColor; animation: bb-gc-blink 1.2s ease-in-out infinite; }
[${CHAT_ATTR}] .bb-gc-dot:nth-child(2) { animation-delay: 0.2s; }
[${CHAT_ATTR}] .bb-gc-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bb-gc-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [${CHAT_ATTR}] .bb-gc-dot { animation: none; opacity: 0.6; } }
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
  var IDLE_RESET_MS = ${GUEST_CHAT_IDLE_RESET_MS};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // A random 8-4-4-4-12 hex string when crypto.randomUUID is unavailable.
  function randomId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var s = "";
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) { s += "-"; }
      else { s += Math.floor(Math.random() * 16).toString(16); }
    }
    return s;
  }

  // IANA time-zone name, "" when the browser can't resolve one.
  function tz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; }
  }

  // ISO-8601 LOCAL time with numeric offset, e.g. "2026-07-22T15:48:59+03:00".
  // Built by hand from the local date parts + getTimezoneOffset (toISOString is
  // UTC, which is NOT what the contract wants).
  function localIso() {
    var d = new Date();
    var off = -d.getTimezoneOffset(); // east of UTC positive
    var sign = off >= 0 ? "+" : "-";
    var abs = Math.abs(off);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  // Display HH:MM straight from a stored 'at' string's time part — no Date
  // re-parse (avoids tz drift). Returns "" for a missing/unparseable value.
  function clockOf(at) {
    if (typeof at !== "string") return "";
    var m = /T(\\d{2}):(\\d{2})/.exec(at);
    return m ? m[1] + ":" + m[2] : "";
  }

${GUEST_CHAT_MD_SOURCE}
  // Markdown token tree → DOM, element-by-element (model text only ever lands in
  // text nodes — never innerHTML). Unsafe link hrefs degrade to plain text.
  function mdInlineInto(node, toks) {
    toks.forEach(function (tk) {
      if (tk.t === "code") { node.appendChild(el("code", null, tk.s)); }
      else if (tk.t === "strong" || tk.t === "em") {
        var e = el(tk.t);
        mdInlineInto(e, tk.kids);
        node.appendChild(e);
      } else if (tk.t === "link") {
        var href = mdSafeHref(tk.href);
        if (!href) { node.appendChild(document.createTextNode(tk.s)); return; }
        var a = el("a", null, tk.s);
        a.setAttribute("href", href);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        node.appendChild(a);
      } else { node.appendChild(document.createTextNode(tk.s)); }
    });
  }
  function mdInto(node, text) {
    node.innerHTML = "";
    mdParse(text).forEach(function (b) {
      if (b.t === "pre") {
        var pre = el("pre");
        pre.appendChild(el("code", null, b.s));
        node.appendChild(pre);
      } else if (b.t === "ul" || b.t === "ol") {
        var listNode = el(b.t);
        b.items.forEach(function (it) {
          var li = el("li");
          mdInlineInto(li, it);
          listNode.appendChild(li);
        });
        node.appendChild(listNode);
      } else if (b.t === "h") {
        var hp = el("p");
        var st = el("strong");
        mdInlineInto(st, b.kids);
        hp.appendChild(st);
        node.appendChild(hp);
      } else {
        var p = el("p");
        b.lines.forEach(function (ln, idx) {
          if (idx) p.appendChild(el("br"));
          mdInlineInto(p, ln);
        });
        node.appendChild(p);
      }
    });
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
    var showIcon = root.getAttribute(${JSON.stringify(ICON_ATTR)}) !== null;
    var storeKey = "bb-guest-chat:" + blockId;

    // Static chat-bubble glyph (no user data — innerHTML is safe here).
    var ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    function chatIcon() {
      var s = el("span", "bb-gc-icon");
      s.innerHTML = ICON_SVG;
      return s;
    }

    // transcript = server-visible turns only (welcome is display-only, never sent).
    // Persisted shape: { conversationId, lastAt (epoch ms), messages:
    // [{role,content,at?}] }. Old stored blobs were a BARE ARRAY of messages (no
    // conversationId, no 'at', no lastAt) — still accepted here; a fresh
    // conversationId is minted for them and lastAt is stamped on next persist.
    // A conversation idle past IDLE_RESET_MS is abandoned: transcript dropped,
    // new conversationId (stale blobs without lastAt are kept — never reset a
    // conversation we can't date).
    var transcript = [];
    var conversationId = "";
    var lastAt = 0;
    try {
      var saved = sessionStorage.getItem(storeKey);
      if (saved) {
        var p = JSON.parse(saved);
        if (Array.isArray(p)) { transcript = p; }
        else if (p && Array.isArray(p.messages)) {
          transcript = p.messages;
          if (typeof p.conversationId === "string") conversationId = p.conversationId;
          if (typeof p.lastAt === "number") lastAt = p.lastAt;
        }
      }
    } catch (e) {}
    function idleExpired() {
      return transcript.length > 0 && lastAt > 0 && Date.now() - lastAt > IDLE_RESET_MS;
    }
    if (idleExpired()) {
      transcript = [];
      conversationId = "";
      lastAt = 0;
      try { sessionStorage.removeItem(storeKey); } catch (e) {}
    }
    if (!conversationId) conversationId = randomId();

    // ── build the shell ──────────────────────────────────────────────────────
    var panel = el("div", "bb-gc-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);

    var header = el("div", "bb-gc-header");
    var htitle = el("span", "bb-gc-htitle");
    if (showIcon) htitle.appendChild(chatIcon());
    htitle.appendChild(el("span", null, title));
    header.appendChild(htitle);
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
    // Assistant text is model-authored markdown → rendered via the safe token
    // tree; user/system text stays literal.
    function bubble(role, text) {
      if (role !== "assistant") return el("div", "bb-gc-msg bb-gc-msg-" + role, text);
      var b = el("div", "bb-gc-msg bb-gc-msg-assistant");
      if (text) mdInto(b, text);
      return b;
    }
    // A muted HH:MM label under a user/assistant bubble, derived from a stored
    // 'at'. No label when 'at' is missing (old transcripts / streaming bubble).
    function timeLabel(role, at) {
      var clock = clockOf(at);
      return clock ? el("div", "bb-gc-time bb-gc-time-" + role, clock) : null;
    }
    // Append a bubble and (when the turn is timestamped) its time label. The
    // welcome bubble and system notices pass no 'at' → no label.
    function appendTurn(role, text, at) {
      list.appendChild(bubble(role, text));
      var t = timeLabel(role, at);
      if (t) list.appendChild(t);
    }
    function scrollDown() { list.scrollTop = list.scrollHeight; }
    function render() {
      list.innerHTML = "";
      if (welcome) list.appendChild(bubble("assistant", welcome));
      transcript.forEach(function (m) { appendTurn(m.role, m.content, m.at); });
      scrollDown();
    }
    function persist() {
      lastAt = Date.now();
      try {
        sessionStorage.setItem(storeKey, JSON.stringify({ conversationId: conversationId, lastAt: lastAt, messages: transcript }));
      } catch (e) {}
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
      // A tab left open past the idle window starts over: the stale transcript
      // is dropped and this message opens a fresh conversation.
      if (idleExpired()) {
        transcript = [];
        conversationId = randomId();
        render();
      }
      var at = localIso();
      transcript.push({ role: "user", content: text, at: at });
      persist();
      appendTurn("user", text, at);
      input.value = "";
      setBusy(true);

      // Animated-ellipsis typing indicator, shown for the WHOLE request (it sits
      // after the assistant bubble, so it reads as "more coming" during pauses
      // between tool calls); removed when the stream settles.
      var working = el("div", "bb-gc-working");
      working.setAttribute("role", "status");
      working.setAttribute("aria-label", "Assistant is typing");
      for (var di = 0; di < 3; di++) working.appendChild(el("span", "bb-gc-dot"));
      list.appendChild(working);
      scrollDown();

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
        body: JSON.stringify({
          pageId: pageId,
          blockId: blockId,
          conversationId: conversationId,
          timezone: tz(),
          utcOffsetMinutes: -new Date().getTimezoneOffset(),
          messages: transcript,
        }),
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
            mdInto(assistantEl, assistantText);
            scrollDown();
          } else if (fr.event === "tool") {
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
            return pump();
          });
        }
        return pump();
      }).then(function () {
        working.remove();
        if (assistantText) {
          // Stamp 'at' when the stream completes (the 'done' frame). The bubble
          // grew live without a timestamp; add its label now, next to it.
          var at = localIso();
          transcript.push({ role: "assistant", content: assistantText, at: at });
          persist();
          var t = timeLabel("assistant", at);
          if (t) {
            if (assistantEl && assistantEl.parentNode) assistantEl.parentNode.insertBefore(t, assistantEl.nextSibling);
            else list.appendChild(t);
            scrollDown();
          }
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
      var launcher = el("button", "bb-gc-launcher");
      if (showIcon) launcher.appendChild(chatIcon());
      launcher.appendChild(el("span", null, title));
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
  // Opt-in chat icon (launcher + header). Accept the boolean or its string form
  // (props travel through JSON columns and tool args interchangeably).
  const showIcon = props.showIcon === true || props.showIcon === "true";

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
      ...(showIcon ? { [ICON_ATTR]: "" } : {}),
    },
    children: [],
  };
}
