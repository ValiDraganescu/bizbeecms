/**
 * Design-system library tools — list/get the shipped DESIGN.md archetypes.
 *
 * A design system is a DESIGN.md file (https://github.com/google-labs-code/design.md):
 * YAML frontmatter of design tokens (colors incl. our `dark-*` extension,
 * typography, spacing, rounded, components) + markdown prose (layout, elevation,
 * shapes, imagery, do's and don'ts). The library lives in design-systems/ and is
 * bundled at build time into design-systems.generated.ts (no runtime FS on
 * Workers); scripts/generate-design-systems.mjs regenerates it.
 *
 * Mirrors the static-guide pattern (data-sources-guide.ts): PURE module, the CF
 * wiring is two trivial handlers in tool-dispatch.ts. The apply path is the
 * existing update_theme tool — these tools only read.
 */
import { DESIGN_SYSTEMS, type DesignSystem } from "./design-systems.generated.ts";

export const LIST_DESIGN_SYSTEMS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_design_systems",
    description:
      "List the built-in design-system archetypes (DESIGN.md files: design " +
      "tokens + prose design guidance). Each entry has slug, name, and a " +
      "description of the aesthetic and what kind of site it suits. Call this " +
      "when styling a site from scratch or when the operator asks for a look " +
      "('make it feel like fine dining'), then get_design_system for the one " +
      "that fits.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const GET_DESIGN_SYSTEM_TOOL = {
  type: "function" as const,
  function: {
    name: "get_design_system",
    description:
      "Fetch one design-system archetype's full DESIGN.md: YAML design tokens " +
      "(colors with dark-* dark-mode variants, typography levels, spacing, " +
      "rounded, component styles) plus prose rules (layout rhythm, elevation, " +
      "shapes, imagery direction, do's and don'ts). Apply its colors/fonts to " +
      "the site via update_theme (override accent colors and font families " +
      "with the client's brand first), and follow the prose when authoring " +
      "components.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The design system's slug from list_design_systems.",
        },
      },
      required: ["slug"],
    },
  },
} as const;

export function listDesignSystems(): { ok: true; designSystems: Omit<DesignSystem, "content">[] } {
  return {
    ok: true,
    designSystems: DESIGN_SYSTEMS.map(({ slug, name, description }) => ({ slug, name, description })),
  };
}

export function getDesignSystem(args: unknown): { ok: true; designSystem: DesignSystem } | { ok: false; errors: string[] } {
  const slug = (args as { slug?: unknown } | null | undefined)?.slug;
  if (typeof slug !== "string" || !slug.trim()) {
    return { ok: false, errors: ["slug is required — call list_design_systems for the available slugs"] };
  }
  const wanted = slug.trim().toLowerCase();
  const hit = DESIGN_SYSTEMS.find(
    (d) => d.slug.toLowerCase() === wanted || d.name.toLowerCase() === wanted,
  );
  if (!hit) {
    const available = DESIGN_SYSTEMS.map((d) => d.slug).join(", ");
    return { ok: false, errors: [`unknown design system "${slug}" — available: ${available}`] };
  }
  return { ok: true, designSystem: hit };
}
