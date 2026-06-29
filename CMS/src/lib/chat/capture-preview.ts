/**
 * Capture the rendered component preview at several viewport widths as PNGs, so
 * the operator can hand the AI assistant a real picture of how a component looks
 * across screen sizes (the model is a vision model; it reasons over the images).
 *
 * Fully client-side — no server, no Browser Rendering, no cost: we mount the
 * existing same-origin `/preview/component/<name>` route in an OFFSCREEN iframe
 * per width, let it render with full compiled Tailwind, then snapshot the iframe
 * document body with `modern-screenshot`. Offscreen-per-width (not resizing the
 * visible preview) keeps captures deterministic and leaves the UI undisturbed.
 *
 * Browser-only (DOM + modern-screenshot). Not node-tested; the pure bit worth a
 * check is `previewCaptureName` (the label), tested in scripts/.
 */
import { domToPng } from "modern-screenshot";

export interface CaptureViewport {
  /** Stable key + label, e.g. "mobile". */
  id: string;
  /** Human label for the file name, e.g. "Mobile". */
  label: string;
  /** CSS pixel width to render at. */
  width: number;
}

/** The three sizes the Develop workbench offers (mirrors the page builder). */
export const CAPTURE_VIEWPORTS: CaptureViewport[] = [
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 375 },
];

/** The attachment file name for one capture, e.g. "Hero — Mobile (375px).png". */
export function previewCaptureName(component: string, vp: CaptureViewport): string {
  return `${component} — ${vp.label} (${vp.width}px).png`;
}

export interface CapturedPreview {
  id: string;
  width: number;
  /** `data:image/png;base64,...` */
  dataUrl: string;
  name: string;
}

/**
 * Race a promise against a timeout so a single hung step (modern-screenshot can
 * stall while inlining a slow/cross-origin background image) can never lock the
 * "Capturing…" button forever — it rejects, the caller skips that viewport.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(tid);
        resolve(v);
      },
      (e) => {
        clearTimeout(tid);
        reject(e);
      },
    );
  });
}

/**
 * Mount one offscreen iframe of the given width, wait for it to render, capture
 * its body to a PNG, then tear it down. Rejects on load timeout so one bad width
 * doesn't hang the batch.
 */
async function captureOne(
  component: string,
  vp: CaptureViewport,
  theme: "light" | "dark" | undefined,
  signal?: AbortSignal,
): Promise<CapturedPreview> {
  const iframe = document.createElement("iframe");
  // Offscreen, but a real layout box (display:none would zero-size the render).
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${vp.width}px;height:900px;border:0;background:#fff;`;
  const themeQuery = theme ? `?theme=${theme}` : "";
  iframe.src = `/preview/component/${encodeURIComponent(component)}${themeQuery}`;

  const done = new Promise<void>((resolve, reject) => {
    const onLoad = () => resolve();
    iframe.addEventListener("load", onLoad, { once: true });
    // ponytail: fixed 8s ceiling; a component that won't load in 8s won't render.
    const tid = setTimeout(() => reject(new Error(`preview load timed out (${vp.id})`)), 8000);
    iframe.addEventListener("load", () => clearTimeout(tid), { once: true });
    signal?.addEventListener("abort", () => {
      clearTimeout(tid);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

  document.body.appendChild(iframe);
  try {
    await done;
    // One paint frame so fonts/images settle before the snapshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const doc = iframe.contentDocument;
    if (!doc?.body) throw new Error(`preview document unavailable (${vp.id})`);
    // Capture the body at the iframe's own width; height grows to content.
    // `timeout` bounds modern-screenshot's per-resource wait; `withTimeout` is the
    // hard outer ceiling so the whole call can never hang (the reported bug).
    const dataUrl = await withTimeout(
      domToPng(doc.body, {
        width: vp.width,
        backgroundColor: "#ffffff",
        // Render at 1x — these are layout previews for the model, not retina assets.
        scale: 1,
        // Don't let a slow/cross-origin resource stall the snapshot indefinitely.
        timeout: 6000,
        // Skip web-font embedding — it fetches font files and is the main hang
        // source; the runtime CSS uses system fonts, so layout is unaffected.
        font: false,
      }),
      10000,
      `screenshot (${vp.id})`,
    );
    return { id: vp.id, width: vp.width, dataUrl, name: previewCaptureName(component, vp) };
  } finally {
    iframe.remove();
  }
}

/**
 * Capture the component at each requested viewport. Runs sequentially (each
 * spins a fresh iframe) — three small renders, no need to parallelize. A failed
 * width is skipped (logged by the caller via the returned errors), not fatal.
 */
export async function capturePreviews(
  component: string,
  viewports: CaptureViewport[] = CAPTURE_VIEWPORTS,
  theme?: "light" | "dark",
  signal?: AbortSignal,
): Promise<{ captures: CapturedPreview[]; errors: string[] }> {
  const captures: CapturedPreview[] = [];
  const errors: string[] = [];
  for (const vp of viewports) {
    try {
      captures.push(await captureOne(component, vp, theme, signal));
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      errors.push((err as Error).message);
    }
  }
  return { captures, errors };
}
