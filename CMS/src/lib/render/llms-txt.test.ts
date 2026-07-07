/**
 * llms-txt — build the /llms.txt AI-crawler index.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLlmsTxt } from "./llms-txt.ts";

test("header + tagline + page list with descriptions", () => {
  const out = buildLlmsTxt(
    { name: "Acme Coffee", tagline: "Fresh roasts, daily." },
    [
      { mdUrl: "https://x/", title: "Home", description: "Welcome" },
      { mdUrl: "https://x/about.md", title: "About" },
    ],
  );
  assert.equal(
    out,
    "# Acme Coffee\n\n> Fresh roasts, daily.\n\n## Pages\n" +
      "- [Home](https://x/): Welcome\n" +
      "- [About](https://x/about.md)\n",
  );
});

test("blank name falls back; no tagline omits the blockquote", () => {
  const out = buildLlmsTxt({ name: "  " }, [
    { mdUrl: "https://x/p.md", title: "P" },
  ]);
  assert.equal(out, "# Website\n\n## Pages\n- [P](https://x/p.md)\n");
});

test("no entries → just the header", () => {
  assert.equal(buildLlmsTxt({ name: "Solo" }, []), "# Solo\n");
});

test("newlines/tabs in values collapse to spaces (line format can't break)", () => {
  const out = buildLlmsTxt(
    { name: "A\nB", tagline: "x\ty" },
    [{ mdUrl: "https://x/p.md", title: "T\nitle", description: "d\n1" }],
  );
  assert.equal(
    out,
    "# A B\n\n> x y\n\n## Pages\n- [T itle](https://x/p.md): d 1\n",
  );
});

test("entries with blank title or url are dropped", () => {
  const out = buildLlmsTxt({ name: "S" }, [
    { mdUrl: "https://x/ok.md", title: "OK" },
    { mdUrl: "", title: "NoUrl" },
    { mdUrl: "https://x/x.md", title: "  " },
  ]);
  assert.equal(out, "# S\n\n## Pages\n- [OK](https://x/ok.md)\n");
});
