/**
 * `@section` mention parsing for the chat composer (pure, node-testable).
 *
 * The composer lets the operator type `@<section name>` to tell the AI assistant
 * which Page Builder section to work on. This module is the string logic behind
 * the autocomplete: find the active `@query` at the caret, filter the page's
 * sections by it, and splice the chosen name back into the text. The textarea
 * wiring (state, keyboard, focus) lives in the component; only THIS is tested.
 *
 * A mention token is `@` + the run of non-whitespace chars up to the caret — but
 * since section names contain spaces, we match the literal section names instead:
 * the query is everything after the `@` up to the caret, and a section matches
 * when its name starts with (or contains) that query, case-insensitively.
 */

export type MentionSection = { id: string; name: string };

/** The active `@` token at the caret: the `@`'s index + the query text after it. */
export type ActiveMention = { at: number; query: string };

/**
 * Find the `@` mention being typed at `caret`. Scans left from the caret to the
 * nearest `@` that (a) starts the string or follows whitespace, and (b) has no
 * NEWLINE between it and the caret (a mention is single-line). Returns the `@`
 * index and the query (text between `@` and the caret), or null if none is open.
 *
 * The query may contain spaces (section names do), so we don't stop at the first
 * space — we stop at a newline or the start-of-token boundary. To avoid matching
 * an `@` from a long-ago line, the query is capped at 60 chars.
 */
export function findActiveMention(text: string, caret: number): ActiveMention | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  // The char before `@` must be start-of-string or whitespace (so emails like
  // "a@b" don't trigger it).
  const before = at === 0 ? "" : upto[at - 1];
  if (before !== "" && !/\s/.test(before)) return null;
  const query = upto.slice(at + 1);
  if (query.includes("\n") || query.length > 60) return null;
  return { at, query };
}

/**
 * Sections whose name matches `query` (case-insensitive). Empty query → all of
 * them. Prefix matches rank before substring matches; ties keep document order.
 */
export function filterSections(
  sections: ReadonlyArray<MentionSection>,
  query: string,
): MentionSection[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...sections];
  const prefix: MentionSection[] = [];
  const substr: MentionSection[] = [];
  for (const s of sections) {
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(s);
    else if (name.includes(q)) substr.push(s);
  }
  return [...prefix, ...substr];
}

/**
 * Splice the chosen section name into `text`, replacing the active `@query` token
 * (from `mention.at` up to `caret`) with a backticked `` `@<name>` `` token + a
 * trailing space. Backticks make it render as inline code in the sent message
 * (markdown) AND let the composer's highlight overlay style it as a pill. Returns
 * the new text and the caret position right after the inserted token.
 */
export function applyMention(
  text: string,
  caret: number,
  mention: ActiveMention,
  name: string,
): { text: string; caret: number } {
  const token = `\`@${name}\` `;
  const next = text.slice(0, mention.at) + token + text.slice(caret);
  return { text: next, caret: mention.at + token.length };
}

/**
 * Split text into plain runs and `` `@mention` `` tokens, for the composer's
 * highlight overlay. Each token is a backtick-wrapped `@...` with no inner
 * backtick. Returns ordered segments so the overlay can wrap mention segments in
 * a code-pill while leaving the rest as plain text.
 */
export type TextSegment = { mention: boolean; text: string };

const MENTION_TOKEN = /`@[^`]+`/g;

export function segmentMentions(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ mention: false, text: text.slice(last, start) });
    out.push({ mention: true, text: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ mention: false, text: text.slice(last) });
  return out;
}
