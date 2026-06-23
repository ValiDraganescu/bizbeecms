import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { PasswordReset } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { invalidateUserSessions } from "@/lib/auth/session";
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
async function findResetByToken(token: string): Promise<PasswordReset | null> {
  const db = await getDb();
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
): Promise<{ status: ResetStatus; reset: PasswordReset | null }> {
  const reset = await findResetByToken(token);
  return { status: classifyReset(reset), reset };
}

export type ApplyResetResult = { ok: true } | { ok: false; reason: ResetStatus };

/**
 * Apply a password reset: re-validate the token, set a fresh hash on the user,
 * mark the token used (single-use), and invalidate the user's sessions so a
 * leaked/old session can't survive the reset. The `usedAt` update is guarded by
 * `isNull(usedAt)` so a concurrent double-submit can't reuse the token.
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

  await invalidateUserSessions(reset.userId);
  return { ok: true };
}
