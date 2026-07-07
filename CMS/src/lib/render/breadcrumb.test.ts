import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ancestorChain,
  buildBreadcrumbData,
  buildBreadcrumbJsonLd,
  type BreadcrumbPageRow,
} from "./breadcrumb.ts";

const rows: BreadcrumbPageRow[] = [
  { id: "root", parentPageId: null },
  { id: "blog", parentPageId: "root" },
  { id: "post", parentPageId: "blog" },
  { id: "orphan", parentPageId: "gone" }, // dangling parent
  { id: "a", parentPageId: "b" }, // cycle a↔b
  { id: "b", parentPageId: "a" },
];

test("ancestorChain: root→leaf order for a nested page", () => {
  assert.deepEqual(
    ancestorChain(rows, "post")?.map((r) => r.id),
    ["root", "blog", "post"],
  );
});

test("ancestorChain: top-level page is a single-item chain (depth 0)", () => {
  assert.deepEqual(
    ancestorChain(rows, "root")?.map((r) => r.id),
    ["root"],
  );
});

test("ancestorChain: unknown id → null", () => {
  assert.equal(ancestorChain(rows, "nope"), null);
});

test("ancestorChain: dangling parent → null (no partial trail)", () => {
  assert.equal(ancestorChain(rows, "orphan"), null);
});

test("ancestorChain: cycle → null, not an infinite loop", () => {
  assert.equal(ancestorChain(rows, "a"), null);
});

test("buildBreadcrumbData: valid chain → schema.org BreadcrumbList JSON", () => {
  const json = buildBreadcrumbData([
    { name: "Home", url: "https://x.com/" },
    { name: "Blog", url: "https://x.com/blog" },
    { name: "Post", url: "https://x.com/blog/post" },
  ]);
  assert.ok(json);
  const parsed = JSON.parse(json!);
  assert.equal(parsed["@type"], "BreadcrumbList");
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed.itemListElement.length, 3);
  // 1-based positions, name + item per hop.
  assert.deepEqual(parsed.itemListElement[0], {
    "@type": "ListItem",
    position: 1,
    name: "Home",
    item: "https://x.com/",
  });
  assert.equal(parsed.itemListElement[2].position, 3);
});

test("buildBreadcrumbData: single hop → null (no breadcrumb for root)", () => {
  assert.equal(buildBreadcrumbData([{ name: "Home", url: "/" }]), null);
});

test("buildBreadcrumbData: any missing name/url → null (no lying trail)", () => {
  assert.equal(
    buildBreadcrumbData([
      { name: "Home", url: "/" },
      { name: "", url: "/blog" }, // missing name
    ]),
    null,
  );
  assert.equal(
    buildBreadcrumbData([
      { name: "Home", url: "/" },
      { name: "Blog", url: "   " }, // whitespace url
    ]),
    null,
  );
});

test("buildBreadcrumbData: escapes </script> breakout and & so it's safe inline", () => {
  const json = buildBreadcrumbData([
    { name: "Home", url: "https://x.com/" },
    { name: "</script><script>alert(1)</script>", url: "https://x.com/a&b" },
  ]);
  assert.ok(json);
  // No raw angle brackets or ampersands survive → can't break out of <script>.
  assert.equal(json!.includes("<"), false);
  assert.equal(json!.includes(">"), false);
  assert.equal(json!.includes("&"), false);
  // Still valid JSON that round-trips to the original strings.
  const parsed = JSON.parse(json!);
  assert.equal(parsed.itemListElement[1].name, "</script><script>alert(1)</script>");
  assert.equal(parsed.itemListElement[1].item, "https://x.com/a&b");
});

test("buildBreadcrumbJsonLd: wraps the data in a <script> element (HTML callers)", () => {
  const html = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: "Blog", url: "/blog" },
  ]);
  assert.ok(html);
  assert.ok(html!.startsWith('<script type="application/ld+json">'));
  assert.ok(html!.endsWith("</script>"));
  assert.equal(buildBreadcrumbJsonLd([{ name: "Home", url: "/" }]), null);
});
