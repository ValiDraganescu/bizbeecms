import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * bizbeecms ProjectManager — D1 (SQLite) schema.
 *
 * Tables: users, invites, sites, site_users.
 * Roles: SuperAdmin (first registrant), Admin, Manager, Editor.
 * `country` scopes Admin/Manager; null = global. Editor reaches Sites only by
 * assignment (site_users) — it is the renamed old "SiteManager".
 */

export type Role = "SuperAdmin" | "Admin" | "Manager" | "Editor";
export type SiteStatus = "draft" | "deploying" | "deployed" | "failed";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().$type<Role>(),
    // Country scope is a SET, stored in `user_countries`. No rows = global
    // (all countries). See userCountries below.
    // Whether this Admin may invite further users. SuperAdmin always can.
    canInvite: integer("can_invite", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().$type<Role>(),
    // Country scope is a SET, stored in `invite_countries`. No rows = global
    // (all countries). See inviteCountries below.
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("invites_token_unique").on(t.token)],
);

/**
 * Self-serve password-reset tokens (auth-reset subgoal). Mirrors the `invites`
 * token pattern: a single-use, time-boxed token emailed to a user who clicks
 * "Forgot password?". Single-use = `usedAt IS NULL` gate; expiry = `expiresAt`.
 * On a valid reset we set a fresh PBKDF2 hash, set `usedAt`, and invalidate the
 * user's sessions. Token lookup keys off the unique `token` index.
 */
export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("password_resets_token_unique").on(t.token)],
);

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().$type<SiteStatus>().default("draft"),
    // When the current/last deploy was latched to `deploying`. Lets the UI flag
    // a deploy as stuck (deploying too long → container likely died, callback
    // never fired) and lets a stale deploy be restarted. Null = never deployed.
    deployStartedAt: integer("deploy_started_at", { mode: "timestamp_ms" }),
    // Cloudflare Worker name this Site's CMS is/will be deployed as.
    workerName: text("worker_name"),
    // The CMS release ref (git tag, e.g. `cms-v0.6.0`) this Site is currently
    // deployed from — recorded by the deploy callback on success. Null until the
    // first successful deploy. (cms-releases: shown in the site list + detail.)
    deployedCmsVersion: text("deployed_cms_version"),
    // This Site's OWN OpenRouter API key, AES-256-GCM encrypted at rest
    // (base64 iv‖ciphertext+tag — see src/lib/crypto/secret-box.ts). Decrypted
    // only at deploy time and sent to the deployer to set as a CMS Worker
    // secret. Null = no per-Site key (CMS falls back to its default provider).
    // Under the KEY-MINTING track this also holds the PM-MINTED `sk-or-...` key
    // (same AES-GCM box, no new crypto), replacing the old manual paste flow.
    openrouterApiKeyEncrypted: text("openrouter_api_key_encrypted"),
    // KEY-MINTING track: when true, PM auto-mints an OpenRouter key for this
    // Site at deploy time via the Provisioning API (idempotent — only when no
    // key exists yet). Default false = no minting (deployer global fallback).
    openrouterMintingEnabled: integer("openrouter_minting_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    // The minted key's hash returned by OpenRouter (`mintKey` → `{ key, hash }`).
    // Stored to target the key for DELETE and to detect "already minted" (skip
    // re-minting). Null = no minted key yet.
    openrouterKeyHash: text("openrouter_key_hash"),
    // Per-Site monthly spend cap (USD) for the minted key; maps to `mintKey`'s
    // `limit`. Null = no cap.
    openrouterMonthlyLimitUsd: integer("openrouter_monthly_limit_usd"),
    // Per-Site build-timeout OVERRIDE (minutes). The deployer kills a build that
    // runs longer (anti-stall — a hung build bills memory+disk on wall-clock).
    // The EFFECTIVE timeout is max(this, global) so a site can only RAISE the cap,
    // never drop below the global floor (see effectiveBuildTimeoutMin). Null =
    // use the global setting unchanged.
    buildTimeoutMin: integer("build_timeout_min"),
    country: text("country"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("sites_slug_unique").on(t.slug)],
);

/**
 * Customer-owned custom domains attached to a Site (Cloudflare-for-SaaS). The
 * deployer registers the hostname with CF + writes HOST_MAP KV; we ALSO persist
 * it here so PM can list a Site's domains (and re-show their DNS setup records)
 * across page loads — KV alone isn't queryable by Site. One Site → many domains
 * (e.g. apex + www). Routing DNS records are derived from the hostname; the
 * cert-validation TXT is volatile (CF-issued) and fetched on demand, not stored.
 */
export const siteDomains = sqliteTable(
  "site_domains",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    // NULL → this hostname SERVES the Site (proxied by the router). Set → this
    // hostname is a REDIRECT: the router 301s it to `redirectTo` (e.g. an apex
    // `example.com` redirecting to `www.example.com`). Either way the hostname is
    // still a CF-for-SaaS custom hostname (it needs a cert to reach our edge).
    redirectTo: text("redirect_to"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("site_domains_hostname_unique").on(t.hostname)],
);

export type SiteDomain = typeof siteDomains.$inferSelect;

/**
 * Per-step audit trail of a Site's CMS deploy (deploy-audit-trail subgoal).
 * The detached deployer bash script emits one row at the start and end of each
 * ordered step (clone/npm/build/provision/migrate/deploy) to PM's
 * `POST /api/deploy-events` (Bearer DEPLOYER_SECRET, service-to-service). Lets
 * operators see the timeline: step name, when it started, how long it took, and
 * any error text — instead of only the single terminal deploy-callback.
 */
export type DeployEventStatus = "started" | "ok" | "failed";

export const deployEvents = sqliteTable("deploy_events", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  // One id per deploy invocation (deployer mints a UUID per run), so the
  // timeline can show only the latest run's events. Nullable for pre-0004 rows.
  deployId: text("deploy_id"),
  step: text("step").notNull(),
  status: text("status").notNull().$type<DeployEventStatus>(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  // Null until the step ends (the `ok`/`failed` event carries the duration).
  durationMs: integer("duration_ms"),
  // Captured stderr/log tail on a failed step; null otherwise.
  error: text("error"),
  // Container MemAvailable (MB) sampled around the heavy build step; nullable.
  ramAvailableMb: integer("ram_available_mb"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const siteUsers = sqliteTable(
  "site_users",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);

/**
 * Country scope for a user: one row per country code. NO rows for a user means
 * global scope (all countries). `country` holds an ISO code from the fixed PM
 * set (see lib/auth/countries.ts).
 */
export const userCountries = sqliteTable(
  "user_countries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    country: text("country").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.country] })],
);

/** Country scope for an invite (copied to the user on accept). No rows = global. */
export const inviteCountries = sqliteTable(
  "invite_countries",
  {
    inviteId: text("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    country: text("country").notNull(),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.country] })],
);

/** Tag scope for an invite (copied to the user on accept; Manager invites only). */
export const inviteTags = sqliteTable(
  "invite_tags",
  {
    inviteId: text("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.tagId] })],
);

/**
 * Dynamic, MANAGED org tags (pm-roles Slice 3) — a SEPARATE dimension that lives
 * ALONGSIDE country (country stays exactly as it is; do NOT fold it into tags).
 * Admins CRUD this vocabulary (company group, TO channel, …) in Slice 3b. A Site
 * carries zero+ tags (`site_tags`); a Manager is scoped to zero+ tags (`user_tags`).
 * Manager reach = country-match AND tag-match (both dimensions; any-of within one).
 */
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("tags_label_unique").on(t.label)],
);

/** A Manager's tag scope: one row per tag. No rows = no tag reach (Manager only). */
export const userTags = sqliteTable(
  "user_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

/** A Site's tags: one row per tag. */
export const siteTags = sqliteTable(
  "site_tags",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.tagId] })],
);

/**
 * Global app settings — a tiny key/value store (one row per setting). Used for
 * operator-tunable values that aren't per-Site, currently just the global build
 * timeout. Key/value keeps it open for future settings without a migration each.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Setting key for the global build timeout (minutes), stored as a string in
// app_settings.value. Single source of truth for readers/writers.
export const BUILD_TIMEOUT_MIN_KEY = "build_timeout_min";

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type SiteUser = typeof siteUsers.$inferSelect;
export type NewSiteUser = typeof siteUsers.$inferInsert;
export type UserCountry = typeof userCountries.$inferSelect;
export type NewUserCountry = typeof userCountries.$inferInsert;
export type InviteCountry = typeof inviteCountries.$inferSelect;
export type NewInviteCountry = typeof inviteCountries.$inferInsert;
export type InviteTag = typeof inviteTags.$inferSelect;
export type NewInviteTag = typeof inviteTags.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type UserTag = typeof userTags.$inferSelect;
export type NewUserTag = typeof userTags.$inferInsert;
export type SiteTag = typeof siteTags.$inferSelect;
export type NewSiteTag = typeof siteTags.$inferInsert;
export type DeployEvent = typeof deployEvents.$inferSelect;
export type NewDeployEvent = typeof deployEvents.$inferInsert;
