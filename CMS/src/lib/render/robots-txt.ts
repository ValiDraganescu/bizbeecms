/**
 * robots.txt builder — per-Site crawler rules (seo-robots goal, track #3). PURE
 * (no fetch/D1/CF) so it's dep-free node --test-able. The route
 * (`app/robots.ts`) reads the stored config + origin and calls `buildRobotsTxt`.
 *
 * Two modes:
 *   1. Structured rules — per-user-agent allow/disallow rows, generated into the
 *      standard `User-agent:` / `Disallow:` / `Allow:` grammar.
 *   2. Free-text override — when set (non-blank), it's served VERBATIM and the
 *      structured rules are ignored ("advanced" escape hatch). The Sitemap
 *      pointer is still appended after it unless the operator already wrote one.
 *
 * The `Sitemap:` line points at `<origin>/sitemap.xml`; when the origin is
 * unknown (local dev, no APP_ORIGIN) the pointer is omitted — same discipline
 * sitemap.ts uses, never emit a wrong host.
 */

/** One structured rule group: a user-agent plus its allow/disallow paths. */
export interface RobotsRuleGroup {
  /** User-agent token, e.g. "*" or "Googlebot". */
  userAgent: string;
  /** Paths to Disallow (each becomes a `Disallow:` line). */
  disallow: string[];
  /** Paths to Allow (each becomes an `Allow:` line). */
  allow: string[];
}

/** The per-Site robots config as stored in `site_settings` (JSON). */
export interface RobotsConfig {
  /** Structured rule groups (used when `freeText` is blank). */
  groups: RobotsRuleGroup[];
  /** Verbatim override — when non-blank, replaces the generated rules. */
  freeText: string;
}

/**
 * The seeded default: allow all, keep crawlers out of the non-public surface.
 * Matches the paths the worker edge-cache gate already treats as private.
 */
export function defaultRobotsConfig(): RobotsConfig {
  return {
    groups: [
      { userAgent: "*", disallow: ["/admin", "/api", "/preview"], allow: [] },
    ],
    freeText: "",
  };
}

/** A path line is kept only if it starts with `/` and has no CR/LF/whitespace-only. */
function cleanPath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const t = p.trim();
  if (!t.startsWith("/")) return null;
  // No newlines (would break the line-oriented format / allow injection).
  if (/[\r\n]/.test(t)) return null;
  return t;
}

function cleanUserAgent(ua: unknown): string | null {
  if (typeof ua !== "string") return null;
  const t = ua.trim();
  if (!t || /[\r\n:]/.test(t)) return null;
  return t;
}

/**
 * Defensively normalize an unknown value into a RobotsConfig — bad/missing
 * fields fall back to the seeded default. Used on read so hand-edited garbage
 * never breaks the served file.
 */
export function normalizeRobotsConfig(input: unknown): RobotsConfig {
  if (!input || typeof input !== "object") return defaultRobotsConfig();
  const obj = input as Record<string, unknown>;

  const freeText = typeof obj.freeText === "string" ? obj.freeText : "";

  const rawGroups = Array.isArray(obj.groups) ? obj.groups : [];
  const groups: RobotsRuleGroup[] = [];
  for (const g of rawGroups) {
    if (!g || typeof g !== "object") continue;
    const gg = g as Record<string, unknown>;
    const userAgent = cleanUserAgent(gg.userAgent);
    if (!userAgent) continue;
    const disallow = (Array.isArray(gg.disallow) ? gg.disallow : [])
      .map(cleanPath)
      .filter((p): p is string => p !== null);
    const allow = (Array.isArray(gg.allow) ? gg.allow : [])
      .map(cleanPath)
      .filter((p): p is string => p !== null);
    groups.push({ userAgent, disallow, allow });
  }

  // Empty/blank structured config with no override → seeded default, so a
  // never-configured site still serves the sane default rules.
  if (groups.length === 0 && !freeText.trim()) return defaultRobotsConfig();
  return { groups, freeText };
}

/**
 * Render the robots.txt body from a (normalized) config. `origin` is the site's
 * public origin for the `Sitemap:` pointer; pass null to omit the pointer.
 * Always ends with a trailing newline. PURE.
 */
export function buildRobotsTxt(config: RobotsConfig, origin: string | null): string {
  const normalized = normalizeRobotsConfig(config);
  const lines: string[] = [];

  const override = normalized.freeText.trim();
  if (override) {
    lines.push(override);
  } else {
    for (const g of normalized.groups) {
      lines.push(`User-agent: ${g.userAgent}`);
      for (const a of g.allow) lines.push(`Allow: ${a}`);
      for (const d of g.disallow) lines.push(`Disallow: ${d}`);
      lines.push(""); // blank line between groups (robots.txt convention)
    }
    // Drop the trailing blank so we control the final newline.
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
  }

  // Sitemap pointer: absolute URL, only when the origin is known and the
  // operator didn't already write their own Sitemap: line in the override.
  if (origin) {
    const trimmed = origin.trim().replace(/\/+$/, "");
    const hasOwnSitemap = /^\s*sitemap\s*:/im.test(override);
    if (trimmed && !hasOwnSitemap) {
      if (lines.length) lines.push("");
      lines.push(`Sitemap: ${trimmed}/sitemap.xml`);
    }
  }

  return lines.join("\n") + "\n";
}
