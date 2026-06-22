/**
 * PURE invite primitives for the per-Site CMS (cms-auth Slice 4).
 *
 * Mirrors PM's invite mechanics with country/tag SCOPE DROPPED (a single
 * deployed CMS = ONE Site). This module is the PURE half — NO `@/` imports, NO
 * CF bindings, NO Drizzle — so a bare `node --test` can load it directly (the
 * runner strips types but doesn't resolve the `@/` alias). The D1-bound half
 * lives in `db/invite-store.ts`.
 *
 * `CmsRole` is a TYPE-ONLY import (erased at runtime), so this module has no
 * runtime dependency on the schema.
 */
import type { CmsRole } from "../../db/schema.ts";

/** Invite lifetime: 7 days from creation (mirrors PM). */
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Opaque, URL-safe accept token: 32 random bytes, lowercase hex (64 chars). */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type InviteStatus = "valid" | "notFound" | "expired" | "accepted";

/** The minimal invite shape the status classifier needs. */
export type InviteRecord = {
  email: string;
  role: CmsRole;
  acceptedAt: number | null;
  expiresAt: number; // epoch ms
};

/**
 * Classify an invite row for the accept page / accept route. Pure so it's
 * node-testable without D1. `now` is injectable for tests. `null` row =
 * notFound.
 */
export function classifyInvite(
  invite: InviteRecord | null,
  now: number = Date.now(),
): InviteStatus {
  if (!invite) return "notFound";
  if (invite.acceptedAt != null) return "accepted";
  if (invite.expiresAt <= now) return "expired";
  return "valid";
}

/** Build a fresh invite's timestamps from `now` (pure; the store persists it). */
export function buildInviteTimes(now: number = Date.now()): {
  createdAt: number;
  expiresAt: number;
} {
  return { createdAt: now, expiresAt: now + INVITE_TTL_MS };
}
