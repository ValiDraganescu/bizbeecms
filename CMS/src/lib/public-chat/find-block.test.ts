/**
 * Public guest-chat block lookup (pure): a nested GuestChat is found by id;
 * an id that exists but isn't a GuestChat — or a missing id — yields null, so a
 * visitor can only ever address a real chat block. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findGuestChatBlock } from "./find-block.ts";
import { GUEST_CHAT_COMPONENT, type Block } from "../render/plan-types.ts";

const tree: Block[] = [
  {
    id: "s1",
    component: "Section",
    children: [
      {
        id: "col",
        component: "__section_column__",
        children: [
          { id: "chat1", component: GUEST_CHAT_COMPONENT, props: { agent: "a1" } },
          { id: "hero", component: "Hero" },
        ],
      },
    ],
  },
  { id: "chat2", component: GUEST_CHAT_COMPONENT },
];

test("findGuestChatBlock finds a nested GuestChat by id", () => {
  assert.equal(findGuestChatBlock(tree, "chat1")?.id, "chat1");
  assert.equal(findGuestChatBlock(tree, "chat2")?.id, "chat2");
});

test("an id that exists but isn't a GuestChat yields null", () => {
  assert.equal(findGuestChatBlock(tree, "hero"), null);
  assert.equal(findGuestChatBlock(tree, "s1"), null);
  assert.equal(findGuestChatBlock(tree, "col"), null);
});

test("an unknown id yields null", () => {
  assert.equal(findGuestChatBlock(tree, "nope"), null);
  assert.equal(findGuestChatBlock([], "chat1"), null);
});
