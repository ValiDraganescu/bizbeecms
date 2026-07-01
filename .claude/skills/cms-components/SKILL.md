---
name: cms-components
description: Build and iterate on reusable UI components for a bizbeecms CMS Site via its MCP tools (mcp__<site>__create_component etc.). Use when the user asks to add/redesign a component or hero, create design variations, or match a reference screenshot. Covers the author→preview→fix loop, generating images (incl. transparent cut-outs), and the hard rules (theme tokens only, real glyphs, full-height layout) learned the hard way.
argument-hint: "[what to build, e.g. 'a hero like this screenshot, two variations']"
allowed-tools: Read, Bash, mcp__local-site__get_authoring_guide, mcp__local-site__get_theme, mcp__local-site__get_brand_identity, mcp__local-site__list_components, mcp__local-site__get_component, mcp__local-site__create_component, mcp__local-site__update_component, mcp__local-site__list_assets, mcp__local-site__generate_image, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer
---

# Building CMS components

How to author good components for a bizbeecms Site over MCP. The MCP server is namespaced per site — here it's `mcp__local-site__*`; substitute the actual connected site's prefix.

## Before you build (always)

1. `get_authoring_guide` (guide:"components" or "page-builder") — the Site's own rules + its existing components, collections, locales, brand. Follow it; it's the source of truth.
2. `get_theme` — the available color tokens (you may use ONLY these for color; see below).
3. `list_components` / `get_component` — reuse or update; never duplicate. To edit: `get_component`, WAIT for the result, THEN `create_component`/`update_component` with the FULL artifact (they REPLACE, not merge — partial/empty html erases the component).

## Hard rules (each learned by getting it wrong)

- **Colors: theme tokens ONLY.** Never raw palette (`zinc-950`, `green-700`, `amber-200`) or hex/oklch literals. Tokens: `surface`, `surface-muted`, `surface-raised`, `foreground`, `foreground-muted`, `border`, `primary` (+`-hover`/`-foreground`/`-subtle`), `danger`/`success`/`warning`/`info` (+variants), `ring`. Use as `bg-`/`text-`/`border-`/`from-`/`to-`/`via-`; opacity modifiers are fine (`text-surface/80`). Layout/spacing arbitrary values (`h-[37px]`, `grid-cols-[1fr_2fr]`) are fine — only COLOR is restricted. A reference's palette (cream/red, amber) will NOT survive this; tell the user the look shifts to the theme, or offer to update the theme tokens first.
- **A dark hero is built from tokens, not hardcoded dark.** `bg-foreground` as the dark base, `from-foreground` gradients to darken a photo, `text-surface` for light text, `text-primary` for accents — correct in both light/dark mode.
- **Real Unicode glyphs, never HTML entities.** The renderer does NOT decode entities — `&rarr;`/`&#9788;` render as literal text. Type the actual char: `→ ☽ — · ©`.
- **`{{t prop}}` for every translatable text slot**, and declare `translatable:true` in propsSchema. Set values for ALL site locales on a page (locale object), not just en.
- **`type:"image"` for any asset-URL prop** → the editor shows a gallery picker (not a text box). Default to a real `/media` URL from `list_assets` or `generate_image`.
- **No nav bars in a hero** unless asked — nav belongs in a site header. Keep social links if the reference has them.

## Images

- Need a new image? `generate_image` with a detailed prompt (subject, style, composition, colors, mood). It saves to the gallery, auto-describes, tags, and returns a `/media` URL.
- **Subject that sits ON a section background** (logo, icon, food/product illustration) → `transparentBackground:true`. It renders on white then algorithmically cuts the white out, so there's no white box. A full-bleed photo backdrop does NOT need this.
- Generated raster images carry their own colors — the theme-token rule is about component CSS, not image pixels.

## Layout that matches a reference

- Study the reference's VERTICAL rhythm, not just the columns. A footer-anchored row (social links, address) must be pinned to the bottom: make the `<section>` a `flex flex-col`, the main content grid `flex-1` (fills height, centers), and the footer a sibling after it. A single centered grid will vertically-center the footer too — the classic miss.
- Let a feature illustration be LARGE and bleed toward the edge (`w-[130%]` + `translate-x`) when the reference does; don't shrink it into a tidy `object-contain` half.

## Variations

- When asked for alternatives, give them the SAME prop keys + SAME default content, differing ONLY in look (alignment, CTA style, overlay weight, image prominence). Then swapping one for another on a page keeps all content intact. Don't let two "variations" collapse into the same layout — make the look genuinely diverge.

## Verify in the browser (every change)

After create/update, preview it — don't trust the markup:
1. `navigate` to `http://<dev-host>/preview/component/<Name>` (the dev server is http, not https).
2. `wait` ~2s, then `screenshot` (or `zoom` a region).
3. Check the gotchas visually: entities rendered as glyphs? cut-out transparent (no white box)? footer at the bottom? colors are theme tokens?
4. Fix and re-preview until it matches.

## These rules also live in the CMS

The universal authoring rules (theme tokens, glyphs-not-entities, cut-outs) are baked into the Site's own `get_authoring_guide` prompt, so the in-CMS assistant follows them too. If you change a rule here, consider updating `CMS/src/lib/settings/site-settings.ts` (the prompt source) to match.
