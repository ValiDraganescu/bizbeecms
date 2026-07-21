import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planGuestChat,
  collectGuestChatAgentRefs,
  applyGuestChatWelcome,
  GUEST_CHAT_SCRIPT,
  GUEST_CHAT_CSS,
  PUBLIC_CHAT_PATH,
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

test("applyGuestChatWelcome returns the SAME array when nothing changes", () => {
  const noChat: Block[] = [{ id: "x", component: "Hero" }];
  assert.equal(applyGuestChatWelcome(noChat, new Map([["bot-1", "Hi"]])), noChat);
  // A ref with no configured welcome changes nothing either.
  const unresolved: Block[] = [
    { id: "gc", component: GUEST_CHAT_COMPONENT, props: { agent: "ghost" } },
  ];
  assert.equal(applyGuestChatWelcome(unresolved, new Map()), unresolved);
});
