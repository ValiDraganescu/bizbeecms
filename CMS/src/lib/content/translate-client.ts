/**
 * bulk-translate-missing — the ONE browser-side `POST /api/translate` caller.
 *
 * Wraps a planner `TranslateCall` in the exact request shape, client timeout and
 * error mapping the per-field translate button established (`persist:false` —
 * the caller merges + saves itself), and normalizes the response into the
 * runner's `TranslateCallResult` so per-field, item-level and sweep flows share
 * one boundary. Browser-only (fetch/AbortController) — deliberately thin; the
 * decision logic lives in the dep-free `bulk-translate-run.ts`.
 */
import type { TranslateCall } from "./bulk-translate-plan";
import type { TranslateCallResult } from "./bulk-translate-run";

/** Abort a translate fetch that hasn't resolved by now — a client backstop above
 *  the server's 45s idle timeout so a real server 504 wins the race. */
export const CLIENT_TIMEOUT_MS = 60_000;

export async function executeTranslateCall(
  call: TranslateCall,
  opts: {
    /** Translate log target kind. Default "component" (collection flows);
     *  the page-builder bulk action sends "page". Log-only under persist:false. */
    kind?: "page" | "component";
    /** Collection table name / component name / page slug — the log target. */
    target: string;
    /** The site's default content locale (the source language). */
    fromLocale: string;
  },
): Promise<TranslateCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        kind: opts.kind ?? "component",
        target: opts.target,
        fields: call.fields,
        fromLocale: opts.fromLocale,
        toLocales: call.toLocales,
        persist: false, // callers merge into their draft / save via the item write path
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      translations?: Record<string, Record<string, string>>;
      error?: string;
      errors?: string[];
    };
    if (!res.ok || !j.ok || !j.translations) {
      return {
        ok: false,
        quota: res.status === 429,
        message: j.error ?? j.errors?.join("; ") ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, translations: j.translations };
  } catch (err) {
    // AbortError = OUR client timeout fired; callers show the i18n timeout copy.
    return {
      ok: false,
      timeout: (err as Error).name === "AbortError",
      message: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
