import { test } from "node:test";
import assert from "node:assert/strict";
import { lintComponentScript } from "./lint-component-script.ts";
import { parseHtml } from "../render/parse-html.ts";

const lint = (html: string, script: string) => lintComponentScript(parseHtml(html), script);

test("empty script is clean", () => {
  assert.deepEqual(lint(`<div class="p-4">x</div>`, ""), []);
});

test("querying the component's own data-* hook passes", () => {
  const html = `<div data-carousel><button data-next>→</button></div>`;
  const script = `document.querySelector("[data-carousel]").querySelector("[data-next]").addEventListener("click", go);`;
  assert.deepEqual(lint(html, script), []);
});

test("querying own class / id / attribute-with-value passes", () => {
  const html = `<div class="carousel-root" id="promo"><span data-role="tab">t</span></div>`;
  const script =
    `document.querySelector(".carousel-root"); document.getElementById("promo"); document.querySelectorAll('[data-role="tab"]');`;
  assert.deepEqual(lint(html, script), []);
});

test("selector for markup the SCRIPT builds passes (innerHTML / classList / dataset)", () => {
  const html = `<div data-gallery>x</div>`;
  const script = `
    const overlay = document.createElement("div");
    overlay.innerHTML = '<div class="lightbox-inner"><img /></div>';
    overlay.classList.add("lightbox-overlay");
    overlay.dataset.lightboxOpen = "1";
    document.querySelector(".lightbox-overlay");
    document.querySelector(".lightbox-inner");
    document.querySelector("[data-lightbox-open]");
  `;
  assert.deepEqual(lint(html, script), []);
});

test("selector matching nothing rendered or built is flagged with both fixes", () => {
  const findings = lint(`<div data-own>x</div>`, `document.querySelector(".site-header-nav").focus();`);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /class "site-header-nav"/);
  assert.match(findings[0], /another component's markup|dead query/);
});

test("foreign attribute hook is flagged", () => {
  const findings = lint(`<div data-own>x</div>`, `document.querySelector("[data-site-menu]")`);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /attribute "data-site-menu"/);
});

test("querying body/html is flagged as reaching outside", () => {
  const findings = lint(`<div data-own>x</div>`, `document.querySelector("body > header")`);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /<body> is outside this component/);
});

test("dynamic selectors are skipped, never flagged", () => {
  const script = "const el = root.querySelector(`[data-tab=\"${name}\"]`);";
  assert.deepEqual(lint(`<div data-own>x</div>`, script), []);
});

test("getElementsByClassName tokens are checked", () => {
  const findings = lint(`<div class="a">x</div>`, `document.getElementsByClassName("a gone")`);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /class "gone"/);
});
