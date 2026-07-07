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
import {
  readAssetDims,
  mediaKeyFromSrc,
  mediaVariantUrl,
  DELIVERY_WIDTHS,
} from "./asset.ts";

/** Default responsive `sizes` — the image fills the viewport width. Conservative
 *  (over-fetches on narrow layouts rather than under-fetching), and an author
 *  `sizes` prop always wins. */
const DEFAULT_SIZES = "100vw";

/**
 * Build a `srcset` for a `/media/<key>` image with known intrinsic width, or null
 * to add none. One candidate per DELIVERY_WIDTHS entry that is <= the intrinsic
 * width (never advertise an upscale the resize would just scale-down to the
 * master), each `<variantUrl> <n>w`. Returns null when the src isn't a /media/
 * key or no allowlist width fits under the intrinsic (tiny image) — the browser
 * then just uses `src`. Pure: mints URLs via `mediaVariantUrl` so the delivery
 * `?w=` never collides with the intrinsic-dims `?w=&h=` carrier.
 */
export function srcsetFor(src: unknown, intrinsicWidth: number): string | null {
  const key = mediaKeyFromSrc(src);
  if (key === null) return null;
  const widths = DELIVERY_WIDTHS.filter((w) => w <= intrinsicWidth);
  if (widths.length === 0) return null;
  return widths.map((w) => `${mediaVariantUrl(key, w)} ${w}w`).join(", ");
}

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
  // hasn't already set aspect-ratio in an inline style object. Author-set numeric
  // width/height win; otherwise fall back to the `?w=&h=` dims the picker baked
  // onto a /media/ src at authoring time (readAssetDims) — zero render-time D1.
  let w = positiveDim(props.width);
  let h = positiveDim(props.height);
  if (w === null || h === null) {
    const fromUrl = readAssetDims(props.src);
    if (fromUrl) {
      w = fromUrl.width;
      h = fromUrl.height;
    }
  }
  // Responsive srcset/sizes: when the /media/ image's intrinsic width is known,
  // advertise the delivery-width variants the media route can resize to. Author
  // srcset/sizes always win (only ABSENT props filled). srcsetFor returns null
  // for non-/media/ srcs or an image smaller than the smallest allowlist width.
  if (props.srcset === undefined && props.srcSet === undefined && w !== null) {
    const srcset = srcsetFor(props.src, w);
    if (srcset !== null) {
      set("srcset", srcset);
      if (props.sizes === undefined) set("sizes", DEFAULT_SIZES);
    }
  }

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
