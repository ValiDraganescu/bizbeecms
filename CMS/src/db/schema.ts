import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * bizbeecms CMS — per-Site D1 (SQLite) schema (Milestone 2, epic A1).
 *
 * The CMS is the product: an AI assistant authors custom UI components and
 * composes pages from them. The settled architecture (see main GOAL.md M2):
 * the AI emits a component artifact `{ tree, script, css }` — NOT JSX source
 * to eval. The Worker SSRs the JSON `tree` via React.createElement, ships the
 * `script` string to the browser, and resolves `css` against a precompiled
 * utility sheet.
 *
 * This schema persists that artifact + the page block-tree per Site in D1.
 * Each deployed CMS Worker has its OWN D1 database (one per Site), so these
 * tables are NOT scoped by a site id — the database IS the site boundary.
 *
 * Mined from `../aicms` (page/component generic mechanics) but adapted:
 * SQLite/D1 instead of Postgres, and the artifact model `{tree,script,css}`
 * instead of raw JSX `source`. NO domain/entity tables (artwork/product/…) —
 * content is generic Pages + components; "blog" is a page that lists pages.
 */

/**
 * Component — an AI-authored (or premade) custom UI component, stored as the
 * portable `{ tree, script, css }` artifact (all JSON/text, no eval, no binary).
 * `tree`/`propsSchema` are JSON strings; `script`/`css` are plain text.
 * Because a component is pure data, export/import across Sites is trivial (epic H).
 */
export const component = sqliteTable(
  "component",
  {
    id: text("id").primaryKey(),
    // Stable identifier the page block tree references (e.g. "PricingCard").
    name: text("name").notNull(),
    // JSON element tree the Worker SSRs via React.createElement (a data walk).
    tree: text("tree").notNull().default("{}"),
    // AI-authored client JS shipped to the browser as a <script> string. The
    // Worker forwards it as data; the browser executes it. Empty = static.
    script: text("script").notNull().default(""),
    // Tailwind classes / rare custom CSS resolved against the precompiled sheet.
    css: text("css").notNull().default(""),
    // Optional JSON describing expected props (used by the AI + import validation).
    propsSchema: text("props_schema"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("component_name_unique").on(t.name)],
);

export type PublishStatus = "draft" | "published";

/**
 * Page — a page composed from components, stored as a JSON block tree.
 * Hierarchy via `parentPageId` (a "blog" is just a page whose children are
 * the posts). SEO/meta are per-locale JSON maps (content locales are
 * data-driven per Site, distinct from the EN/FI/ET admin UI — see C1).
 */
export const page = sqliteTable(
  "page",
  {
    id: text("id").primaryKey(),
    // URL path segment. The public route is a catch-all that resolves this.
    slug: text("slug").notNull(),
    // Self-reference for tree hierarchy (null = top-level). No FK so a parent
    // delete doesn't cascade-orphan silently; the app resolves the tree.
    parentPageId: text("parent_page_id"),
    displayOrder: integer("display_order").notNull().default(0),
    publishStatus: text("publish_status").notNull().$type<PublishStatus>().default("draft"),
    // JSON block tree: array of { id, component, props, children? } — each block
    // references a `component.name`; the renderer walks it and SSRs each artifact.
    blocks: text("blocks").notNull().default("[]"),
    // Per-locale SEO as JSON maps, e.g. { "en": "Welcome", "fi": "Tervetuloa" }.
    metaTitle: text("meta_title").notNull().default("{}"),
    metaDescription: text("meta_description").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  // Slug is unique per parent: two siblings can't share a slug, but the same
  // slug may repeat at different tree levels.
  (t) => [uniqueIndex("page_parent_slug_unique").on(t.parentPageId, t.slug)],
);

export type Component = typeof component.$inferSelect;
export type NewComponent = typeof component.$inferInsert;
export type Page = typeof page.$inferSelect;
export type NewPage = typeof page.$inferInsert;
