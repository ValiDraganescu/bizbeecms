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

/** Pretty-print a tool input/output blob for the accordion, truncated for huge values. */
export function formatBlob(value: unknown, max = 4000): string {
  if (value === undefined) return "";
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length > max) return `${text.slice(0, max)}\n… (${text.length - max} more chars)`;
  return text;
}
