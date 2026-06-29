/**
 * Runtime Tailwind compiler for AI-authored components.
 *
 * THE PROBLEM (was): Tailwind's build-time scanner only sees classes in the
 * project's own source. AI components live in D1 and are walked at request time,
 * so their classes ship no CSS. The old fix (`utility-css.ts`) hand-wrote a
 * BOUNDED allowlist and rejected anything outside it — safe, but the AI got
 * rejected for normal things (`hover:`, `md:`, arbitrary `h-[37px]`).
 *
 * THE FIX (this module): Tailwind v4's `compile()` is pure JS — give it an
 * explicit class list and it emits the exact CSS, including variants and
 * arbitrary values. No oxide, no filesystem (we inline the 4 tailwind CSS
 * sources via `tw-sources.generated.ts`), so it runs in a Cloudflare Worker.
 *
 * We collect every `className` token actually used on a page, compile ONCE, and
 * inject the result inline — same shape as before, just unbounded and exact.
 * Purpose-color utilities (`bg-primary`, `text-foreground`, …) resolve to
 * `var(--color-*)` so the runtime theme (`globals.css` + per-site overrides)
 * still drives light/dark exactly as it did with the hand-written sheet.
 *
 * Pure (no React/D1/CF imports) so it's unit-testable with the dep-free
 * `node --test` convention.
 */
import { compile } from "tailwindcss";
import { TW_SOURCES } from "./tw-sources.generated.ts";

// Purpose tokens (mirrors globals.css `:root` + utility-css COLOR_TOKENS). Only
// the NAMES matter here: utilities emit `var(--color-<name>)`, and the real
// values come from globals.css / the per-site theme <style> at runtime. The
// placeholder value just makes `@theme` register the token so `bg-<name>` is a
// valid utility. Keep in sync with COLOR_TOKENS in utility-css.ts.
const COLOR_TOKENS = [
  "surface", "surface-muted", "surface-raised",
  "foreground", "foreground-muted", "border",
  "primary", "primary-hover", "primary-foreground", "primary-subtle",
  "danger", "danger-hover", "danger-foreground", "danger-subtle",
  "success", "success-foreground", "success-subtle",
  "warning", "warning-foreground", "warning-subtle",
  "info", "info-foreground", "info-subtle",
  "ring",
];

const THEME = COLOR_TOKENS.map((t) => `  --color-${t}: oklch(0.5 0.1 268);`).join("\n");

// Our compiler entry: pull in tailwind, then register the purpose tokens so
// `bg-primary` etc. are recognized utilities.
const ENTRY = `@import "tailwindcss";\n@theme {\n${THEME}\n}`;

/**
 * Build one Tailwind compiler instance. `compile` resolves `@import` via
 * `loadStylesheet`, which we satisfy from the inlined sources (no FS). Plugins
 * are unsupported (we never use `@plugin`) — `loadModule` throws if reached.
 *
 * One instance can build many class lists; reuse it across requests in a worker.
 */
async function makeCompiler() {
  return compile(ENTRY, {
    base: "/",
    loadStylesheet: async (id: string) => {
      const key = id.replace(/^(\.\/|tailwindcss\/)/, "").replace(/^tailwindcss$/, "index.css");
      const content = TW_SOURCES[key] ?? TW_SOURCES[id];
      if (content == null) throw new Error(`tw-compile: unknown stylesheet import "${id}"`);
      return { base: "/", path: id, content };
    },
    loadModule: async () => {
      throw new Error("tw-compile: @plugin / JS config is not supported at runtime");
    },
  });
}

// The compiler is expensive to construct (~parse 57KB of CSS) but cheap to
// `.build()`. Build it once per worker instance, lazily.
// ponytail: module-level singleton; if multiple themes ever need distinct
// token sets, key this by theme.
let compilerPromise: ReturnType<typeof makeCompiler> | null = null;

// Per class-set CSS cache. Pages reuse the same components, so the same sorted
// class signature recurs across requests — compile once, serve from here.
// ponytail: unbounded Map; add an LRU cap if a site explodes to thousands of
// distinct class-sets.
const cssCache = new Map<string, string>();

/**
 * Compile the given Tailwind classes to a CSS sheet. Order-independent and
 * deduplicated (the signature is sorted+unique), so two pages with the same
 * classes share one cache entry. Returns "" for an empty class list.
 */
export async function buildCss(classes: Iterable<string>): Promise<string> {
  const unique = [...new Set(classes)].filter((c) => c !== "").sort();
  if (unique.length === 0) return "";
  const sig = unique.join(" ");
  const hit = cssCache.get(sig);
  if (hit !== undefined) return hit;

  if (!compilerPromise) compilerPromise = makeCompiler();
  const compiler = await compilerPromise;
  const css = compiler.build(unique);
  cssCache.set(sig, css);
  return css;
}

/** Split a `className` string into individual class tokens. */
export function splitClasses(className: unknown): string[] {
  return typeof className === "string" ? className.split(/\s+/).filter(Boolean) : [];
}
