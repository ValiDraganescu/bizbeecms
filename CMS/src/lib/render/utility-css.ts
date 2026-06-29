/**
 * Custom non-Tailwind CSS for the runtime renderer.
 *
 * The bounded Tailwind allowlist that used to live here is GONE — pages now
 * compile their actual Tailwind classes at request time via `tw-compile.ts`
 * (full Tailwind: variants + arbitrary values, generated in-Worker). What
 * remains is the handful of classes that are NOT Tailwind utilities and so
 * Tailwind's compiler would never emit: the per-viewport "hide" helpers the
 * page-builder column renderer stamps from `hideMobile`/`hideTablet`/
 * `hideDesktop`. These are `@media` blocks (inline styles can't do `@media`),
 * appended verbatim to every page's compiled sheet.
 *
 * Pure (no React/D1/CF imports) so it stays unit-testable with the dep-free
 * `node --test` convention.
 */

/**
 * Per-viewport "hide" classes — each is a `display:none` inside ONE breakpoint
 * band. Bands match the page-builder viewport toggle (mobile / tablet / desktop).
 */
const VIEWPORT_HIDE_RULES: Array<{ cls: string; media: string }> = [
  { cls: "pb-hide-mobile", media: "(max-width:767px)" },
  { cls: "pb-hide-tablet", media: "(min-width:768px) and (max-width:1023px)" },
  { cls: "pb-hide-desktop", media: "(min-width:1024px)" },
];

/** The custom (non-Tailwind) CSS appended to every page's compiled sheet. */
export function viewportHideCss(): string {
  return VIEWPORT_HIDE_RULES.map(
    (r) => `@media ${r.media}{.${r.cls}{display:none}}`,
  ).join("\n");
}
