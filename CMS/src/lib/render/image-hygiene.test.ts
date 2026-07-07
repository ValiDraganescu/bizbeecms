import { test } from "node:test";
import assert from "node:assert/strict";
import { applyImageHygiene, srcsetFor } from "./image-hygiene.ts";
import type { ElementPlan } from "./plan-types.ts";

function img(props: Record<string, unknown>): ElementPlan {
  return { kind: "element", tag: "img", props, children: [] };
}
function box(...children: ElementPlan[]): ElementPlan {
  return { kind: "element", tag: "div", props: {}, children };
}

test("first image is the LCP candidate — no loading=lazy", () => {
  const out = applyImageHygiene([img({ src: "/a.png" })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.equal(p.loading, undefined);
  assert.equal(p.decoding, "async"); // eager decode still added
});

test("second+ images get loading=lazy + decoding=async", () => {
  const out = applyImageHygiene([img({ src: "/a.png" }), img({ src: "/b.png" })]);
  const second = (out[1] as { props: Record<string, unknown> }).props;
  assert.equal(second.loading, "lazy");
  assert.equal(second.decoding, "async");
});

test("document-order across nested trees decides the LCP image", () => {
  const out = applyImageHygiene([
    box(img({ src: "/deep.png" })),
    img({ src: "/top.png" }),
  ]);
  const first = ((out[0] as { children: ElementPlan[] }).children[0] as {
    props: Record<string, unknown>;
  }).props;
  const second = (out[1] as { props: Record<string, unknown> }).props;
  assert.equal(first.loading, undefined); // deep image is first in doc order
  assert.equal(second.loading, "lazy");
});

test("author loading/decoding always win (only absent props filled)", () => {
  const out = applyImageHygiene([
    img({ src: "/a.png" }),
    img({ src: "/b.png", loading: "eager", decoding: "sync" }),
  ]);
  const second = (out[1] as { props: Record<string, unknown> }).props;
  assert.equal(second.loading, "eager");
  assert.equal(second.decoding, "sync");
});

test("known width+height → aspect-ratio inline style (CLS)", () => {
  const out = applyImageHygiene([img({ src: "/a.png", width: 800, height: 600 })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { aspectRatio: "800 / 600" });
});

test("numeric-string dimensions are honored", () => {
  const out = applyImageHygiene([img({ src: "/a.png", width: "400", height: "300" })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { aspectRatio: "400 / 300" });
});

test("no aspect-ratio when a dimension is missing/zero — never invents CLS box", () => {
  const out = applyImageHygiene([
    img({ src: "/a.png", width: 800 }),
    img({ src: "/b.png", width: 0, height: 600 }),
  ]);
  assert.equal((out[0] as { props: Record<string, unknown> }).props.style, undefined);
  assert.equal((out[1] as { props: Record<string, unknown> }).props.style, undefined);
});

test("existing aspect-ratio in style is not overwritten; other style keys preserved", () => {
  const out = applyImageHygiene([
    img({ src: "/a.png", width: 800, height: 600, style: { aspectRatio: "1 / 1", color: "red" } }),
  ]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { aspectRatio: "1 / 1", color: "red" });
});

test("merges aspect-ratio into an existing style object", () => {
  const out = applyImageHygiene([
    img({ src: "/a.png", width: 800, height: 600, style: { objectFit: "cover" } }),
  ]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { objectFit: "cover", aspectRatio: "800 / 600" });
});

test("dims baked onto the src (?w=&h=) drive aspect-ratio when props absent", () => {
  const out = applyImageHygiene([img({ src: "/media/assets/x_1_a.png?w=800&h=600" })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { aspectRatio: "800 / 600" });
});

test("author width/height props win over ?w=&h= on the src", () => {
  const out = applyImageHygiene([
    img({ src: "/media/x.png?w=800&h=600", width: 400, height: 400 }),
  ]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(p.style, { aspectRatio: "400 / 400" });
});

test("bad/partial ?w=&h= query → no invented CLS box", () => {
  const out = applyImageHygiene([
    img({ src: "/media/x.png?w=800" }),
    img({ src: "/media/y.png?w=abc&h=600" }),
  ]);
  assert.equal((out[0] as { props: Record<string, unknown> }).props.style, undefined);
  assert.equal((out[1] as { props: Record<string, unknown> }).props.style, undefined);
});

// A valid /media/ asset src carrying intrinsic ?w=&h= dims.
const MEDIA = "/media/assets/x_1_a.png?w=1000&h=800";

test("srcsetFor: /media/ image emits variants <= intrinsic width", () => {
  // intrinsic 1000 → 320,640,960 (1280/1920 skipped: upscales)
  assert.equal(
    srcsetFor(MEDIA, 1000),
    "/media/assets/x_1_a.png?w=320 320w, /media/assets/x_1_a.png?w=640 640w, /media/assets/x_1_a.png?w=960 960w",
  );
});

test("srcsetFor: null for non-/media/ src and for images below smallest width", () => {
  assert.equal(srcsetFor("/a.png", 1000), null); // not a /media/ key
  assert.equal(srcsetFor("https://cdn.example.com/x.jpg", 1000), null); // external
  assert.equal(srcsetFor(MEDIA, 200), null); // smaller than 320 → no candidate
});

test("hygiene wires srcset + default sizes from ?w=&h= dims", () => {
  const out = applyImageHygiene([img({ src: MEDIA })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.equal(
    p.srcset,
    "/media/assets/x_1_a.png?w=320 320w, /media/assets/x_1_a.png?w=640 640w, /media/assets/x_1_a.png?w=960 960w",
  );
  assert.equal(p.sizes, "100vw");
  assert.deepEqual(p.style, { aspectRatio: "1000 / 800" }); // dims still drive CLS
});

test("author srcset/sizes win — hygiene never overrides them", () => {
  const out = applyImageHygiene([
    img({ src: MEDIA, srcset: "/custom.png 500w", sizes: "50vw" }),
  ]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.equal(p.srcset, "/custom.png 500w");
  assert.equal(p.sizes, "50vw");
});

test("no srcset when intrinsic width is unknown (no dims, no /media/ dims)", () => {
  const out = applyImageHygiene([img({ src: "/media/assets/x_1_a.png" })]);
  const p = (out[0] as { props: Record<string, unknown> }).props;
  assert.equal(p.srcset, undefined);
  assert.equal(p.sizes, undefined);
});

test("non-img elements untouched; identity no-op when no images", () => {
  const plans = [box(box())];
  assert.equal(applyImageHygiene(plans), plans); // same reference
});
