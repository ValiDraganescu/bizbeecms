import { test } from "node:test";
import assert from "node:assert/strict";
import { redirectTargetFor } from "./index.ts";

test("serve entry (bare slug) → no redirect", () => {
  assert.equal(redirectTargetFor("test-1", "https://www.restovista.com/"), null);
});

test("redirect entry → 301 target, root path", () => {
  assert.equal(
    redirectTargetFor(">https://www.restovista.com", "https://restovista.com/"),
    "https://www.restovista.com/",
  );
});

test("redirect preserves path + query", () => {
  assert.equal(
    redirectTargetFor(
      ">https://www.restovista.com",
      "https://restovista.com/menu?lang=fi",
    ),
    "https://www.restovista.com/menu?lang=fi",
  );
});

test("redirect target host is used, not the request host", () => {
  // The request came in on the apex; the target www host must win.
  const out = redirectTargetFor(
    ">https://www.example.com",
    "https://example.com/a/b",
  );
  assert.equal(new URL(out).host, "www.example.com");
  assert.equal(new URL(out).pathname, "/a/b");
});
