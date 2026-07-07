/**
 * Core-Web-Vitals image post-pass (seo-robots / Performance track).
 *
 * A PURE post-pass over the finished ElementPlan — same seam as
 * `localizePlanLinks` (tree.ts, right after `blocks.map(planTopBlock)`). For
 * every `<img>` in document order it:
 *   - adds `loading="lazy"` + `decoding="async"` — EXCEPT the FIRST image (the
 *     LCP candidate: lazy-loading the largest-above-the-fold image hurts LCP);
 *   - when the author-set numeric `width`/`height` are BOTH known, mirrors them
 *     into an inline `aspect-ratio` so the browser reserves the box before the
 *     bytes arrive (kills layout shift / CLS) without stretching the image.
 *
 * It NEVER invents dimensions (asset pixel sizes aren't stored yet — that's the
 * upload-capture follow-up), so an author who set no width/height gets the
 * lazy/decoding win only, no CLS guess. Explicit author `loading`/`decoding`
 * props always win (only ABSENT props are filled). Returns the SAME array/nodes
 * when nothing changes (cheap identity no-op on image-free pages).
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import type { ElementPlan } from "./plan-types.ts";

/** A finite positive number from a prop that may be a number OR numeric string. */
function positiveDim(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Fill lazy/decoding + aspect-ratio on ONE `<img>` element's props. `isLcp`
 *  skips the lazy/decoding hints (the first image is the LCP candidate). Returns
 *  the same props object when nothing changes. */
function hygieneProps(
  props: Record<string, unknown>,
  isLcp: boolean,
): Record<string, unknown> {
  let next = props;
  const set = (key: string, value: unknown) => {
    if (next === props) next = { ...props };
    next[key] = value;
  };

  // Lazy/async only for below-the-fold images; never override an author choice.
  if (!isLcp) {
    if (props.loading === undefined) set("loading", "lazy");
    if (props.decoding === undefined) set("decoding", "async");
  } else {
    // The LCP image benefits from eager decode; still don't override an author.
    if (props.decoding === undefined) set("decoding", "async");
  }

  // CLS: reserve the box via aspect-ratio when BOTH dims are known and the author
  // hasn't already set aspect-ratio in an inline style object.
  const w = positiveDim(props.width);
  const h = positiveDim(props.height);
  if (w !== null && h !== null) {
    const style = props.style;
    const isObjStyle = style != null && typeof style === "object" && !Array.isArray(style);
    // A non-object style (a raw CSS string, unusual here — parse-html emits objects)
    // is left ALONE: we won't clobber it, so no aspect-ratio for that rare case.
    if (style == null || isObjStyle) {
      const styleObj = isObjStyle ? (style as Record<string, unknown>) : null;
      const hasAspect =
        styleObj !== null &&
        (styleObj.aspectRatio !== undefined || styleObj["aspect-ratio"] !== undefined);
      if (!hasAspect) {
        set("style", { ...(styleObj ?? {}), aspectRatio: `${w} / ${h}` });
      }
    }
  }

  return next;
}

/**
 * Walk finished element plans, applying image hygiene to every `<img>` in
 * document order. The first `<img>` encountered is treated as the LCP candidate
 * and NOT lazy-loaded. Returns the SAME array/nodes when nothing changes.
 */
export function applyImageHygiene(plans: ElementPlan[]): ElementPlan[] {
  let seenFirstImage = false;

  function walk(plan: ElementPlan): ElementPlan {
    if (plan.kind !== "element") return plan;

    let props = plan.props;
    if (plan.tag === "img") {
      const isLcp = !seenFirstImage;
      seenFirstImage = true;
      props = hygieneProps(plan.props, isLcp);
    }

    // Walk children in document order so the "first image" is the visually-first.
    let changed = false;
    const walked = plan.children.map((c) => {
      const w = walk(c);
      if (w !== c) changed = true;
      return w;
    });
    const children = changed ? walked : plan.children;

    if (props === plan.props && children === plan.children) return plan;
    return { ...plan, props, children };
  }

  let changed = false;
  const out = plans.map((p) => {
    const w = walk(p);
    if (w !== p) changed = true;
    return w;
  });
  return changed ? out : plans;
}
