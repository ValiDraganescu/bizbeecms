"use client";

/**
 * Executes AI-authored component client scripts after hydration.
 *
 * WHY THIS EXISTS: a `<script dangerouslySetInnerHTML>` rendered by React is
 * INERT — neither React's hydration reconciliation nor the browser's innerHTML
 * insertion runs inline `<script>` content (a DOM security rule). All prior
 * components shipped an empty `script`, so the inert path was never exercised;
 * the first INTERACTIVE component (Combobox) surfaced it: the markup mounted but
 * the wiring never ran.
 *
 * The fix is the standard "run inline script after mount" pattern: on the client,
 * create a REAL `<script>` element per source, set its `.text`, and append it —
 * a script element inserted this way DOES execute. We run each distinct source
 * once (the plan already de-dupes per component, but StrictMode double-invokes
 * effects, so we guard with a module-level Set keyed by source text).
 *
 * The scripts are author IIFEs that wire `[data-...]` roots already present in
 * the SSR'd DOM, so running them post-hydration is correct: the nodes exist, and
 * the script attaches behavior to them.
 */
import { useEffect } from "react";

// Survives StrictMode's double effect-invoke AND multiple ClientScripts mounts
// on one page (each distinct source runs exactly once per document).
const ran = new Set<string>();

export function ClientScripts({ scripts }: { scripts: string[] }) {
  useEffect(() => {
    for (const src of scripts) {
      if (!src || ran.has(src)) continue;
      ran.add(src);
      const el = document.createElement("script");
      el.text = src;
      document.body.appendChild(el);
    }
  }, [scripts]);
  return null;
}
