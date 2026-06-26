/**
 * Precompiled utility CSS for runtime-authored components (Milestone 2, epic A3).
 *
 * THE PROBLEM: Tailwind's build-time scanner only sees class names that appear
 * in the project's JSX/TS source. But the AI emits component artifacts whose
 * `className` strings live in D1 and are walked at request time (see
 * `tree.ts`/`[[...slug]]/page.tsx`). The build never sees those classes, so
 * `globals.css` ships no CSS for them — a published page renders structurally
 * correct but completely unstyled.
 *
 * THE FIX (this module): define a BOUNDED, explicit vocabulary of utility
 * classes the AI is allowed to use, and generate the matching CSS from it as a
 * pure data walk. The generated sheet is injected as an inline `<style>` on
 * public pages (see the route), so it's part of the SSR'd HTML — no static
 * asset upload needed (sidesteps the open static-assets deploy blocker).
 *
 * This module is PURE (no React/D1/CF imports) so it is unit-testable with the
 * project's dep-free `node --test` convention (see CAVEATS). Color utilities
 * reference the SAME purpose-named CSS variables as `globals.css`
 * (`--color-surface`, `--color-foreground`, …) so the runtime sheet follows the
 * active light/dark theme exactly like the build-scanned utilities do.
 *
 * Scope = every Tailwind utility a sane person reaches for (the full spacing /
 * sizing / positioning ladders, object-fit, aspect, z-index), so the AI is never
 * rejected for a normal `h-32`/`top-2`. It stays BOUNDED (generated from explicit
 * data, never arbitrary Tailwind) so the scanner gap stays closed; truly one-off
 * values (e.g. `top-[37px]`) are handled via inline `style`, and the
 * create_component error names the exact rejected class + says to use `style`.
 */

// ── The purpose color tokens (must mirror globals.css @theme inline) ─────────
// Each maps to a `--color-<name>` CSS variable so utilities follow the theme.
const COLOR_TOKENS = [
  "surface",
  "surface-muted",
  "surface-raised",
  "foreground",
  "foreground-muted",
  "border",
  "primary",
  "primary-hover",
  "primary-foreground",
  "primary-subtle",
  "danger",
  "danger-hover",
  "danger-foreground",
  "danger-subtle",
  "success",
  "success-foreground",
  "success-subtle",
  "warning",
  "warning-foreground",
  "warning-subtle",
  "info",
  "info-foreground",
  "info-subtle",
] as const;

// ── Spacing scale (rem). Used by p-*, m-*, gap-*, w-*, h-*, top-*… The full
// Tailwind 0.25rem step ladder — accept everything a sane person would reach for
// so the AI never gets rejected for a normal `h-32`/`top-2` (see the AI error
// philosophy: support all sane inputs, only reject the genuinely unsupported).
const SPACING: Record<string, string> = (() => {
  const steps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
  const out: Record<string, string> = {};
  for (const s of steps) out[String(s)] = s === 0 ? "0" : `${s * 0.25}rem`;
  return out;
})();

// Fractional sizes (Tailwind's percentage widths/heights) for w-*/h-*.
const FRACTIONS: Record<string, string> = {
  "1/2": "50%",
  "1/3": "33.333333%",
  "2/3": "66.666667%",
  "1/4": "25%",
  "2/4": "50%",
  "3/4": "75%",
  "1/5": "20%",
  "2/5": "40%",
  "3/5": "60%",
  "4/5": "80%",
  "1/6": "16.666667%",
  "5/6": "83.333333%",
};

// ── Font sizes (with sensible line-heights, matching Tailwind defaults) ──────
const FONT_SIZE: Record<string, [string, string]> = {
  xs: ["0.75rem", "1rem"],
  sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"],
  lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"],
  "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"],
  "4xl": ["2.25rem", "2.5rem"],
  "5xl": ["3rem", "1"],
};

const FONT_WEIGHT: Record<string, string> = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
};

const RADIUS: Record<string, string> = {
  none: "0",
  sm: "0.125rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  full: "9999px",
};

const MAX_W: Record<string, string> = {
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
  "4xl": "56rem",
  "5xl": "64rem",
  full: "100%",
  prose: "65ch",
};

/** Escape a class name for use in a CSS selector (`.text-2xl` → `.text-2xl`). */
function sel(cls: string): string {
  // Class names here are all [a-z0-9-], no special chars to escape. Keep the
  // hook in case the vocabulary ever grows to include `/`, `.`, `:` etc.
  return "." + cls.replace(/([^a-zA-Z0-9-])/g, "\\$1");
}

type Rule = { cls: string; decl: string };

/** The full, ordered list of allowed utility classes + their declarations. */
export function utilityRules(): Rule[] {
  const rules: Rule[] = [];
  const add = (cls: string, decl: string) => rules.push({ cls, decl });

  // Display
  for (const v of ["block", "inline-block", "inline", "flex", "inline-flex", "grid", "hidden"]) {
    add(v, `display:${v === "hidden" ? "none" : v}`);
  }


  // Flex / grid layout
  add("flex-row", "flex-direction:row");
  add("flex-col", "flex-direction:column");
  add("flex-wrap", "flex-wrap:wrap");
  add("flex-1", "flex:1 1 0%");
  add("items-start", "align-items:flex-start");
  add("items-center", "align-items:center");
  add("items-end", "align-items:flex-end");
  add("justify-start", "justify-content:flex-start");
  add("justify-center", "justify-content:center");
  add("justify-end", "justify-content:flex-end");
  add("justify-between", "justify-content:space-between");
  for (const n of ["1", "2", "3", "4"]) {
    add(`grid-cols-${n}`, `grid-template-columns:repeat(${n},minmax(0,1fr))`);
  }

  // Gap
  for (const [k, v] of Object.entries(SPACING)) add(`gap-${k}`, `gap:${v}`);

  // Padding / margin (all, x, y, and per-side)
  for (const [k, v] of Object.entries(SPACING)) {
    add(`p-${k}`, `padding:${v}`);
    add(`px-${k}`, `padding-left:${v};padding-right:${v}`);
    add(`py-${k}`, `padding-top:${v};padding-bottom:${v}`);
    add(`pt-${k}`, `padding-top:${v}`);
    add(`pr-${k}`, `padding-right:${v}`);
    add(`pb-${k}`, `padding-bottom:${v}`);
    add(`pl-${k}`, `padding-left:${v}`);
    add(`m-${k}`, `margin:${v}`);
    add(`mx-${k}`, `margin-left:${v};margin-right:${v}`);
    add(`my-${k}`, `margin-top:${v};margin-bottom:${v}`);
    add(`mt-${k}`, `margin-top:${v}`);
    add(`mr-${k}`, `margin-right:${v}`);
    add(`mb-${k}`, `margin-bottom:${v}`);
    add(`ml-${k}`, `margin-left:${v}`);
  }
  add("mx-auto", "margin-left:auto;margin-right:auto");

  // Width / height — full spacing ladder + fractions + keywords.
  add("w-full", "width:100%");
  add("w-auto", "width:auto");
  add("w-screen", "width:100vw");
  add("w-min", "width:min-content");
  add("w-max", "width:max-content");
  add("w-fit", "width:fit-content");
  add("h-full", "height:100%");
  add("h-auto", "height:auto");
  add("h-screen", "height:100vh");
  add("h-min", "height:min-content");
  add("h-max", "height:max-content");
  add("h-fit", "height:fit-content");
  for (const [k, v] of Object.entries(SPACING)) {
    add(`w-${k}`, `width:${v}`);
    add(`h-${k}`, `height:${v}`);
    add(`min-w-${k}`, `min-width:${v}`);
    add(`min-h-${k}`, `min-height:${v}`);
    add(`max-h-${k}`, `max-height:${v}`);
  }
  for (const [k, v] of Object.entries(FRACTIONS)) {
    add(`w-${k}`, `width:${v}`);
    add(`h-${k}`, `height:${v}`);
  }
  add("min-w-full", "min-width:100%");
  add("min-h-full", "min-height:100%");
  add("min-h-screen", "min-height:100vh");
  add("max-h-full", "max-height:100%");
  add("max-h-screen", "max-height:100vh");
  for (const [k, v] of Object.entries(MAX_W)) add(`max-w-${k}`, `max-width:${v}`);

  // Typography
  for (const [k, [size, lh]] of Object.entries(FONT_SIZE)) {
    add(`text-${k}`, `font-size:${size};line-height:${lh}`);
  }
  for (const [k, v] of Object.entries(FONT_WEIGHT)) add(`font-${k}`, `font-weight:${v}`);
  add("text-left", "text-align:left");
  add("text-center", "text-align:center");
  add("text-right", "text-align:right");
  add("italic", "font-style:italic");
  add("underline", "text-decoration-line:underline");
  add("uppercase", "text-transform:uppercase");
  add("lowercase", "text-transform:lowercase");
  add("capitalize", "text-transform:capitalize");
  add("leading-none", "line-height:1");
  add("leading-tight", "line-height:1.25");
  add("leading-normal", "line-height:1.5");
  add("leading-relaxed", "line-height:1.625");
  add("truncate", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap");

  // Color utilities — text-, bg-, border- for every purpose token.
  for (const token of COLOR_TOKENS) {
    const v = `var(--color-${token})`;
    add(`text-${token}`, `color:${v}`);
    add(`bg-${token}`, `background-color:${v}`);
    add(`border-${token}`, `border-color:${v}`);
  }

  // Borders
  add("border", "border-width:1px;border-style:solid");
  add("border-0", "border-width:0");
  add("border-2", "border-width:2px;border-style:solid");
  add("border-t", "border-top-width:1px;border-style:solid");
  add("border-b", "border-bottom-width:1px;border-style:solid");
  for (const [k, v] of Object.entries(RADIUS)) {
    add(k === "md" ? "rounded" : `rounded-${k}`, `border-radius:${v}`);
  }

  // Shadow (a small fixed set — values, not tokens)
  add("shadow-none", "box-shadow:none");
  add("shadow-sm", "box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.05)");
  add("shadow", "box-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1),0 1px 2px -1px rgb(0 0 0 / 0.1)");
  add("shadow-md", "box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1),0 2px 4px -2px rgb(0 0 0 / 0.1)");
  add("shadow-lg", "box-shadow:0 10px 15px -3px rgb(0 0 0 / 0.1),0 4px 6px -4px rgb(0 0 0 / 0.1)");

  // Position / misc
  add("relative", "position:relative");
  add("absolute", "position:absolute");
  add("fixed", "position:fixed");
  add("sticky", "position:sticky");
  add("static", "position:static");
  // Inset offsets (top/right/bottom/left/inset) over the spacing ladder + full/auto.
  for (const [k, v] of Object.entries(SPACING)) {
    add(`top-${k}`, `top:${v}`);
    add(`right-${k}`, `right:${v}`);
    add(`bottom-${k}`, `bottom:${v}`);
    add(`left-${k}`, `left:${v}`);
    add(`inset-${k}`, `top:${v};right:${v};bottom:${v};left:${v}`);
  }
  for (const side of ["top", "right", "bottom", "left"]) {
    add(`${side}-full`, `${side}:100%`);
    add(`${side}-auto`, `${side}:auto`);
  }
  add("inset-auto", "top:auto;right:auto;bottom:auto;left:auto");
  // z-index (common steps)
  for (const z of ["0", "10", "20", "30", "40", "50"]) add(`z-${z}`, `z-index:${z}`);
  // Object fit/position (for images inside fixed-size boxes)
  for (const v of ["contain", "cover", "fill", "none", "scale-down"]) {
    add(`object-${v}`, `object-fit:${v}`);
  }
  add("object-center", "object-position:center");
  add("object-top", "object-position:top");
  add("object-bottom", "object-position:bottom");
  // Aspect ratio
  add("aspect-auto", "aspect-ratio:auto");
  add("aspect-square", "aspect-ratio:1/1");
  add("aspect-video", "aspect-ratio:16/9");
  add("overflow-hidden", "overflow:hidden");
  add("overflow-auto", "overflow:auto");
  add("cursor-pointer", "cursor:pointer");

  return rules;
}

/**
 * Per-viewport "hide" classes — each is a `display:none` inside ONE breakpoint
 * band. Bands match the page-builder viewport toggle (mobile / tablet / desktop).
 * These can't go through `utilityRules` (whose decls are wrapped in `.cls{…}`)
 * because they ARE `@media` blocks; `generateUtilityCss` appends them verbatim.
 * The column renderer emits one or more of these class names from per-column
 * `hideMobile`/`hideTablet`/`hideDesktop` props (inline styles can't `@media`).
 */
const VIEWPORT_HIDE_RULES: Array<{ cls: string; media: string }> = [
  { cls: "pb-hide-mobile", media: "(max-width:767px)" },
  { cls: "pb-hide-tablet", media: "(min-width:768px) and (max-width:1023px)" },
  { cls: "pb-hide-desktop", media: "(min-width:1024px)" },
];

/** The set of every allowed class name (for validation / docs). */
export function allowedClasses(): Set<string> {
  return new Set([
    ...utilityRules().map((r) => r.cls),
    ...VIEWPORT_HIDE_RULES.map((r) => r.cls),
  ]);
}

/**
 * Generate the full utility CSS sheet. Pure, deterministic — same output every
 * call. Injected inline on public pages so runtime artifact classes are styled.
 */
export function generateUtilityCss(): string {
  const base = utilityRules().map((r) => `${sel(r.cls)}{${r.decl}}`);
  const viewport = VIEWPORT_HIDE_RULES.map(
    (r) => `@media ${r.media}{${sel(r.cls)}{display:none}}`,
  );
  return [...base, ...viewport].join("\n");
}
