import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    // Source kit id ("blog"/"landing"/"docs") when this component was installed
    // as part of a premade kit; NULL for individually-imported / AI-authored
    // components. Lets the page-builder rail group components by their kit.
    sourceKit: text("source_kit"),
    // Free-form operator labels for kit-building (component-kits goal). JSON string
    // array, e.g. `["marketing","dark"]`. Drives export-by-tag and the admin filter.
    // ponytail: JSON array column + autocomplete from distinctTags; a managed tag
    // table only if a real governance need shows up.
    tags: text("tags").notNull().default("[]"),
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
    // Per-locale OpenGraph image URL (R2 asset url), e.g. { "en": "https://…/x.png" }.
    metaImage: text("meta_image").notNull().default("{}"),
    // PAGE VERSIONING (slice 1): pointers into `page_version`. `draftVersionId`
    // is the currently-editable version; `publishedVersionId` is the live one.
    // Nullable so existing rows backfill safely (no FK — the app resolves them).
    // `page.blocks`/`publishStatus` stay authoritative until later slices migrate
    // readers; these pointers are additive this slice.
    draftVersionId: text("draft_version_id"),
    publishedVersionId: text("published_version_id"),
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

/**
 * Page version — a snapshot of a page's blocks + meta (PAGE VERSIONING slice 1).
 * A page keeps history here: `status:"draft"` is the editable working copy,
 * `status:"published"` is a frozen published snapshot. `versionNo` is the
 * monotonic published sequence (drafts use 0). `meta` is a JSON blob of the
 * per-locale SEO maps {metaTitle,metaDescription,metaImage,…} captured at save
 * time. `page.draftVersionId`/`publishedVersionId` point at rows here. No FK so
 * deleting a page doesn't cascade silently — the app owns the lifecycle.
 */
export const pageVersion = sqliteTable(
  "page_version",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    blocks: text("blocks").notNull().default("[]"),
    // JSON snapshot of the page's per-locale meta maps at this version.
    meta: text("meta").notNull().default("{}"),
    status: text("status").notNull().$type<PublishStatus>().default("draft"),
    // Monotonic published sequence (1,2,3…); drafts carry 0.
    versionNo: integer("version_no").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  // Index by page for "list this page's versions" reads. NOT unique: a page can
  // accumulate multiple draft rows (publish leaves the old draft as history) so
  // (pageId,status,versionNo) is NOT a key (drafts all share versionNo 0).
  (t) => [index("page_version_page_idx").on(t.pageId)],
);

/**
 * Site settings — a generic key→value (JSON text) store for per-Site config
 * that isn't pages or components (Milestone 2, epic C1+). First use: the
 * data-driven content-locale set (`content_locales`, distinct from the fixed
 * EN/FI/ET admin UI). Also the home for later E1/E2 (theme overrides, brand
 * identity, AI persona). Lives in the per-Site D1 — the DB IS the Site boundary,
 * so settings aren't site-scoped. Mined from aicms `siteSettings`.
 */
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  // JSON string. Parse defensively at read time (see settings-store).
  value: text("value").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Asset — metadata for a media file stored in the per-Site R2 bucket (the
 * `MEDIA` binding; Milestone 2, epic D1). The bytes live in R2 under `key`;
 * this row lets the gallery list assets without an R2 LIST call and gives the
 * AI/user a stable public URL (`/_assets/<key>`, served by the worker) to
 * reference in component artifacts. R2 is Workers-native, so no presigning /
 * AWS creds (unlike aicms, which runs off-Cloudflare).
 */
export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    // R2 object key (also the public URL segment). Unique per Site.
    key: text("key").notNull(),
    // Original upload filename (for display in the gallery).
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("asset_key_unique").on(t.key)],
);

/**
 * Chat thread — a saved AI-assistant conversation (Milestone 2, ai-assistant
 * goal, Slice 4). Per-Site (the DB IS the Site boundary, like every other table
 * here), so threads aren't site-scoped. `messages` is the JSON transcript
 * (`[{role, content}, ...]` — tool cards are derived client-side and not stored;
 * only the text is needed to reseed a conversation). `title` is derived from the
 * first user message at save time. Defensive parse on read (see chat-history-store).
 */
export const chatThread = sqliteTable("chat_thread", {
  id: text("id").primaryKey(),
  // Short label for the history list, derived from the first user message.
  title: text("title").notNull().default(""),
  // JSON array of { role, content } — the transcript text to reseed `useChat`.
  messages: text("messages").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Component = typeof component.$inferSelect;
export type NewComponent = typeof component.$inferInsert;
export type Page = typeof page.$inferSelect;
export type NewPage = typeof page.$inferInsert;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type NewAsset = typeof asset.$inferInsert;
export type ChatThread = typeof chatThread.$inferSelect;
export type NewChatThread = typeof chatThread.$inferInsert;
export type PageVersion = typeof pageVersion.$inferSelect;
export type NewPageVersion = typeof pageVersion.$inferInsert;
