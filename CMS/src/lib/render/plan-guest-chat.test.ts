import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planGuestChat,
  collectGuestChatAgentRefs,
  applyGuestChatWelcome,
  GUEST_CHAT_SCRIPT,
  GUEST_CHAT_CSS,
  PUBLIC_CHAT_PATH,
  GUEST_CHAT_IDLE_RESET_MS,
  GUEST_CHAT_MD_SOURCE,
} from "./plan-guest-chat.ts";
import { stampBuiltinPageIds, stampFormPageId } from "./plan-form.ts";
import { planPage } from "./tree.ts";
import { GUEST_CHAT_COMPONENT, type Block, type ElementPlan } from "./plan-types.ts";

/** Only element plans carry props/children. Narrow once for the assertions. */
function elem(plan: ElementPlan): Extract<ElementPlan, { kind: "element" }> {
  assert.equal(plan.kind, "element");
  return plan as Extract<ElementPlan, { kind: "element" }>;
}

const stamped = (props?: Record<string, unknown>): Block => ({
  id: "gc1",
  component: GUEST_CHAT_COMPONENT,
  guestChatPageId: "page-7",
  ...(props ? { props } : {}),
});

test("stamped inline shell carries page+block identity and inline class, never the agent", () => {
  let used = 0;
  const plan = elem(planGuestChat(stamped({ agent: "secret-agent", mode: "inline", title: "Ask us" }), () => used++));
  assert.equal(plan.props["data-bb-guest-chat"], "");
  assert.equal(plan.props["data-bb-page"], "page-7");
  assert.equal(plan.props["data-bb-block"], "gc1");
  assert.equal(plan.props["data-bb-mode"], "inline");
  assert.equal(plan.props["data-bb-title"], "Ask us");
  assert.equal(plan.props.className, "bb-gc-inline");
  // Security: the agent id/name must NEVER reach the DOM.
  assert.equal(JSON.stringify(plan.props).includes("secret-agent"), false);
  assert.equal(used, 1, "onUse fires exactly once for a live shell");
});

test("floating mode sets the floating class + mode attr", () => {
  const plan = elem(planGuestChat(stamped({ mode: "floating" }), () => {}));
  assert.equal(plan.props["data-bb-mode"], "floating");
  assert.equal(plan.props.className, "bb-gc-floating");
});

test("showIcon opts into the icon attr (boolean or string form); absent by default", () => {
  const on = elem(planGuestChat(stamped({ showIcon: true }), () => {}));
  assert.equal(on.props["data-bb-icon"], "");
  const str = elem(planGuestChat(stamped({ showIcon: "true" }), () => {}));
  assert.equal(str.props["data-bb-icon"], "");
  const off = elem(planGuestChat(stamped(), () => {}));
  assert.equal("data-bb-icon" in off.props, false);
  const falsy = elem(planGuestChat(stamped({ showIcon: false }), () => {}));
  assert.equal("data-bb-icon" in falsy.props, false);
});

test("welcome prop is emitted only when present", () => {
  const withWelcome = elem(planGuestChat(stamped({ welcome: "Hi there" }), () => {}));
  assert.equal(withWelcome.props["data-bb-welcome"], "Hi there");
  const without = elem(planGuestChat(stamped(), () => {}));
  assert.equal("data-bb-welcome" in without.props, false);
});

test("un-stamped block renders an inert placeholder with the title and ships NO asset", () => {
  let used = 0;
  const block: Block = { id: "gc1", component: GUEST_CHAT_COMPONENT, props: { title: "Support" } };
  const plan = elem(planGuestChat(block, () => used++));
  assert.equal(used, 0, "no client asset requested for a preview placeholder");
  assert.equal(plan.props["data-bb-inert"], "");
  assert.equal("data-bb-page" in plan.props, false, "no identity posted from the preview");
  // The title is shown so the builder canvas has something to display.
  assert.ok(JSON.stringify(plan.children).includes("Support"));
});

test("mode falls back to inline for an unknown/absent mode value", () => {
  assert.equal(elem(planGuestChat(stamped(), () => {})).props["data-bb-mode"], "inline");
  assert.equal(elem(planGuestChat(stamped({ mode: "bogus" }), () => {})).props["data-bb-mode"], "inline");
});

test("planPage ships the guest-chat script + CSS once for two stamped shells", () => {
  const blocks: Block[] = [stamped(), { ...stamped(), id: "gc2" }];
  const plan = planPage(blocks, new Map());
  assert.equal(plan.scripts.filter((s) => s === GUEST_CHAT_SCRIPT).length, 1, "script deduped");
  assert.equal(plan.styles.filter((s) => s === GUEST_CHAT_CSS).length, 1, "CSS deduped");
});

test("planPage ships no guest-chat asset for an un-stamped (preview) shell", () => {
  const blocks: Block[] = [{ id: "gc1", component: GUEST_CHAT_COMPONENT }];
  const plan = planPage(blocks, new Map());
  assert.equal(plan.scripts.includes(GUEST_CHAT_SCRIPT), false);
  assert.equal(plan.styles.includes(GUEST_CHAT_CSS), false);
});

test("the client script is self-contained and posts to the public-chat endpoint", () => {
  assert.ok(GUEST_CHAT_SCRIPT.includes(JSON.stringify(PUBLIC_CHAT_PATH)), "endpoint constant inlined");
  assert.ok(GUEST_CHAT_SCRIPT.includes("__bbWired"), "wires each shell once");
  assert.ok(GUEST_CHAT_SCRIPT.includes("sessionStorage"), "persists the transcript");
  assert.ok(GUEST_CHAT_SCRIPT.includes("aria-live"), "message list is a live region");
  // No leaked build-time interpolation placeholders.
  assert.equal(GUEST_CHAT_SCRIPT.includes("undefined"), false);
});

test("the POST body carries the new wire-contract fields", () => {
  assert.ok(GUEST_CHAT_SCRIPT.includes("conversationId:"), "conversationId in the body");
  assert.ok(GUEST_CHAT_SCRIPT.includes("timezone:"), "timezone in the body");
  assert.ok(GUEST_CHAT_SCRIPT.includes("utcOffsetMinutes:"), "utcOffsetMinutes in the body");
  // The offset uses the sign the contract mandates (east of UTC positive).
  assert.ok(GUEST_CHAT_SCRIPT.includes("-new Date().getTimezoneOffset()"), "offset sign flipped");
});

test("idle reset: 30-min window inlined, stale transcripts dropped on load AND on send", () => {
  assert.equal(GUEST_CHAT_IDLE_RESET_MS, 30 * 60 * 1000);
  assert.ok(
    GUEST_CHAT_SCRIPT.includes(`var IDLE_RESET_MS = ${GUEST_CHAT_IDLE_RESET_MS};`),
    "timeout constant inlined into the script",
  );
  assert.ok(GUEST_CHAT_SCRIPT.includes("lastAt: lastAt"), "persist stamps the activity time");
  // The expiry check must gate BOTH entry points: restore-on-load and the next
  // send in a tab left open past the window (load + send call sites).
  const checks = GUEST_CHAT_SCRIPT.match(/idleExpired\(\)/g) ?? [];
  assert.ok(checks.length >= 3, "idleExpired defined and called on load + send");
});

// The tokenizer ships as source text (interpolated into the widget script);
// evaluate that exact repo constant here so ONE implementation is under test.
type Tok = { t: string; s?: string; href?: string; kids?: Tok[] };
type MdBlock = { t: string; s?: string; items?: Tok[][]; lines?: Tok[][]; kids?: Tok[] };
const { mdParse, mdInline, mdSafeHref } = new Function(
  `${GUEST_CHAT_MD_SOURCE}; return { mdParse, mdInline, mdSafeHref };`,
)() as {
  mdParse: (t: unknown) => MdBlock[];
  mdInline: (t: string) => Tok[];
  mdSafeHref: (h: unknown) => string;
};

test("markdown: source interpolated into the script + assistant-only rendering", () => {
  assert.ok(GUEST_CHAT_SCRIPT.includes(GUEST_CHAT_MD_SOURCE), "tokenizer source shipped in the script");
  assert.ok(GUEST_CHAT_SCRIPT.includes("mdInto(assistantEl, assistantText)"), "streamed bubble re-renders as markdown");
  assert.ok(GUEST_CHAT_SCRIPT.includes('if (role !== "assistant")'), "user/system bubbles stay literal text");
  assert.ok(GUEST_CHAT_CSS.includes(".bb-gc-msg code"), "markdown CSS shipped");
});

test("streaming: text after a tool round starts a new paragraph in the same bubble", () => {
  // One reply spans several model rounds separated by tool calls; without the
  // break the post-tool text runs on inline ("…for you now.Your table is booked").
  assert.ok(GUEST_CHAT_SCRIPT.includes("var pendingBreak = false;"), "break flag exists");
  assert.ok(GUEST_CHAT_SCRIPT.includes('pendingBreak = true;'), "tool frame arms the break");
  assert.ok(
    GUEST_CHAT_SCRIPT.includes('if (assistantText) assistantText += "\\n\\n";'),
    "next token after a tool inserts a paragraph break (only between text segments)",
  );
});

test("markdown: bold inside list items (the screenshot case)", () => {
  const blocks = mdParse("For **2 guests tomorrow**, open:\n\n- **18:00**\n- **18:30**\n\nWhich time?");
  assert.deepEqual(blocks.map((b) => b.t), ["p", "ul", "p"]);
  const ul = blocks[1];
  assert.equal(ul.items?.length, 2);
  assert.deepEqual(ul.items?.[0], [{ t: "strong", kids: [{ t: "text", s: "18:00" }] }]);
  const para = blocks[0].lines?.[0];
  assert.deepEqual(para?.map((tk) => tk.t), ["text", "strong", "text"]);
});

test("markdown: paragraphs split on blank lines; single newlines stay in one block", () => {
  const blocks = mdParse("line one\nline two\n\nsecond para");
  assert.deepEqual(blocks.map((b) => b.t), ["p", "p"]);
  assert.equal(blocks[0].lines?.length, 2, "soft-wrapped lines kept (rendered with <br>)");
});

test("markdown: ordered lists, headings, fenced code, inline code, em variants", () => {
  const blocks = mdParse("## Times\n1. first\n2) second\n```\nraw <b>kept</b>\n```\ncall `now()` or *soon* or _later_");
  assert.deepEqual(blocks.map((b) => b.t), ["h", "ol", "pre", "p"]);
  assert.equal(blocks[1].items?.length, 2);
  assert.equal(blocks[2].s, "raw <b>kept</b>", "fence content untouched (lands in a text node)");
  const inline = blocks[3].lines?.[0] ?? [];
  assert.deepEqual(inline.filter((tk) => tk.t !== "text").map((tk) => tk.t), ["code", "em", "em"]);
});

test("markdown: snake_case and bare asterisks are NOT emphasis; no-md text passes through", () => {
  assert.deepEqual(mdInline("use snake_case_name and 2 * 3 * 4"), [
    { t: "text", s: "use snake_case_name and 2 * 3 * 4" },
  ]);
  assert.deepEqual(mdParse("just a plain reply"), [
    { t: "p", lines: [[{ t: "text", s: "just a plain reply" }]] },
  ]);
  assert.deepEqual(mdParse(null), [], "null/undefined → no blocks");
});

test("markdown: link hrefs are allowlisted — dangerous schemes degrade to text", () => {
  assert.deepEqual(mdInline("see [our menu](https://x.y/menu)")[1], {
    t: "link",
    s: "our menu",
    href: "https://x.y/menu",
  });
  assert.equal(mdSafeHref("https://x.y/menu"), "https://x.y/menu");
  assert.equal(mdSafeHref("mailto:hi@x.y"), "mailto:hi@x.y");
  assert.equal(mdSafeHref("/contact"), "/contact");
  // eslint-disable-next-line no-script-url
  assert.equal(mdSafeHref("javascript:alert(1)"), "");
  assert.equal(mdSafeHref("data:text/html,x"), "");
  assert.equal(mdSafeHref("//evil.example"), "", "protocol-relative rejected");
  assert.equal(mdSafeHref(undefined), "");
});

test("typing indicator: animated dots shipped, always-on while streaming (no toggling)", () => {
  assert.ok(GUEST_CHAT_CSS.includes(".bb-gc-dot"), "dot class in the CSS");
  assert.ok(GUEST_CHAT_CSS.includes("@keyframes bb-gc-blink"), "pulse animation defined");
  assert.ok(GUEST_CHAT_CSS.includes("prefers-reduced-motion"), "reduced-motion fallback");
  assert.ok(GUEST_CHAT_SCRIPT.includes('el("span", "bb-gc-dot")'), "script builds the dots");
  // The indicator lives for the whole request (visible during tool-call pauses):
  // nothing hides it mid-stream; it is only removed when the stream settles.
  assert.equal(GUEST_CHAT_SCRIPT.includes('working.classList.add("bb-gc-hidden")'), false);
  assert.ok(GUEST_CHAT_SCRIPT.includes("working.remove()"), "removed when the stream settles");
});

test("timestamps: the CSS defines a .bb-gc-time class and the script stamps `at`", () => {
  assert.ok(GUEST_CHAT_CSS.includes(".bb-gc-time"), "time label class shipped in the CSS");
  assert.ok(GUEST_CHAT_SCRIPT.includes("localIso"), "an `at` timestamp helper exists");
});

test("stampBuiltinPageIds stamps nested GuestChat blocks and no-ops without one", () => {
  const blocks: Block[] = [
    {
      id: "s1",
      component: "Section",
      children: [
        {
          id: "col",
          component: "__section_column__",
          children: [{ id: "gc", component: GUEST_CHAT_COMPONENT, props: { agent: "a" } }],
        },
      ],
    },
  ];
  const out = stampBuiltinPageIds(blocks, "p9");
  const chat = out[0].children?.[0].children?.[0];
  assert.equal(chat?.guestChatPageId, "p9");
  // Original untouched (pure): the walk returns a new tree, not a mutation.
  assert.equal(blocks[0].children?.[0].children?.[0].guestChatPageId, undefined);
  // Nothing to stamp anywhere → the SAME array back (zero-cost common path).
  const plain: Block[] = [{ id: "x", component: "Hero" }];
  assert.equal(stampBuiltinPageIds(plain, "p9"), plain);
});

test("stampFormPageId wrapper still stamps GuestChat blocks (generalized walk)", () => {
  const blocks: Block[] = [{ id: "gc", component: GUEST_CHAT_COMPONENT }];
  const out = stampFormPageId(blocks, "p1");
  assert.equal(out[0].guestChatPageId, "p1");
});

// ── welcome hydration (agent config → block prop) ─────────────────────────────

test("collectGuestChatAgentRefs finds distinct nested refs, skips empty/non-chat", () => {
  const blocks: Block[] = [
    {
      id: "s",
      component: "Section",
      children: [
        { id: "a", component: GUEST_CHAT_COMPONENT, props: { agent: "bot-1" } },
        { id: "b", component: GUEST_CHAT_COMPONENT, props: { agent: "bot-1" } },
        { id: "c", component: GUEST_CHAT_COMPONENT, props: { agent: "" } },
        { id: "d", component: "Hero", props: { agent: "not-a-chat" } },
      ],
    },
  ];
  assert.deepEqual(collectGuestChatAgentRefs(blocks), ["bot-1"]);
  assert.deepEqual(collectGuestChatAgentRefs([]), []);
});

test("applyGuestChatWelcome writes the agent welcome; a block-prop welcome overrides", () => {
  const blocks: Block[] = [
    {
      id: "s",
      component: "Section",
      children: [
        { id: "a", component: GUEST_CHAT_COMPONENT, props: { agent: "bot-1" } },
        {
          id: "b",
          component: GUEST_CHAT_COMPONENT,
          props: { agent: "bot-1", welcome: "Local override" },
        },
      ],
    },
  ];
  const out = applyGuestChatWelcome(blocks, new Map([["bot-1", "Hi from config"]]));
  assert.equal(out[0].children?.[0].props?.welcome, "Hi from config");
  assert.equal(out[0].children?.[1].props?.welcome, "Local override");
  // Original untouched (pure walk).
  assert.equal(blocks[0].children?.[0].props?.welcome, undefined);
});

test("applyGuestChatWelcome hydrates a LOCALE-OBJECT agent welcome; a locale-object block welcome counts as set", () => {
  const localized = { en: "Hello!", fi: "Hei!" };
  const blocks: Block[] = [
    { id: "a", component: GUEST_CHAT_COMPONENT, props: { agent: "bot-1" } },
    {
      id: "b",
      component: GUEST_CHAT_COMPONENT,
      props: { agent: "bot-1", welcome: { en: "Own", fi: "Oma" } },
    },
  ];
  const out = applyGuestChatWelcome(blocks, new Map([["bot-1", localized]]));
  // The OBJECT lands on the prop — the plan walk localizes it later, like any prop.
  assert.deepEqual(out[0].props?.welcome, localized);
  // A block whose own welcome is a locale object is SET — the agent's must not clobber it.
  assert.deepEqual(out[1].props?.welcome, { en: "Own", fi: "Oma" });
});

test("applyGuestChatWelcome returns the SAME array when nothing changes", () => {
  const noChat: Block[] = [{ id: "x", component: "Hero" }];
  assert.equal(applyGuestChatWelcome(noChat, new Map([["bot-1", "Hi"]])), noChat);
  // A ref with no configured welcome changes nothing either.
  const unresolved: Block[] = [
    { id: "gc", component: GUEST_CHAT_COMPONENT, props: { agent: "ghost" } },
  ];
  assert.equal(applyGuestChatWelcome(unresolved, new Map()), unresolved);
});
