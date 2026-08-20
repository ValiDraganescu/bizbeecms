# Design-system library

Reusable DESIGN.md archetypes (format: https://github.com/google-labs-code/design.md — YAML design tokens + prose rationale, alpha spec). One folder per archetype, the file always named `DESIGN.md`. These files are the source of truth; `scripts/generate-design-systems.mjs` bundles them into `src/lib/chat/design-systems.generated.ts` (runs on prebuild; rerun it after editing and commit both — `scripts/design-systems.test.mjs` fails on drift).

The library ships with every Site and is served by the shared tool registry to all three consumers: the in-CMS assistant, external MCP clients (`list_design_systems` / `get_design_system`), and — planned — the Theme page's preset picker.

## Workflow

1. **Pick** the archetype matching the client's category and mood (`list_design_systems`; a restaurant build picks from `profile.json` category/price level).
2. **Override** the marked slots with the client's brand (see each file's "Override slots" paragraph in Overview): accent colors and font families from `brand.json`; sizes, weights, spacing and all prose stay — they ARE the archetype.
3. **Apply** colors + typography to the Site theme via `update_theme` (light AND dark maps) and the Theme page's font picks. `npx -y @google/design.md export --format css-tailwind DESIGN.md` emits Tailwind v4 `@theme` vars if useful.
4. **Author components** following the prose sections (Layout, Elevation, Shapes, Components, Imagery, Do's and Don'ts) — this is the part the theme config cannot hold. cms-components rules (theme tokens only, `{{t prop}}`) still apply.

## Conventions (our extensions to the alpha spec)

- **Dark mode:** the spec is single-palette; we add `dark-`-prefixed color tokens plus a `## Dark Mode` prose section. Both light and dark values feed the CMS theme's Light/Dark tabs.
- **Semantic roles:** `success`/`warning`/`danger`/`info` tokens exist to fill the CMS theme's role slots even when no component references them.
- **Frontmatter `name:` and `description:` are required** — the generator refuses files without them, and `list_design_systems` routes on the description, so write it as when-to-use guidance.
- **Expected lint warnings:** `npx -y @google/design.md lint DESIGN.md` must report **0 errors**; `orphaned-tokens` warnings on `dark-*` and semantic tokens are expected (they map to theme roles, not components), as is the `contrast-ratio` warning on transparent-background ghost buttons (the linter can't see the surface beneath).

## Archetypes

- `nordic-fine-dining/` — editorial, calm, seasonal; fine-dining & chef-driven restaurants. Warm paper neutrals, near-black ink, one botanical accent, condensed sans headlines, typographic menus, photography-led. Validated against Taivaanranta (accent → #5a4d6a plum, fonts → Antonio/Poppins/Dancing Script).
