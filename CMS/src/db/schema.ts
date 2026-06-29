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
    // Handlebars-style HTML string the Worker parses to an element tree and SSRs
    // via React.createElement (a data walk — never eval'd). `{{prop}}` /
    // `{{t prop}}` slots are bound at render time. See lib/render/parse-html.ts.
    html: text("html").notNull().default(""),
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
    // AI-generated description of the image (epic: searchable media). Empty for
    // non-images or when the describe call failed. Matched by media search.
    description: text("description").notNull().default(""),
    // Operator-authored tags (JSON array of strings, like `component.tags`).
    // Also matched by media search.
    tags: text("tags").notNull().default("[]"),
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

/**
 * Saved system-prompt versions (ai-widget-ux — PM-SSO prompt editor). Per-Site
 * (the DB IS the Site boundary). Each row is a FULL prompt an operator saved to
 * compare; selecting one applies to the tester's SESSION ONLY (sent as a
 * per-request override), it never changes the site default real users get.
 * Shared by all PM-SSO operators on the site.
 */
export const promptVersion = sqliteTable("prompt_version", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default(""),
  prompt: text("prompt").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * API key — a per-Site bearer credential for the remote MCP server (cms-mcp).
 * A local agent (Claude Code) authenticates to THIS site's CMS Worker with
 * `Authorization: Bearer <key>`; the key authorizes managing this one Site only
 * (the DB IS the Site boundary). Only the HASH is stored — the plaintext key is
 * shown ONCE at creation and never recoverable. `revokedAt` set = denied.
 * `keyPrefix` is the leading public segment (e.g. `bzb_AbCd…`) for the admin list
 * so an operator can tell keys apart without ever seeing the secret.
 */
export const apiKey = sqliteTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    // SHA-256 hex of the full plaintext key. NEVER store the plaintext.
    keyHash: text("key_hash").notNull(),
    // Public, non-secret leading chars of the key (e.g. "bzb_AbCd1234") for the
    // admin list. Safe to show; not enough to authenticate.
    keyPrefix: text("key_prefix").notNull().default(""),
    // Operator-supplied label ("Vali's laptop"). Free text.
    label: text("label").notNull().default(""),
    // PM user id of the admin who minted it (from the cms-validate decision).
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // Last time this key authenticated a request; null = unused.
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    // Set when revoked; a non-null value denies the key. Null = active.
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("api_key_hash_unique").on(t.keyHash)],
);

/**
 * User — a first-class CMS user (cms-auth Slice 1). Until now the CMS had NO
 * local users (auth was 100% delegated to PM via cms-validate); this table gives
 * each per-Site CMS its OWN users so a client's team can log in directly.
 *
 * One UNIFIED table (Slice 0 decision): local email/password users, Google
 * users (Slice 2b), invited users, AND auto-provisioned PM-SSO operators all
 * live here. `passwordHash` is NULLABLE — SSO-only / Google-only users have no
 * local credential. `role` mirrors the pm-roles set (SuperAdmin|Admin|Manager|
 * Editor); country/tag SCOPE is dropped (a CMS = one Site). Default `Editor`
 * is the least-privilege fallback; auto-provisioned SSO users are set to Admin
 * explicitly by the SSO callback (Slice 2). The DB IS the Site boundary — no
 * siteId column.
 */
export type CmsRole = "SuperAdmin" | "Admin" | "Manager" | "Editor";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    // Login identity. Lowercased by the store before write; unique per Site.
    email: text("email").notNull(),
    // PBKDF2-100k self-describing hash (see lib/auth/password.ts). NULL for
    // SSO-only / Google-only users with no local password.
    passwordHash: text("password_hash"),
    // PM user id when this row was provisioned via the PM "Sign in with BizbeeCMS"
    // SSO handshake; NULL for local/Google-only users. This — NOT the email — is
    // the reliable PM-SSO marker (SSO rows are keyed on the operator's real email,
    // so the email suffix can't identify them). See lib/auth/pm-sso.isPmSsoUser.
    pmUserId: text("pm_user_id"),
    // pm-roles role NAME (no scope). New rows default to least-privilege.
    role: text("role").notNull().$type<CmsRole>().default("Editor"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

/**
 * Session — a CMS-local session record (cms-auth Slice 1). The CMS Worker has
 * NO KV binding (unlike PM, which uses KV `SESSIONS`), only D1, so sessions live
 * here: an opaque random id (the `bizbee_session` cookie value) → a row. The DB
 * is the source of truth, so logout (delete row) + expiry (`expiresAt` check)
 * are enforced server-side. The store sweeps expired rows opportunistically;
 * there's no KV-style auto-TTL on D1, so a row may outlive `expiresAt` until the
 * sweep (reads still reject it via isSessionValid). `userId` references
 * `user.id` (no FK so a user delete doesn't cascade silently — the app owns the
 * lifecycle).
 */
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

/**
 * Invite — a pending CMS-user invitation (cms-auth Slice 4). Mirrors PM's invite
 * shape with country/tag SCOPE DROPPED (a single deployed CMS = ONE Site). An
 * Admin/Manager invites by email + role; we email an accept link carrying the
 * opaque `token` (64 hex chars). The invitee opens it, sets a password (or links
 * Google, Slice 2b), and a `user` row is created with the invited `role`. The
 * email is unique among PENDING invites (enforced in the store, not a DB index —
 * an accepted invite keeps its row for history, so a re-invite is allowed once
 * the prior one is consumed). `acceptedAt` set = consumed; `expiresAt` is a
 * 7-day TTL like PM. `invitedBy` is the inviter's CMS user id (no FK — the app
 * owns lifecycle). The DB IS the Site boundary — no siteId column.
 */
export const invite = sqliteTable(
  "invite",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().$type<CmsRole>().default("Editor"),
    // Inviter's CMS user id (from the guard decision). No FK.
    invitedBy: text("invited_by").notNull(),
    // Opaque 64-hex accept token (32 random bytes). Unique so a token lookup is
    // unambiguous.
    token: text("token").notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("invite_token_unique").on(t.token),
    index("invite_email_idx").on(t.email),
  ],
);

/**
 * Collection — the canonical registry for a user-defined data collection
 * (content-collections goal, Slice 1). Each collection is backed by a REAL,
 * runtime-created D1 table named `content_<slug>` (the `tableName` here). This
 * registry row is the SOURCE OF TRUTH for the collection's logical schema — the
 * UI, the AI tools, and the runtime-DDL fence all read this, NOT `sqlite_master`
 * (CAVEAT: registry is canonical). `schema` is the JSON field list (each field:
 * `{ name, type, required, default, label, options? }`, type from the
 * propsSchema-style vocabulary) from which the SYSTEM generates the CREATE TABLE
 * DDL — nobody authors raw DDL. `collection` is on the fence's BUILTIN_DENYLIST,
 * so the runtime path can never touch this table. Hard cap of 100 collections
 * per Site is enforced against the row count here BEFORE any CREATE (Slice 2).
 */
export const collection = sqliteTable(
  "collection",
  {
    id: text("id").primaryKey(),
    // Operator-facing name ("Blog Posts"). Display only.
    name: text("name").notNull(),
    // The real D1 table name: always `content_<slug>` (fence-validated). Unique.
    tableName: text("table_name").notNull(),
    // JSON array of field descriptors — the canonical logical schema. The DDL
    // generator (`collection-schema.ts`) maps these to real typed columns.
    schema: text("schema").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("collection_table_name_unique").on(t.tableName)],
);

/**
 * Password reset token (auth-reset subgoal — CMS mirror of PM `password_resets`).
 * Mirrors the `invite` token pattern: a single-use, time-boxed token emailed to a
 * user who clicks "Forgot password?". Single-use = `usedAt IS NULL` gate; expiry =
 * `expiresAt`. On a valid reset we set a fresh PBKDF2 hash on the user, set
 * `usedAt`, and invalidate the user's sessions. Token lookup keys off the unique
 * `token` index. `userId` references `user.id` with an ON DELETE cascade FK (per
 * the auth-reset task spec) — a reset row has no meaning once its user is gone.
 */
export const passwordReset = sqliteTable(
  "password_reset",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Opaque 64-hex token (32 random bytes). Unique so a lookup is unambiguous.
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    // Set when consumed; single-use gate is `usedAt IS NULL`.
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("password_reset_token_unique").on(t.token)],
);

/**
 * Login attempt — a record of a FAILED CMS-local email/password login, for
 * brute-force throttling (cms-auth). Login had no rate limiting; without KV on
 * the CMS Worker, failures are counted in D1 over a sliding window (see
 * lib/auth/throttle-core.ts). Keyed by lowercased `email` only (IP is
 * unreliable on OpenNext). A successful login deletes the email's rows; the
 * store opportunistically prunes rows older than the window so this never grows
 * unbounded. No FK to `user` — we record attempts for unknown emails too (the
 * login API is non-enumerating, so the throttle can't reveal whether an email
 * exists). The DB IS the Site boundary — no siteId column.
 */
export const loginAttempt = sqliteTable(
  "login_attempt",
  {
    id: text("id").primaryKey(),
    // Lowercased email the failed/limited attempt targeted.
    email: text("email").notNull(),
    // Which surface the attempt is for, so login and forgot-password share the
    // table but have SEPARATE sliding-window namespaces (forgot-spam must not
    // lock out login, and vice versa). 'login' default keeps existing rows.
    kind: text("kind").notNull().default("login"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("login_attempt_email_kind_idx").on(t.email, t.kind)],
);

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
export type ApiKey = typeof apiKey.$inferSelect;
export type NewApiKey = typeof apiKey.$inferInsert;
export type PromptVersion = typeof promptVersion.$inferSelect;
export type NewPromptVersion = typeof promptVersion.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Invite = typeof invite.$inferSelect;
export type NewInvite = typeof invite.$inferInsert;
export type Collection = typeof collection.$inferSelect;
export type NewCollection = typeof collection.$inferInsert;
export type PasswordReset = typeof passwordReset.$inferSelect;
export type NewPasswordReset = typeof passwordReset.$inferInsert;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type NewLoginAttempt = typeof loginAttempt.$inferInsert;
