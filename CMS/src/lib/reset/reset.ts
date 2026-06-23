import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { PasswordReset } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { classifyReset, type ResetStatus } from "./reset-logic";

/** Reset-token lifetime: 7 days (mirrors the invite TTL). */
export const RESET_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Opaque, URL-safe reset token (32 random bytes, hex). */
export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a single-use, time-boxed password-reset row for a user. */
export async function createPasswordReset(userId: string): Promise<PasswordReset> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.passwordReset)
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
async function findResetByToken(token: string): Promise<PasswordReset | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.passwordReset)
    .where(eq(schema.passwordReset.token, token))
    .limit(1);
  return row ?? null;
}

export type { ResetStatus };

/** Classify a reset token (mirror invite's `checkInvite`). */
export async function checkReset(
  token: string,
): Promise<{ status: ResetStatus; reset: PasswordReset | null }> {
  const reset = await findResetByToken(token);
  return { status: classifyReset(reset), reset };
}

export type ApplyResetResult = { ok: true } | { ok: false; reason: ResetStatus };

/**
 * Apply a password reset: re-validate the token, mark it used (single-use),
 * set a fresh hash on the user, and invalidate the user's existing sessions so
 * a leaked/old session can't survive the reset.
 *
 * The `usedAt` update is guarded by `isNull(usedAt)` so a concurrent
 * double-submit can't reuse the token — 0 rows updated ⇒ already used ⇒ reject.
 * The token is marked used BEFORE hashing/session-kill (TOCTOU-safe order).
 *
 * CMS sessions live in the D1 `session` table (NOT KV like PM), indexed by
 * `userId` (`session_user_idx`), so killing a user's sessions is a plain
 * indexed delete — no prefix scan needed.
 */
export async function applyReset(
  token: string,
  newPassword: string,
): Promise<ApplyResetResult> {
  const { status, reset } = await checkReset(token);
  if (status !== "valid" || !reset) return { ok: false, reason: status };

  const db = await getDb();
  // Single-use gate: only succeeds while usedAt is still NULL.
  const marked = await db
    .update(schema.passwordReset)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.passwordReset.id, reset.id),
        isNull(schema.passwordReset.usedAt),
      ),
    )
    .returning();
  if (marked.length === 0) return { ok: false, reason: "used" };

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.user)
    .set({ passwordHash })
    .where(eq(schema.user.id, reset.userId));

  // Invalidate all of the user's sessions (indexed delete by userId).
  await db.delete(schema.session).where(eq(schema.session.userId, reset.userId));

  return { ok: true };
}
