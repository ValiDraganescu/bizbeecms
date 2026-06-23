import { and, eq, isNull } from "drizzle-orm";
// Relative imports (not `@/`) so this module LOADS under `node --test` native TS
// stripping. `getDb`/`session` pull in `@opennextjs/cloudflare`, so they're
// imported LAZILY (dynamic import only when no Db/invalidator is injected) — the
// same injected-seam pattern as deploy-events.ts. Tests drive the real fns over a
// fake D1 and a stub session-invalidator; prod uses the real ones.
import * as schema from "../../db/schema.ts";
import type { Db } from "../../db/index.ts";
import type { PasswordReset } from "../../db/schema.ts";
import { hashPassword } from "../auth/password.ts";
import { classifyReset, type ResetStatus } from "./reset-logic.ts";

/** Reset-token lifetime: 7 days (mirrors the invite TTL). */
export const RESET_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Lazily resolve the real request-scoped Db (pulls in CF context). */
async function resolveDb(injected?: Db): Promise<Db> {
  return injected ?? (await (await import("../../db/index.ts")).getDb());
}

/** Opaque, URL-safe reset token (32 random bytes, hex). */
export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a single-use, time-boxed password-reset row for a user. */
export async function createPasswordReset(
  userId: string,
  injectedDb?: Db,
): Promise<PasswordReset> {
  const db = await resolveDb(injectedDb);
  const [row] = await db
    .insert(schema.passwordResets)
    .values({
      id: crypto.randomUUID(),
      userId,
      token: newResetToken(),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    })
    .returning();
  return row;
}

/** Look up a reset row by its token. */
async function findResetByToken(
  token: string,
  db: Db,
): Promise<PasswordReset | null> {
  const [row] = await db
    .select()
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.token, token))
    .limit(1);
  return row ?? null;
}

export type { ResetStatus };

/** Classify a reset token (mirror invite's `checkInvite`). */
export async function checkReset(
  token: string,
  injectedDb?: Db,
): Promise<{ status: ResetStatus; reset: PasswordReset | null }> {
  const db = await resolveDb(injectedDb);
  const reset = await findResetByToken(token, db);
  return { status: classifyReset(reset), reset };
}

export type ApplyResetResult = { ok: true } | { ok: false; reason: ResetStatus };

/** Invalidate every session for a user (lazily resolves the real KV-backed fn). */
type SessionInvalidator = (userId: string) => Promise<void>;
async function resolveInvalidator(
  injected?: SessionInvalidator,
): Promise<SessionInvalidator> {
  return (
    injected ??
    (await import("../auth/session.ts")).invalidateUserSessions
  );
}

/**
 * Apply a password reset: re-validate the token, set a fresh hash on the user,
 * mark the token used (single-use), and invalidate the user's sessions so a
 * leaked/old session can't survive the reset. The `usedAt` update is guarded by
 * `isNull(usedAt)` so a concurrent double-submit can't reuse the token.
 *
 * The optional `deps` (Db + session invalidator) are the injected test seam.
 */
export async function applyReset(
  token: string,
  newPassword: string,
  deps?: { db?: Db; invalidateSessions?: SessionInvalidator },
): Promise<ApplyResetResult> {
  const db = await resolveDb(deps?.db);
  const { status, reset } = await checkReset(token, db);
  if (status !== "valid" || !reset) return { ok: false, reason: status };

  // Single-use gate: only succeeds while usedAt is still NULL.
  const marked = await db
    .update(schema.passwordResets)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.passwordResets.id, reset.id),
        isNull(schema.passwordResets.usedAt),
      ),
    )
    .returning();
  if (marked.length === 0) return { ok: false, reason: "used" };

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, reset.userId));

  const invalidateUserSessions = await resolveInvalidator(deps?.invalidateSessions);
  await invalidateUserSessions(reset.userId);
  return { ok: true };
}
