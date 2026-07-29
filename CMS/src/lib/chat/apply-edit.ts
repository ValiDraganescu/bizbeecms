/**
 * String-replace edit core — patch a span of text WITHOUT re-emitting the whole
 * field (the strategy code-editing agents like opencode/Claude Code use). The
 * model sends `oldString` + `newString`; we locate `oldString` and replace just
 * that span, so untouched text can't drift or pick up errors, and long fields
 * cost a snippet instead of a full rewrite.
 *
 * Like opencode, we try a CASCADE of increasingly lenient matchers and stop at
 * the first that finds the span — exact first, then whitespace-tolerant variants —
 * because a model rarely reproduces indentation/trailing-space perfectly. We keep
 * the high-value subset (exact → line-trimmed → block-anchor → whitespace-
 * normalized); add more matchers only when a real edit can't be located.
 *
 * Two safety rails: a match must be UNIQUE unless `replaceAll` (ambiguous edits
 * are rejected so we never patch the wrong place), and the matched span may not be
 * disproportionately larger than `oldString` (a loose matcher must not swallow
 * half the document). PURE (no D1/React/CF) → node-testable.
 */

export type EditResult =
  | { ok: true; content: string; replacements: number; matcher: string }
  | { ok: false; error: string };

/** A matcher returns the [start,end) spans in `content` it considers matches of `oldString`. */
type Matcher = { name: string; find: (content: string, oldString: string) => Array<[number, number]> };

/** Exact substring matches. */
const exact: Matcher = {
  name: "exact",
  find(content, oldString) {
    const spans: Array<[number, number]> = [];
    let from = 0;
    for (;;) {
      const i = content.indexOf(oldString, from);
      if (i === -1) break;
      spans.push([i, i + oldString.length]);
      from = i + Math.max(1, oldString.length);
    }
    return spans;
  },
};

/**
 * Line-trimmed: match a run of lines whose TRIMMED text equals the trimmed lines
 * of `oldString` (tolerates leading/trailing whitespace differences per line).
 * Only meaningful for a multi-or-single line block aligned to line boundaries.
 */
const lineTrimmed: Matcher = {
  name: "line-trimmed",
  find(content, oldString) {
    const needle = oldString.split("\n").map((l) => l.trim());
    if (needle.length === 0) return [];
    const lines = content.split("\n");
    // Precompute each line's char offset in content.
    const offsets: number[] = [];
    let acc = 0;
    for (const l of lines) {
      offsets.push(acc);
      acc += l.length + 1; // + "\n"
    }
    const spans: Array<[number, number]> = [];
    for (let i = 0; i + needle.length <= lines.length; i++) {
      let hit = true;
      for (let j = 0; j < needle.length; j++) {
        if (lines[i + j].trim() !== needle[j]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        const start = offsets[i];
        const lastLine = i + needle.length - 1;
        const end = offsets[lastLine] + lines[lastLine].length;
        spans.push([start, end]);
      }
    }
    return spans;
  },
};

/**
 * Block-anchor: for a block of >= 3 lines, anchor on the FIRST and LAST trimmed
 * lines and accept the span between matching anchors. Handles a middle that drifted
 * slightly (the model paraphrased whitespace) without full-line equality.
 */
const blockAnchor: Matcher = {
  name: "block-anchor",
  find(content, oldString) {
    const needle = oldString.split("\n");
    if (needle.length < 3) return [];
    const first = needle[0].trim();
    const last = needle[needle.length - 1].trim();
    if (first === "" || last === "") return [];
    const lines = content.split("\n");
    const offsets: number[] = [];
    let acc = 0;
    for (const l of lines) {
      offsets.push(acc);
      acc += l.length + 1;
    }
    const spans: Array<[number, number]> = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== first) continue;
      // find the nearest following line equal to `last`
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].trim() === last) {
          spans.push([offsets[i], offsets[k] + lines[k].length]);
          break;
        }
      }
    }
    return spans;
  },
};

/** Collapse all whitespace runs to a single space (for whitespace-tolerant compare). */
function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Whitespace-normalized: scan candidate spans of content whose collapsed
 * whitespace equals the collapsed `oldString`. We only test spans that START at a
 * whitespace boundary and have a plausible length, to keep it linear-ish.
 */
const whitespaceNormalized: Matcher = {
  name: "whitespace-normalized",
  find(content, oldString) {
    const target = collapseWs(oldString);
    if (target === "") return [];
    const spans: Array<[number, number]> = [];
    // Candidate start positions: index 0 and any char after whitespace.
    for (let i = 0; i < content.length; i++) {
      if (i > 0 && !/\s/.test(content[i - 1])) continue;
      // Grow a window until its collapsed form is at least as long as target.
      // Cap the window so a loose match can't scan the whole doc per start.
      const maxEnd = Math.min(content.length, i + oldString.length * 2 + 16);
      for (let j = i + 1; j <= maxEnd; j++) {
        if (collapseWs(content.slice(i, j)) === target) {
          spans.push([i, j]);
          break;
        }
      }
    }
    return spans;
  },
};

const MATCHERS: Matcher[] = [exact, lineTrimmed, blockAnchor, whitespaceNormalized];

/** Reject a span that's wildly larger than oldString (a loose matcher overreached). */
function disproportionate(spanLen: number, oldLen: number): boolean {
  // allow generous slack for whitespace/indent, but not swallowing the document
  return oldLen > 0 && spanLen > oldLen * 3 + 64;
}

/**
 * Apply a string-replace edit to `content`. Tries each matcher in order; the first
 * that finds matches wins. Without `replaceAll`, exactly one match is required
 * (ambiguity → error). Returns the new content + how many spans were replaced.
 */
export function applyEdit(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): EditResult {
  if (typeof content !== "string") return { ok: false, error: "content must be a string" };
  if (typeof oldString !== "string" || oldString === "") {
    return { ok: false, error: "oldString must be a non-empty string" };
  }
  if (typeof newString !== "string") return { ok: false, error: "newString must be a string" };
  if (oldString === newString) return { ok: false, error: "oldString and newString are identical" };

  for (const matcher of MATCHERS) {
    const spans = dedupe(matcher.find(content, oldString));
    if (spans.length === 0) continue;

    if (!replaceAll && spans.length > 1) {
      return {
        ok: false,
        error: `oldString is not unique (${spans.length} matches via ${matcher.name}); add surrounding context or set replaceAll`,
      };
    }
    // Guard each span against overreach.
    for (const [s, e] of spans) {
      if (disproportionate(e - s, oldString.length)) {
        return {
          ok: false,
          error: `matched span is much larger than oldString (via ${matcher.name}); provide more exact context`,
        };
      }
    }
    // Replace right-to-left so earlier offsets stay valid.
    const ordered = [...spans].sort((a, b) => b[0] - a[0]);
    let out = content;
    for (const [s, e] of ordered) out = out.slice(0, s) + newString + out.slice(e);
    return { ok: true, content: out, replacements: spans.length, matcher: matcher.name };
  }

  return { ok: false, error: "oldString not found in the text" };
}

// ── replaceBetween mode ───────────────────────────────────────────────────────

/** Cap a quoted near-miss so an error stays readable. */
function clip(s: string): string {
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

/**
 * Find the nearest NEAR-MISS of `needle` in `content` — the text the caller
 * probably MEANT when their exact marker didn't match. Reuses the lenient
 * matcher cascade (line-trimmed → block-anchor → whitespace-normalized), then a
 * case-insensitive scan, then the longest matchable prefix (≥ 6 chars). Returns
 * the actual text from `content` (clipped), or null when nothing is close.
 */
export function nearestNearMiss(content: string, needle: string): string | null {
  for (const matcher of [lineTrimmed, blockAnchor, whitespaceNormalized]) {
    const spans = matcher.find(content, needle);
    if (spans.length > 0) return clip(content.slice(spans[0][0], spans[0][1]));
  }
  const ci = content.toLowerCase().indexOf(needle.toLowerCase());
  if (ci !== -1) return clip(content.slice(ci, ci + needle.length));
  for (let len = needle.length - 1; len >= 6; len--) {
    const at = content.indexOf(needle.slice(0, len));
    if (at !== -1) return clip(content.slice(at, at + Math.min(needle.length + 24, content.length - at)));
  }
  return null;
}

/** Error-message suffix quoting the nearest near-miss (empty when none). */
function nearMissSuffix(content: string, needle: string): string {
  const near = nearestNearMiss(content, needle);
  return near === null ? "" : ` — nearest near-miss in the text: ${JSON.stringify(near)}`;
}

/**
 * Replace the text BETWEEN a `start` and an `end` marker (exact matches — a
 * marker is something the caller read verbatim, so no lenient cascade; the
 * near-miss quote guides a correction instead). Semantics: pick the chosen
 * `start` match (`occurrence`, 1-based; REQUIRED when `start` matches more
 * than once), then the FIRST `end` after it. `inclusive` replaces the markers
 * too; the default keeps them and replaces only the span between.
 */
export function applyBetween(
  content: string,
  start: string,
  end: string,
  newString: string,
  opts: { inclusive?: boolean; occurrence?: number | null } = {},
): EditResult {
  if (typeof content !== "string") return { ok: false, error: "content must be a string" };
  if (typeof start !== "string" || start === "") {
    return { ok: false, error: "start must be a non-empty string" };
  }
  if (typeof end !== "string" || end === "") {
    return { ok: false, error: "end must be a non-empty string" };
  }
  if (typeof newString !== "string") return { ok: false, error: "newString must be a string" };

  const starts = exact.find(content, start);
  if (starts.length === 0) {
    return { ok: false, error: `start marker not found in the text${nearMissSuffix(content, start)}` };
  }
  const occurrence = opts.occurrence ?? null;
  if (occurrence === null && starts.length > 1) {
    return {
      ok: false,
      error: `start matches ${starts.length} times — pass occurrence (1-${starts.length}) to pick which match`,
    };
  }
  const nth = occurrence ?? 1;
  if (!Number.isInteger(nth) || nth < 1 || nth > starts.length) {
    return {
      ok: false,
      error: `occurrence ${nth} is out of range — start matches ${starts.length} ${starts.length === 1 ? "time" : "times"}`,
    };
  }
  const [s0, s1] = starts[nth - 1];
  const endAt = content.indexOf(end, s1);
  if (endAt === -1) {
    return {
      ok: false,
      error: `end marker not found after the chosen start marker${nearMissSuffix(content.slice(s1), end)}`,
    };
  }
  const from = opts.inclusive === true ? s0 : s1;
  const to = opts.inclusive === true ? endAt + end.length : endAt;
  return {
    ok: true,
    content: content.slice(0, from) + newString + content.slice(to),
    replacements: 1,
    matcher: "between-exact",
  };
}

/** Drop overlapping/duplicate spans (keep the earliest), so counts/replaces are clean. */
function dedupe(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  let lastEnd = -1;
  for (const [s, e] of sorted) {
    if (s >= lastEnd) {
      out.push([s, e]);
      lastEnd = e;
    }
  }
  return out;
}
