/**
 * theme-fonts: pure css2 URL-build + response-parse regression. Dep-free
 * (`node --test scripts/google-fonts.test.mjs`). The live fetch is HITL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCss2Url,
  parseCss2,
  hostedFaces,
} from "../src/lib/settings/google-fonts.ts";

const SAMPLE = `
/* latin-ext */
@font-face {
  font-family: 'Playfair Display';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/abc-ext.woff2) format('woff2');
  unicode-range: U+0100-02AF, U+0304, U+0308;
}
/* latin */
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/def.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* cyrillic */
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
`;

test("buildCss2Url: spaces → +, weights sorted + deduped", () => {
  assert.equal(
    buildCss2Url("Playfair Display", [700, 400, 700]),
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
  );
});

test("parseCss2: extracts subset, style, weight, url, unicode-range", () => {
  const faces = parseCss2(SAMPLE);
  assert.equal(faces.length, 3);
  assert.deepEqual(faces[0], {
    subset: "latin-ext",
    style: "italic",
    weight: 400,
    url: "https://fonts.gstatic.com/s/playfairdisplay/v37/abc-ext.woff2",
    unicodeRange: "U+0100-02AF, U+0304, U+0308",
  });
  assert.equal(faces[1].subset, "latin");
  assert.equal(faces[1].style, "normal");
});

test("parseCss2: garbage / TTF-fallback responses parse to []", () => {
  assert.deepEqual(parseCss2(""), []);
  assert.deepEqual(parseCss2("@font-face{src:url(https://x/y.ttf);}"), []);
});

test("hostedFaces: keeps latin + latin-ext, drops other subsets", () => {
  const kept = hostedFaces(parseCss2(SAMPLE));
  assert.deepEqual(kept.map((f) => f.subset), ["latin-ext", "latin"]);
});
