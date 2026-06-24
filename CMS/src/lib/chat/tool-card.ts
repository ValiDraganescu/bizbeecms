/**
 * ai-widget-ux — pure formatting helpers for the chat transcript's tool cards.
 *
 * The tool result frame (`ToolResult` in `client-sse.ts`) carries the tool name
 * plus a per-tool "subject" (component / page / target). The old card rendered
 * `{name}: {action} {subject}`, but `subject` fell back to `name`, so tools with
 * no subject (e.g. `get_brand_identity`) printed the name TWICE. These helpers
 * compute the subject and a clean one-line label so the name appears once, and
 * pretty-print the input/output blobs for the accordion.
 *
 * PURE (no DOM/React) → unit-tested with dep-free `node --test`.
 */
import type { ToolResult } from "./client-sse";

/**
 * The meaningful subject of a tool call, or undefined when there isn't one.
 * Never returns the tool name (that's what caused the duplicate label).
 */
export function toolSubject(tool: Pick<ToolResult, "name" | "component" | "page" | "target">): string | undefined {
  const candidate = tool.component ?? tool.page ?? tool.target;
  if (!candidate || candidate === tool.name) return undefined;
  return candidate;
}

/**
 * The one-line summary suffix shown after the tool name: "action subject",
 * "action", "subject", or "" — name is rendered separately so it never repeats.
 */
export function toolSummary(tool: Pick<ToolResult, "name" | "action" | "component" | "page" | "target">): string {
  const subject = toolSubject(tool);
  const action = tool.action?.trim() || undefined;
  return [action, subject].filter(Boolean).join(" ");
}

/** Pretty-print a tool input/output blob to a string (no truncation). */
function stringifyBlob(value: unknown): string {
  if (value === undefined) return "";
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Pretty-print a tool input/output blob for the accordion, truncated for huge values. */
export function formatBlob(value: unknown, max = 4000): string {
  const text = stringifyBlob(value);
  if (text.length > max) return `${text.slice(0, max)}\n… (${text.length - max} more chars)`;
  return text;
}

/**
 * A blob view for the accordion's "show more" toggle: the full pretty-printed
 * text, a truncated preview, the hidden-char count, and whether truncation happened.
 * The component shows `preview` collapsed and `full` when expanded.
 */
export function blobView(value: unknown, max = 4000): {
  full: string;
  preview: string;
  hidden: number;
  truncated: boolean;
} {
  const full = stringifyBlob(value);
  if (full.length <= max) return { full, preview: full, hidden: 0, truncated: false };
  return {
    full,
    preview: `${full.slice(0, max)}\n… (${full.length - max} more chars)`,
    hidden: full.length - max,
    truncated: true,
  };
}
