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
 * Roles: SuperAdmin (first registrant), Admin, SiteManager.
 * `country` scopes Admin/SiteManager; null = global.
 */

export type Role = "SuperAdmin" | "Admin" | "SiteManager";
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

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().$type<SiteStatus>().default("draft"),
    // Cloudflare Worker name this Site's CMS is/will be deployed as.
    workerName: text("worker_name"),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type SiteUser = typeof siteUsers.$inferSelect;
export type NewSiteUser = typeof siteUsers.$inferInsert;
export type UserCountry = typeof userCountries.$inferSelect;
export type NewUserCountry = typeof userCountries.$inferInsert;
export type InviteCountry = typeof inviteCountries.$inferSelect;
export type NewInviteCountry = typeof inviteCountries.$inferInsert;
