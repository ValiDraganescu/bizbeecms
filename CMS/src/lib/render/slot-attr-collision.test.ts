/**
 * Regression: a prop bag whose keys ALL look like locale codes (2-3 letters:
 * src, alt, id, rel, for, …) must NEVER be mistaken for a locale object and
 * collapsed to a single value. The visible bug: a component authored as
 * `<img src="{{src}}" alt="{{t alt}}"/>` with props named src/alt rendered
 * BOTH attributes empty (published pages and component preview alike), while
 * renaming the props to imageSrc/imageAlt fixed it. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocalized, resolveLocalizedProps } from "./localize.ts";
import { parseHtml } from "./parse-html.ts";
import {
  planPage,
  planTree,
  type ComponentArtifact,
  type ElementPlan,
} from "./tree.ts";

const LOCALE = { locale: "en", fallback: "en" };

function firstTag(root: ElementPlan[], tag: string): ElementPlan & { kind: "element" } {
  const found: (ElementPlan & { kind: "element" })[] = [];
  const walk = (n: ElementPlan): void => {
    if (n.kind !== "element") return;
    if (n.tag === tag) found.push(n);
    for (const c of n.children) walk(c);
  };
  for (const n of root) walk(n);
  assert.ok(found.length > 0, `no <${tag}> in plan`);
  return found[0];
}

// ── resolveLocalizedProps (the fix's core) ───────────────────────────────────

test("resolveLocalizedProps: an all-short-key bag is NOT collapsed to one value", () => {
  const bag = {
    src: "/media/abc.jpg",
    alt: { fi: "kuva", en: "photo" },
  };
  // Baseline: resolveLocalized DOES misread this bag as a locale object (its
  // keys all match the locale-code shape) — which is exactly why prop bags must
  // go through resolveLocalizedProps instead.
  assert.equal(typeof resolveLocalized(bag, "en", "en"), "string");
  assert.deepEqual(resolveLocalizedProps(bag, "en", "en"), {
    src: "/media/abc.jpg",
    alt: "photo",
  });
});

test("resolveLocalizedProps: values still resolve locale objects at any depth", () => {
  const bag = {
    items: [{ label: { en: "Home", fi: "Koti" } }],
    title: { fi: "Otsikko", en: "Title" },
  };
  assert.deepEqual(resolveLocalizedProps(bag, "fi", "en"), {
    items: [{ label: "Koti" }],
    title: "Otsikko",
  });
});

// ── the exact repro: slot name == attribute name ─────────────────────────────

const IMG_ARTIFACT = {
  name: "Img",
  tree: parseHtml(
    `<img src="{{src}}" alt="{{t alt}}" class="w-full h-full min-h-[240px] object-cover"/>`,
  ),
  propsSchema: JSON.stringify({
    src: { type: "image", default: "/media/photo.jpg" },
    alt: { type: "string", translatable: true, default: { fi: "kuva", en: "photo" } },
  }),
};

test("props named src/alt fill the same-named attributes from schema defaults", () => {
  const plan = planPage(
    [{ id: "b1", component: "Img", props: {} }],
    new Map([["Img", IMG_ARTIFACT]]),
    LOCALE,
  );
  const img = firstTag(plan.root, "img");
  assert.equal(img.props.src, "/media/photo.jpg");
  assert.equal(img.props.alt, "photo");
  assert.equal(img.props.className, "w-full h-full min-h-[240px] object-cover");
});

test("props named src/alt fill from block values (overriding defaults), per locale", () => {
  const plan = planPage(
    [
      {
        id: "b1",
        component: "Img",
        props: { src: "/media/other.jpg", alt: { fi: "toinen", en: "another" } },
      },
    ],
    new Map([["Img", IMG_ARTIFACT]]),
    { locale: "fi", fallback: "en" },
  );
  const img = firstTag(plan.root, "img");
  assert.equal(img.props.src, "/media/other.jpg");
  assert.equal(img.props.alt, "toinen");
});

test("slots named title/href fill the same-named attributes on an anchor", () => {
  const artifact = {
    name: "Cta",
    tree: parseHtml(`<a href="{{href}}" title="{{t title}}">{{t title}}</a>`),
    propsSchema: JSON.stringify({
      href: { type: "link", default: "/menu" },
      title: { type: "string", translatable: true, default: { en: "See menu" } },
    }),
  };
  const plan = planPage(
    [{ id: "b1", component: "Cta", props: {} }],
    new Map([["Cta", artifact]]),
    LOCALE,
  );
  const a = firstTag(plan.root, "a");
  assert.equal(a.props.href, "/menu");
  assert.equal(a.props.title, "See menu");
  assert.deepEqual(a.children, [{ kind: "text", text: "See menu" }]);
});

test("image-hygiene still fills loading/decoding after src/alt slot binding", () => {
  const two = [
    { id: "b1", component: "Img", props: {} },
    { id: "b2", component: "Img", props: {} },
  ];
  const plan = planPage(two, new Map([["Img", IMG_ARTIFACT]]), LOCALE);
  const imgs: (ElementPlan & { kind: "element" })[] = [];
  const walk = (n: ElementPlan): void => {
    if (n.kind !== "element") return;
    if (n.tag === "img") imgs.push(n);
    for (const c of n.children) walk(c);
  };
  for (const n of plan.root) walk(n);
  assert.equal(imgs.length, 2);
  // First image = LCP candidate (no lazy); second is lazy. Both keep bound src.
  assert.equal(imgs[0].props.loading, undefined);
  assert.equal(imgs[1].props.loading, "lazy");
  for (const img of imgs) {
    assert.equal(img.props.src, "/media/photo.jpg");
    assert.equal(img.props.decoding, "async");
  }
});

// ── same collision on ELEMENT attribute bags (static values) ─────────────────

test("planTree: an element whose only attrs are src/alt keeps its props bag", () => {
  const el = planTree(
    { tag: "img", props: { src: "/x.jpg", alt: "hi" }, children: [] },
    LOCALE,
  );
  assert.equal(el.kind, "element");
  assert.deepEqual((el as { props: Record<string, unknown> }).props, {
    src: "/x.jpg",
    alt: "hi",
  });
});

// ── nested composition-by-tag with short prop names ──────────────────────────

test("composition-by-tag: a nested component's src/alt props bind, not collapse", () => {
  const card = {
    name: "Card",
    tree: parseHtml(`<div class="card"><Img src="/media/n.jpg" alt="nested"/></div>`),
    propsSchema: null,
  };
  const plan = planPage(
    [{ id: "b1", component: "Card", props: {} }],
    new Map<string, ComponentArtifact>([
      ["Card", card],
      ["Img", IMG_ARTIFACT],
    ]),
    LOCALE,
  );
  const img = firstTag(plan.root, "img");
  assert.equal(img.props.src, "/media/n.jpg");
  assert.equal(img.props.alt, "nested");
});
